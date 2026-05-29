import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import AdminApp from './pages/AdminApp'
import StaffApp from './pages/StaffApp'
import SetupPage from './pages/SetupPage'
import ResetPasswordPage from './pages/ResetPasswordPage'

function AppRoutes() {
  const { staff, loading } = useAuth()
  const location = useLocation()

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error)
    }
  }, [])

  // Always show reset page when on /reset-password route
  if (location.pathname === '/reset-password') {
    return <ResetPasswordPage />
  }

  if (loading) return (
    <div style={{
      minHeight: '100vh', background: '#1A2340',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16,
    }}>
      <div style={{ fontSize: 48 }}>🍽</div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Laden...</div>
    </div>
  )

  if (!staff) return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route path="*" element={<LoginPage />} />
    </Routes>
  )

  return (
    <Routes>
      <Route path="/admin/*" element={
        staff.is_admin ? <AdminApp /> : <Navigate to="/rooster" />
      } />
      <Route path="/rooster/*" element={
        staff.is_admin ? <Navigate to="/admin" /> : <StaffApp />
      } />
      <Route path="*" element={
        <Navigate to={staff.is_admin ? '/admin' : '/rooster'} />
      } />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
