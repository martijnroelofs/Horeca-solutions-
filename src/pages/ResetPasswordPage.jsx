import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const C = {
  ink: '#1A2340', gold: '#C4882A', white: '#FFFFFF',
  border: '#DDD8CC', inkMuted: '#8A90A8', jade: '#2A7D5C',
  crimson: '#A8281C',
}

const btn = (extra={}) => ({
  border: 'none', borderRadius: 12, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', transition: 'all .18s', ...extra
})

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Check if we already have a recovery session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })

    // Also listen for the PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setReady(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < 6) { setError('Wachtwoord moet minimaal 6 tekens zijn'); return }
    if (password !== confirm) { setError('Wachtwoorden komen niet overeen'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError('Fout: ' + error.message)
      setLoading(false)
    } else {
      setDone(true)
      // Sign out so user can log in fresh
      await supabase.auth.signOut()
      setTimeout(() => { window.location.href = '/' }, 2000)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: C.ink,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: "'DM Sans','Segoe UI',sans-serif",
    }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 22, background: C.gold,
          fontSize: 32, margin: '0 auto 14px', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 50px ${C.gold}55`,
        }}>🍽</div>
        <div style={{ color: C.white, fontSize: 28, fontWeight: 900 }}>RoosterAI</div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 6 }}>
          Wachtwoord instellen
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 360 }}>
        {done ? (
          <div style={{ textAlign: 'center', color: C.white }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Wachtwoord ingesteld!</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>
              Je wordt doorgestuurd naar de loginpagina...
            </div>
          </div>
        ) : !ready ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', padding: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            Bezig met laden...
            <div style={{ marginTop: 20 }}>
              <button onClick={() => setReady(true)}
                style={{ ...btn(), background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)',
                  padding: '8px 16px', fontSize: 12 }}>
                Toch doorgaan →
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 6, letterSpacing: '0.04em' }}>
                NIEUW WACHTWOORD
              </div>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Minimaal 6 tekens" required autoFocus
                style={{ width: '100%', padding: '12px 14px', borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.07)', color: C.white,
                  fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box' }}/>
            </div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 6, letterSpacing: '0.04em' }}>
                BEVESTIG WACHTWOORD
              </div>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Herhaal wachtwoord" required
                style={{ width: '100%', padding: '12px 14px', borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.07)', color: C.white,
                  fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box' }}/>
            </div>
            {error && (
              <div style={{ background: 'rgba(168,40,28,0.2)', border: '1px solid rgba(168,40,28,0.4)',
                borderRadius: 10, padding: '10px 14px', marginBottom: 16,
                color: '#FF8C72', fontSize: 13, fontWeight: 600 }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: 14, borderRadius: 12, border: 'none',
              background: loading ? 'rgba(255,255,255,0.2)' : C.gold,
              color: C.white, fontSize: 15, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}>
              {loading ? 'Opslaan...' : 'Wachtwoord instellen'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
