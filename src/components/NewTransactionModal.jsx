import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import { useAccounts } from '../hooks/useAccounts'
import { useCategories } from '../hooks/useCategories'

const today = () => new Date().toISOString().slice(0, 10)

export default function NewTransactionModal({ onClose, onSave }) {
  const { accounts } = useAccounts()
  const { categories } = useCategories()
  const { t } = useTranslation()

  const [form, setForm] = useState({
    occurred_at: today(),
    description: '',
    amount: '',
    type: 'expense',
    account_id: '',
    category_id: '',
    person: 'Alexander',
    notes: '',
    is_recurring: false,
    status: 'match',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.description || !form.amount || !form.account_id) {
      setError(t('newTx.required'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const signedAmount = form.type === 'expense' || form.type === 'transfer'
        ? -Math.abs(parseFloat(form.amount))
        :  Math.abs(parseFloat(form.amount))

      await onSave({
        occurred_at:  new Date(form.occurred_at + 'T12:00:00').toISOString(),
        description:  form.description,
        amount:       signedAmount,
        type:         form.type,
        account_id:   form.account_id,
        category_id:  form.category_id || null,
        person:       form.person,
        notes:        form.notes || null,
        is_recurring: form.is_recurring,
        status:       'match',
      })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const cadAccounts = accounts.filter(a => a.currency === 'CAD')
  const copAccounts = accounts.filter(a => a.currency === 'COP')

  const types = [
    ['expense',  t('newTx.expense')],
    ['income',   t('newTx.income')],
    ['transfer', t('newTx.transfer')],
  ]

  return (
    <Modal title={t('newTx.title')} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="modal-body">
          <div className="form-grid">

            {/* Type */}
            <div className="form-field span-2">
              <label>{t('newTx.type')}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {types.map(([v, l]) => (
                  <button key={v} type="button"
                    style={{
                      flex: 1, height: 34, borderRadius: 8, border: '1px solid',
                      borderColor: form.type === v ? 'var(--accent)' : 'var(--border)',
                      background:  form.type === v ? 'rgba(99,102,241,.12)' : 'var(--bg-2)',
                      color:       form.type === v ? 'var(--accent)' : 'var(--ink-2)',
                      fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    }}
                    onClick={() => set('type', v)}>{l}</button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div className="form-field">
              <label>{t('newTx.date')}</label>
              <input type="date" value={form.occurred_at}
                onChange={e => set('occurred_at', e.target.value)} required />
            </div>

            {/* Amount */}
            <div className="form-field">
              <label>{t('newTx.amount')}</label>
              <input type="number" min="0" step="0.01" placeholder="0.00"
                value={form.amount} onChange={e => set('amount', e.target.value)} required />
            </div>

            {/* Description */}
            <div className="form-field span-2">
              <label>{t('newTx.description')}</label>
              <input type="text" placeholder={t('newTx.descriptionPlaceholder')}
                value={form.description} onChange={e => set('description', e.target.value)} required />
            </div>

            {/* Account */}
            <div className="form-field">
              <label>{t('newTx.account')}</label>
              <select value={form.account_id} onChange={e => set('account_id', e.target.value)} required>
                <option value="">{t('newTx.accountSelect')}</option>
                {cadAccounts.length > 0 && (
                  <optgroup label="CAD">
                    {cadAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </optgroup>
                )}
                {copAccounts.length > 0 && (
                  <optgroup label="COP">
                    {copAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Category */}
            <div className="form-field">
              <label>{t('newTx.category')}</label>
              <select value={form.category_id} onChange={e => set('category_id', e.target.value)}>
                <option value="">{t('newTx.categorySelect')}</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Person */}
            <div className="form-field">
              <label>{t('newTx.person')}</label>
              <select value={form.person} onChange={e => set('person', e.target.value)}>
                <option value="Alexander">Alexander</option>
                <option value="Marcela">Marcela</option>
                <option value="Shared">{t('newTx.shared')}</option>
              </select>
            </div>

            {/* Recurring */}
            <div className="form-field" style={{ justifyContent: 'flex-end' }}>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_recurring}
                  onChange={e => set('is_recurring', e.target.checked)}
                  style={{ width: 'auto', height: 'auto' }} />
                {t('newTx.recurring')}
              </label>
            </div>

            {/* Notes */}
            <div className="form-field span-2">
              <label>{t('newTx.notes')}</label>
              <textarea placeholder={t('newTx.notesPlaceholder')}
                value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>

          </div>
          {error && <p style={{ color: 'var(--neg)', fontSize: 12, marginTop: 12 }}>{error}</p>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn ghost" onClick={onClose}>{t('newTx.cancel')}</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? t('newTx.saving') : t('newTx.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
