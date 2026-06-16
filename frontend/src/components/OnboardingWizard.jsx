import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import Icon from './Icon'
import { CURRENCIES } from '../lib/currency'

const STEPS = ['welcome', 'account', 'done']

const ACCOUNT_TYPES = [
  ['checking',   'Checking'],
  ['savings',    'Savings'],
  ['credit',     'Credit Card'],
  ['investment', 'Investment'],
  ['cash',       'Cash'],
]

export default function OnboardingWizard({ onClose, onOpenImport, addAccount }) {
  const { t } = useTranslation()
  const [step, setStep]     = useState('welcome')
  const [form, setForm]     = useState({ name: '', type: 'checking', currency: 'CAD', balance: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const stepIdx = STEPS.indexOf(step)

  const TITLES = { welcome: 'Welcome to Hacienda', account: 'Add your first account', done: "You're all set!" }

  async function handleAddAccount() {
    if (!form.name.trim()) { setError('Account name is required'); return }
    setSaving(true); setError(null)
    try {
      await addAccount({
        name:      form.name.trim(),
        type:      form.type,
        currency:  form.currency,
        balance:   parseFloat(form.balance) || 0,
        is_active: true,
      })
      setStep('done')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={TITLES[step]} onClose={onClose}>

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '4px 0 0' }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{
            width: i <= stepIdx ? 20 : 6,
            height: 6,
            borderRadius: 3,
            background: i <= stepIdx ? 'var(--accent)' : 'var(--bg-3)',
            transition: 'width 0.25s ease, background 0.25s ease',
          }} />
        ))}
      </div>

      <div className="modal-body">

        {/* ── Step 1: Welcome ── */}
        {step === 'welcome' && (
          <div className="onboarding-body-center">
            <div className="onboarding-icon accent" style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.04em' }}>H</div>
            <h3>Let's get you set up</h3>
            <p>Hacienda needs at least one account to start tracking your finances. It only takes about 30 seconds.</p>
          </div>
        )}

        {/* ── Step 2: Add Account ── */}
        {step === 'account' && (
          <div className="form-grid">
            <div className="form-field span-2">
              <label htmlFor="ob-name">Account name</label>
              <input id="ob-name" name="name" type="text"
                placeholder="e.g. TD Chequing, Scotiabank Savings…"
                value={form.name} onChange={e => set('name', e.target.value)}
                autoFocus />
            </div>
            <div className="form-field">
              <label htmlFor="ob-type">Type</label>
              <select id="ob-type" name="type" value={form.type} onChange={e => set('type', e.target.value)}>
                {ACCOUNT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="ob-currency">Currency</label>
              <select id="ob-currency" name="currency" value={form.currency} onChange={e => set('currency', e.target.value)}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
              </select>
            </div>
            <div className="form-field span-2">
              <label htmlFor="ob-balance">Current balance</label>
              <input id="ob-balance" name="balance" type="number" step="0.01" placeholder="0.00"
                value={form.balance} onChange={e => set('balance', e.target.value)} />
            </div>
            {error && <p className="span-2" style={{ color: 'var(--neg)', fontSize: 12, margin: '4px 0 0' }}>{error}</p>}
          </div>
        )}

        {/* ── Step 3: Done ── */}
        {step === 'done' && (
          <div className="onboarding-body-center">
            <div className="onboarding-icon success">
              <Icon name="check" size={28} strokeWidth={2.5} />
            </div>
            <h3>Account added!</h3>
            <p>You can now track your finances. Import a bank statement to get started right away, or add transactions manually.</p>
          </div>
        )}

      </div>

      <div className="modal-footer">
        {step === 'welcome' && <>
          <button className="btn ghost" onClick={onClose}>Skip for now</button>
          <button className="btn primary" onClick={() => setStep('account')}>Get started</button>
        </>}

        {step === 'account' && <>
          <button className="btn ghost" onClick={() => { setError(null); setStep('welcome') }}>Back</button>
          <button className="btn ghost" onClick={onClose} style={{ marginLeft: 'auto' }}>Skip</button>
          <button className="btn primary" onClick={handleAddAccount} disabled={saving}>
            {saving ? 'Saving…' : 'Add account'}
          </button>
        </>}

        {step === 'done' && <>
          <button className="btn ghost" onClick={() => { onClose(); onOpenImport() }}>Import a statement</button>
          <button className="btn primary" onClick={onClose}>Go to dashboard</button>
        </>}
      </div>

    </Modal>
  )
}
