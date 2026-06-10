import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import AdminApp from './pages/AdminApp'
import StaffApp from './pages/StaffApp'
import SetupPage from './pages/SetupPage'
import ResetPasswordPage from './pages/ResetPasswordPage'

// Wrapper: StaffApp in voorbeeldmodus voor admins, met terug-balk
function StaffPreview() {
  const navigate = useNavigate()
  return (
    <div>
      <div style={{
        background: '#C4882A', color: '#fff', padding: '8px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 13, fontWeight: 700, position: 'sticky', top: 0, zIndex: 1000,
        fontFamily: "'DM Sans','Segoe UI',sans-serif",
      }}>
        <span>👁 Je bekijkt de app als personeel (voorbeeldmodus)</span>
        <button onClick={() => navigate('/admin')}
          style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff',
            padding: '6px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer',
            fontSize: 13, fontFamily: 'inherit' }}>
          ← Terug naar beheer
        </button>
      </div>
      <StaffApp />
    </div>
  )
}

function AppRoutes() {
  const { staff, loading } = useAuth()
  const location = useLocation()
  const isPreview = new URLSearchParams(location.search).get('preview') === '1'

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
        staff.is_admin
          ? (isPreview ? <StaffPreview /> : <Navigate to="/admin" />)
          : <StaffApp />
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
