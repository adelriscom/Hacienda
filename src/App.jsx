import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import Login from './screens/Login'
import Shell from './components/Shell'

function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--ink-2)' }}>Cargando…</div>
  return session ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={
            <RequireAuth>
              <Shell />
            </RequireAuth>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
