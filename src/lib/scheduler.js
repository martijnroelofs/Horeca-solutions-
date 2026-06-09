// --- RoosterAI Schedule Generation Engine ------------------------------------
// Rules:
// 1. Max maxDaysPerWeek days per staff member
// 2. Max contract hours + maxOvertimeHours per week
// 3. Minimum minRestHours between end of one shift and start of next
// 4. On busy/peak days: +1 per dept
// 5. Capacity scores prioritised on peak days
// 6. Recurring & date-specific template slots
// 7. Holiday overrides or closed days
// 8. Contract type awareness (oproep = flexible, stagiair = limited)
// 9. Previous week overtime compensation

const DEPT_KEYS = ['bar', 'wijkloper', 'runner', 'keuken', 'spoelkeuken']

function parseTime(timeStr) {
  // "08:00" → minutes from midnight
  if (!timeStr) return 0
  const parts = timeStr.split(':').map(Number)
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0
  return parts[0] * 60 + parts[1]
}

function shiftHours(shift) {
  if (!shift) return 0
  const start = parseTime(shift.start_time)
  const end = parseTime(shift.end_time)
  return ((end - start) - shift.break_minutes) / 60
}

function hasMinRest(lastEnd, nextStart, minRestHours) {
  // lastEnd & nextStart are "HH:MM" strings on potentially different dates
  // We check by minutes — if nextStart is earlier than lastEnd we assume next day
  const last = parseTime(lastEnd)
  let next = parseTime(nextStart)
  if (next < last) next += 24 * 60 // next day
  return (next - last) >= (minRestHours * 60)
}

function getEffectiveMaxHours(staff, settings, otHistory) {
  const base = staff.contract_type === 'min_max'
    ? staff.max_hours
    : staff.contract_hours || 20

  const ot = otHistory[staff.id] || 0
  // Compensation principle (tijd-voor-tijd):
  // - No OT: staff can work up to contract + allowed overtime
  // - With OT: directly subtract accumulated OT from the ceiling so they work
  //   fewer hours in following weeks until the OT balance is cleared.
  // Floor at 50% of contract so they aren't fully removed in a single week.
  const ceiling = base + settings.max_overtime_hours - ot
  const floor = Math.round(base * 0.5)
  return Math.max(floor, ceiling)
}

function getContractMax(staff) {
  if (staff.contract_type === 'stagiair') return staff.contract_hours || 16
  if (staff.contract_type === 'min_max') return staff.max_hours || 32
  if (staff.contract_type === 'oproep') return 40 // flexible
  return staff.contract_hours || 20
}

export function generateSchedule({
  staff,
  shiftTemplates,      // { name: { start_time, end_time, break_minutes } }
  templateSlots,       // [{ day_of_week, dept, shift_name, count, is_recurring, specific_date }]
  peakMoments,         // [{ date, slots }] — date-specific peaks
  recurringPeaks = { 4:4, 5:7, 6:2 }, // { dayIndex: slotBitmask } — weekly recurring peaks
  holidays,            // [{ date, is_closed, holiday_slots: [{dept, shift_name, count}] }]
  availabilityPatterns, // { staffId: { dayOfWeek: slots_bitmask } }
  availabilityOverrides, // { staffId: { date: slots_bitmask } }
  leaveRequests,       // approved: [{ staff_id, date }]
  capacityScores,      // { staffId: { dept: score } }
  weekDates,           // ['2025-05-05', ..., '2025-05-11'] — 7 dates Mon-Sun
  settings = {},
  otHistory = {},      // { staffId: hoursOT }
  fixedAssignments = {}, // { staffId: { dayOfWeek: { dept, shift_name } } }
}) {
  const {
    max_days_per_week = 5,
    max_overtime_hours = 4,
    min_rest_hours = 11,
  } = settings

  // Result: { staffId: [shift_name|null × 7] }
  const schedule = {}
  staff.forEach(s => { schedule[s.id] = Array(7).fill(null) })

  // Track hours planned per staff this week
  const hoursPlanned = {}
  staff.forEach(s => { hoursPlanned[s.id] = 0 })

  // Track last shift end time per staff (for rest check)
  const lastShiftEnd = {} // { staffId: 'HH:MM' }

  // Build leave set
  const leaveSet = new Set(
    (leaveRequests || [])
      .filter(l => l.status === 'approved')
      .map(l => `${l.staff_id}-${l.date}`)
  )

  // Process each day
  weekDates.forEach((date, di) => {
    const dayOfWeek = di // 0=Mon

    // Check holiday
    const holiday = (holidays || []).find(h => h.date === date)
    if (holiday?.is_closed) return // skip day entirely

    // Check peak — date-specific OR recurring weekday
    const peak = (peakMoments || []).find(p => p.date === date)
    const recurringPeak = recurringPeaks[dayOfWeek]
    const isPeak = !!(peak || recurringPeak)

    // Get slots for this day
    let daySlots
    if (holiday && !holiday.is_closed && holiday.holiday_slots?.length) {
      // Holiday override slots
      daySlots = holiday.holiday_slots
    } else {
      // Template slots: recurring for this weekday + date-specific
      daySlots = (templateSlots || []).filter(s =>
        (s.is_recurring && s.day_of_week === dayOfWeek) ||
        (!s.is_recurring && s.specific_date === date)
      )
      // On peak days: no count bump, just prioritise by capacity score (handled in sort below)
    }

    // Process each dept slot
    DEPT_KEYS.forEach(dk => {
      const deptSlots = daySlots.filter(s => s.dept === dk)
      for (const slot of deptSlots) {
        const shift = shiftTemplates[slot.shift_name]
        if (!shift) return

        const slotBit = slot.shift_name === 'Ochtend' ? 1
          : slot.shift_name === 'Middag' ? 2
          : slot.shift_name === 'Avond' ? 4
          : slot.shift_name === 'Dubbel' ? 7
          : slot.shift_name === 'Split' ? 3
          : 7

        const shiftDuration = shiftHours(shift)

        // ── Apply fixed assignments first ──────────────────────────
        // Check if any staff member has a fixed assignment for this exact slot
        const fixedForSlot = staff.filter(s => {
          const fa = fixedAssignments[s.id]?.[dayOfWeek]
          return fa && fa.dept === dk && fa.shift_name === slot.shift_name &&
            s.is_active && s.depts?.includes(dk) &&
            schedule[s.id][di] === null
        })
        let fixedAssigned = 0
        if (fixedForSlot.length > 0) {
          fixedForSlot.forEach(s => {
            if (fixedAssigned >= slot.count) return
            // Check leave
            if (leaveSet.has(`${s.id}-${date}`)) return
            // Check max days
            const daysAssigned = schedule[s.id].filter(Boolean).length
            if (daysAssigned >= max_days_per_week) return
            // Check availability
            const patternBits = availabilityPatterns?.[s.id]?.[dayOfWeek] ?? 0
            const overrideBits = availabilityOverrides?.[s.id]?.[date]
            const availBits = overrideBits !== undefined ? overrideBits : patternBits
            if (availBits === 0) return
            if (lastShiftEnd[s.id]) {
              const endMins = parseTime(lastShiftEnd[s.id])
              const startMins = parseTime(shift.start_time)
              const restHours = (startMins + 1440 - endMins) % 1440 / 60
              if (restHours < minRestHours) return
            }
            schedule[s.id][di] = slot.shift_name
            hoursPlanned[s.id] += shiftHours(shift)  // uses break_minutes correctly
            lastShiftEnd[s.id] = shift.end_time
            fixedAssigned++
          })
        }
        const slotRemaining = slot.count - fixedAssigned
        if (slotRemaining <= 0) { /* fully filled by fixed assignments */ }
        else {

        // Find eligible staff
        const pool = staff.filter(s => {
          if (!s.is_active) return false
          if (!s.depts?.includes(dk)) return false
          if (schedule[s.id][di] !== null && schedule[s.id][di] !== undefined) return false // already assigned today — no double booking
          if (leaveSet.has(`${s.id}-${date}`)) return false

          // Days count check
          const daysAssigned = schedule[s.id].filter(Boolean).length
          if (daysAssigned >= max_days_per_week) return false

          // Hours check
          const effectiveMax = getEffectiveMaxHours(s, { max_overtime_hours }, otHistory)
          if (hoursPlanned[s.id] + shiftDuration > effectiveMax) return false

          // Availability check
          const patternBits = availabilityPatterns?.[s.id]?.[dayOfWeek] ?? 0
          const overrideBits = availabilityOverrides?.[s.id]?.[date]
          const availBits = overrideBits !== undefined ? overrideBits : patternBits
          if (!availBits) return false
          if (availBits !== 7 && !(availBits & slotBit)) return false

          // Minimum rest check
          if (lastShiftEnd[s.id]) {
            if (!hasMinRest(lastShiftEnd[s.id], shift.start_time, min_rest_hours)) {
              return false
            }
          }

          // Contract type: stagiairs max 8h/day, oproep always eligible
          if (s.contract_type === 'stagiair' && shiftDuration > 8) return false

          return true
        })

        // Sort based on scheduleMode:
        // 0=min cost (cheapest staff first), 100=max quality (best capacity score first)
        // Also respect pref_min/max_days as soft rules
        // On peak days: always prioritise by capacity score regardless of scheduleMode
        const qualityWeight = isPeak ? 1.0 : (settings.scheduleMode ?? 50) / 100
        // Normalize hourly rates across the pool to a 0-10 scale so cost and
        // quality (capacity score, also 0-10) carry equal weight at scheduleMode=50.
        const rates = pool.map(s => s.hourly_rate || 12)
        const minRate = Math.min(...rates)
        const maxRate = Math.max(...rates)
        const rateRange = maxRate - minRate || 1
        // cheapnessScore: 10 = cheapest, 0 = most expensive
        const cheapness = s => 10 - ((s.hourly_rate || 12) - minRate) / rateRange * 10

        pool.sort((a, b) => {
          // HARD priority: staff with accumulated overtime go LAST
          // (so they get fewer shifts and their OT balance can be compensated)
          const aOT = otHistory[a.id] || 0
          const bOT = otHistory[b.id] || 0
          if (Math.abs(aOT - bOT) > 0.5) return aOT - bOT  // lower OT first

          // Soft rule: prefer staff who haven't reached pref_min_days yet
          const aDays = schedule[a.id].filter(Boolean).length
          const bDays = schedule[b.id].filter(Boolean).length
          const aPrefMin = a.pref_min_days || 1
          const bPrefMin = b.pref_min_days || 1
          const aNeedsMore = aDays < aPrefMin ? 1 : 0
          const bNeedsMore = bDays < bPrefMin ? 1 : 0
          if (aNeedsMore !== bNeedsMore) return bNeedsMore - aNeedsMore

          // Both factors on a 0-10 scale
          const aScore = capacityScores?.[a.id]?.[dk] ?? 5
          const bScore = capacityScores?.[b.id]?.[dk] ?? 5
          // Combined score: weighted blend of quality and cheapness
          // scheduleMode=100 → pure quality, =0 → pure cheapness
          const aCombined = aScore * qualityWeight + cheapness(a) * (1 - qualityWeight)
          const bCombined = bScore * qualityWeight + cheapness(b) * (1 - qualityWeight)
          return bCombined - aCombined  // highest combined score first
        })

        // Filter out staff who exceeded pref_max_days (soft rule - only if enough alternatives)
        const withinPref = pool.filter(s => {
          // Double-check not already assigned today (safety guard)
          if (schedule[s.id][di] !== null) return false
          const days = schedule[s.id].filter(Boolean).length
          return days < (s.pref_max_days || settings.max_days_per_week || 5)
        })
        const finalPool = withinPref.length >= slot.count ? withinPref : pool

        // Assign up to slot.count staff members
        let assigned = 0
        finalPool.forEach(s => {
          if (assigned >= slot.count) return
          schedule[s.id][di] = slot.shift_name
          hoursPlanned[s.id] += shiftDuration
          lastShiftEnd[s.id] = shift.end_time
          assigned++
        })
        } // end else pool assignment
      } // end for slot of deptSlots
    }) // end DEPT_KEYS.forEach
  }) // end weekDates.forEach

  // Calculate overtime per staff
  const weekOT = {}
  staff.forEach(s => {
    const planned = hoursPlanned[s.id]
    const contractH = getContractMax(s)
    const ot = Math.max(0, planned - contractH)
    const prevOT = otHistory[s.id] || 0
    const compensation = planned < contractH ? Math.max(0, prevOT - (contractH - planned)) : prevOT
    weekOT[s.id] = ot > 0 ? prevOT + ot : compensation
  })

  return { schedule, hoursPlanned, weekOT }
}

// --- Financial calculations ---------------------------------------------------
export function calcFinancials(staff, schedule, shiftTemplates, weekDates, holidays) {
  const festDates = new Set(
    (holidays || [])
      .filter(h => !h.is_closed)
      .map(h => h.date)
  )

  const rows = staff.filter(s => s.is_active).map(s => {
    const row = schedule[s.id] || Array(7).fill(null)
    let hours = 0, cost = 0, festHours = 0, otHours = 0

    row.forEach((shiftName, di) => {
      if (!shiftName) return
      const shift = shiftTemplates[shiftName]
      if (!shift) return
      const h = shiftHours(shift)
      const date = weekDates[di]
      const isFest = festDates.has(date)
      const rate = s.hourly_rate || 0  // guard against null/undefined
      hours += h
      if (isFest) {
        festHours += h
        cost += h * rate * 1.5
      } else {
        cost += h * rate
      }
    })

    const contractH = getContractMax(s)
    otHours = Math.max(0, hours - contractH)
    // OT surcharge (0.5× extra) for non-feestdag OT
    const otExtra = Math.max(0, otHours - festHours) * (s.hourly_rate || 0) * 0.5
    cost += otExtra

    return {
      id: s.id,
      name: s.name,
      color: s.color,
      depts: s.depts,
      contract_type: s.contract_type,
      hours,
      contractHours: contractH,
      otHours,
      festHours,
      cost,
      hourlyRate: s.hourly_rate,
    }
  })

  return {
    rows,
    totalHours: rows.reduce((a, r) => a + r.hours, 0),
    totalCost: rows.reduce((a, r) => a + r.cost, 0),
    totalOT: rows.reduce((a, r) => a + r.otHours, 0),
    totalFestHours: rows.reduce((a, r) => a + r.festHours, 0),
    festDates,
  }
}
