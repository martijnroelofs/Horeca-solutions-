import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [staff, setStaff] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadStaff(session.user)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        setLoading(true)
        loadStaff(session.user)
      } else {
        setStaff(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadStaff(user) {
    if (!user) { setStaff(null); setLoading(false); return }

    // Try to find by auth_id first
    const { data: byAuthId } = await supabase
      .from('staff')
      .select('*')
      .eq('auth_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (byAuthId) {
      setStaff(byAuthId)
      setLoading(false)
      return
    }

    // Try to link by email (staff created before they logged in)
    const { data: byEmail } = await supabase
      .from('staff')
      .select('*')
      .eq('email', user.email)
      .is('auth_id', null)
      .eq('is_active', true)
      .maybeSingle()

    if (byEmail) {
      await supabase.from('staff').update({ auth_id: user.id }).eq('id', byEmail.id)
      setStaff({ ...byEmail, auth_id: user.id })
      setLoading(false)
      return
    }

    // No staff record found
    setStaff(null)
    setLoading(false)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signOut() {
    setStaff(null)
    setLoading(false)
    await supabase.auth.signOut({ scope: 'local' })
    // Clear all local storage to prevent session caching issues
    localStorage.clear()
    sessionStorage.clear()
    window.location.href = '/'
  }

  return (
    <AuthContext.Provider value={{ session, staff, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
