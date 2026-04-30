import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export default function ResetPassword() {
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [done, setDone]           = useState(false)
  const { setRecoveryMode }       = useAuth()
  const { t } = useTranslation()

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) { setError(t('reset.mismatch')); return }
    setLoading(true); setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message); return }
    setDone(true)
    setTimeout(() => setRecoveryMode(false), 1500)
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>H</div>
        <h1 style={styles.title}>Hacienda</h1>
        <p style={styles.sub}>{t('reset.sub')}</p>

        {done ? (
          <p style={{ color: 'var(--pos)', fontSize: 14, textAlign: 'center' }}>{t('reset.success')}</p>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label}>{t('reset.password')}</label>
            <input style={styles.input} type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required minLength={6} autoFocus />

            <label style={styles.label}>{t('reset.confirm')}</label>
            <input style={styles.input} type="password" value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••" required minLength={6} />

            {error && <p style={styles.error}>{error}</p>}

            <button style={styles.btn} type="submit" disabled={loading}>
              {loading ? t('reset.saving') : t('reset.save')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

const styles = {
  page:  { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-0)' },
  card:  { width: 360, padding: '40px 36px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  logo:  { width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg,var(--accent),var(--accent-2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: '#fff', marginBottom: 4 },
  title: { margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--ink-0)', letterSpacing: '-0.02em' },
  sub:   { margin: '2px 0 20px', fontSize: 13, color: 'var(--ink-3)', textAlign: 'center' },
  form:  { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginTop: 6 },
  input: { width: '100%', boxSizing: 'border-box', height: 40, padding: '0 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--ink-0)', fontSize: 14, outline: 'none' },
  error: { fontSize: 12, color: 'var(--neg)', margin: '4px 0 0' },
  btn:   { marginTop: 8, height: 40, background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
}
