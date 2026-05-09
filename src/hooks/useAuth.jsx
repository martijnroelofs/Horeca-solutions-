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
      if (session) loadStaff(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) loadStaff(session.user.id)
      else { setStaff(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadStaff(authId) {
    // First try to find by auth_id
    let { data } = await supabase
      .from('staff')
      .select('*')
      .eq('auth_id', authId)
      .single()

    // If not found, try to link by email (for staff created without auth account)
    if (!data) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        const { data: staffByEmail } = await supabase
          .from('staff')
          .select('*')
          .eq('email', user.email)
          .is('auth_id', null)
          .single()
        if (staffByEmail) {
          // Link auth_id to this staff record
          await supabase.from('staff').update({ auth_id: authId }).eq('id', staffByEmail.id)
          data = { ...staffByEmail, auth_id: authId }
        }
      }
    }

    setStaff(data)
    setLoading(false)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setStaff(null)
  }

  return (
    <AuthContext.Provider value={{ session, staff, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
