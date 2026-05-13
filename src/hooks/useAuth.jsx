import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [staff, setStaff] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        loadStaff(session.user)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (event === 'SIGNED_IN' && session) {
        setLoading(true)
        setStaff(null)
        loadStaff(session.user)
      } else if (event === 'SIGNED_OUT') {
        setStaff(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadStaff(user) {
    if (!user) { setStaff(null); setLoading(false); return }

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

    // Link by email for staff without auth_id
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

    setStaff(null)
    setLoading(false)
  }

  async function signIn(email, password) {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setLoading(false)
    return { error }
  }

  async function signOut() {
    setStaff(null)
    setLoading(false)
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb-') || key.includes('supabase')) localStorage.removeItem(key)
    })
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, staff, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
