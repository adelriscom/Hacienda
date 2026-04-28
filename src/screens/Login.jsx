import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'

export default function Login() {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const fn = mode === 'login'
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password })
    const { error } = await fn
    setLoading(false)
    if (error) { setError(error.message); return }
    navigate('/', { replace: true })
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>H</div>
        <h1 style={styles.title}>Hacienda</h1>
        <p style={styles.sub}>Control familiar de finanzas</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            <Icon name="mail" size={14} style={{ color: 'var(--ink-3)' }} />
            Correo electrónico
          </label>
          <input
            style={styles.input}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            required
            autoFocus
          />

          <label style={styles.label}>
            <Icon name="lock" size={14} style={{ color: 'var(--ink-3)' }} />
            Contraseña
          </label>
          <input
            style={styles.input}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
          />

          {error && <p style={styles.error}>{error}</p>}

          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Procesando…' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>

        <p style={styles.toggle}>
          {mode === 'login' ? '¿Sin cuenta?' : '¿Ya tienes cuenta?'}{' '}
          <button style={styles.link} onClick={() => { setMode(m => m === 'login' ? 'signup' : 'login'); setError(null) }}>
            {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
          </button>
        </p>
      </div>
    </div>
  )
}

const styles = {
  page:   { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-0)' },
  card:   { width: 360, padding: '40px 36px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  logo:   { width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg,var(--accent),var(--accent-2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: '#fff', marginBottom: 4 },
  title:  { margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--ink-0)', letterSpacing: '-0.02em' },
  sub:    { margin: '2px 0 20px', fontSize: 13, color: 'var(--ink-3)' },
  form:   { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  label:  { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginTop: 6 },
  input:  { width: '100%', boxSizing: 'border-box', height: 40, padding: '0 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--ink-0)', fontSize: 14, outline: 'none' },
  error:  { fontSize: 12, color: 'var(--neg)', margin: '4px 0 0' },
  btn:    { marginTop: 8, height: 40, background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  toggle: { marginTop: 16, fontSize: 13, color: 'var(--ink-3)' },
  link:   { background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, fontWeight: 500, padding: 0 },
}
