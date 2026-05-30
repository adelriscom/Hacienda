import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import { useAccounts } from '../hooks/useAccounts'
import { useCategories, buildCategoryTree } from '../hooks/useCategories'
import { useHousehold } from '../lib/household'

const today = () => new Date().toISOString().slice(0, 10)

function initForm(tx, defaultPerson = 'Alexander') {
  if (!tx) return {
    occurred_at: today(), description: '', amount: '', type: 'expense',
    account_id: '', to_account_id: '', category_id: '', person: defaultPerson,
    notes: '', is_recurring: false, status: 'match',
  }
  return {
    occurred_at:    new Date(tx.occurred_at).toISOString().slice(0, 10),
    description:    tx.description || '',
    amount:         Math.abs(tx.amount).toString(),
    type:           tx.type || 'expense',
    account_id:     tx.account_id || '',
    to_account_id:  '',
    category_id:    tx.category_id || '',
    person:         tx.person || defaultPerson,
    notes:          tx.notes || '',
    is_recurring:   tx.is_recurring || false,
    status:         tx.status || 'review',
  }
}

export default function NewTransactionModal({ onClose, onSave, onSavePair, onUpdate, onDelete, onDeletePair, transaction, defaults }) {
  const { accounts } = useAccounts()
  const { categories } = useCategories()
  const { t } = useTranslation()
  const { myName } = useHousehold()
  const isEdit = !!transaction

  const [form, setForm]       = useState(() => ({ ...initForm(transaction, myName || 'Alexander'), ...defaults }))
  const [saving, setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [error, setError]     = useState(null)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.description || !form.amount) {
      setError(t('newTx.required')); return
    }
    setSaving(true); setError(null)
    try {
      const occurred_at  = new Date(form.occurred_at + 'T12:00:00').toISOString()
      const absAmount    = Math.abs(parseFloat(form.amount))
      const signedAmount = form.type === 'expense' || form.type === 'transfer'
        ? -absAmount : absAmount

      const payload = {
        occurred_at,
        description:  form.description,
        amount:       signedAmount,
        type:         form.type,
        account_id:   form.account_id || null,
        category_id:  form.category_id || null,
        person:       form.person,
        notes:        form.notes || null,
        is_recurring: form.is_recurring,
        status:       isEdit ? form.status : 'match',
      }

      if (isEdit) {
        await onUpdate(transaction.id, payload)
      } else if (form.type === 'transfer' && form.to_account_id && onSavePair) {
        // Create both legs linked by a shared transfer_group_id
        const transfer_group_id = crypto.randomUUID()
        const outgoing = { ...payload, transfer_group_id }
        const incoming = {
          occurred_at,
          description:       form.description,
          amount:            absAmount,
          type:              'transfer',
          account_id:        form.to_account_id,
          category_id:       null,
          person:            form.person,
          notes:             form.notes || null,
          is_recurring:      false,
          status:            'match',
          transfer_group_id,
        }
        await onSavePair([outgoing, incoming])
      } else {
        await onSave(payload)
      }
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true); setError(null)
    try {
      if (transaction.partner_id && onDeletePair) {
        await onDeletePair(transaction.id, transaction.partner_id)
      } else {
        await onDelete(transaction.id)
      }
      onClose()
    } catch (err) {
      setError(err.message)
      setDeleting(false)
    }
  }

  const cadAccounts = accounts.filter(a => a.currency === 'CAD' && a.is_active)
  const copAccounts = accounts.filter(a => a.currency === 'COP' && a.is_active)

  const { parents, childrenOf, leafCategories } = useMemo(() => buildCategoryTree(categories), [categories])

  const types = [
    ['expense', t('newTx.expense')],
    ['income',  t('newTx.income')],
    ['transfer',t('newTx.transfer')],
  ]

  const statuses = [
    ['match',     t('newTx.statusMatch')],
    ['review',    t('newTx.statusReview')],
    ['ghost',     t('newTx.statusGhost')],
    ['duplicate', t('newTx.statusDuplicate')],
  ]

  return (
    <Modal title={isEdit ? t('newTx.editTitle') : t('newTx.title')} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="modal-body">
          <div className="form-grid">

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

            {/* Transfer: show paired partner when editing, or From/To pickers when creating */}
            {form.type === 'transfer' && isEdit && transaction.partner_account && (
              <div className="span-2" style={{
                display: 'flex', gap: 10, alignItems: 'center',
                background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.25)',
                borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--ink-1)',
              }}>
                <span style={{ fontSize: 14 }}>⇄</span>
                <span>Paired with <strong>{transaction.partner_account.name}</strong> — both legs will be deleted together.</span>
              </div>
            )}
            {form.type === 'transfer' && !isEdit && (
              <div className="form-field span-2">
                <label htmlFor="tx-to-account">To account <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 400 }}>(optional — links both legs)</span></label>
                <select id="tx-to-account" value={form.to_account_id} onChange={e => set('to_account_id', e.target.value)}>
                  <option value="">Leave unlinked</option>
                  {cadAccounts.length > 0 && (
                    <optgroup label="CAD">
                      {cadAccounts.filter(a => a.id !== form.account_id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </optgroup>
                  )}
                  {copAccounts.length > 0 && (
                    <optgroup label="COP">
                      {copAccounts.filter(a => a.id !== form.account_id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
            )}

            <div className="form-field">
              <label htmlFor="tx-date">{t('newTx.date')}</label>
              <input id="tx-date" name="occurred_at" type="date" value={form.occurred_at}
                onChange={e => set('occurred_at', e.target.value)} required />
            </div>

            <div className="form-field">
              <label htmlFor="tx-amount">{t('newTx.amount')}</label>
              <input id="tx-amount" name="amount" type="number" min="0" step="0.01" placeholder="0.00"
                value={form.amount} onChange={e => set('amount', e.target.value)} required />
            </div>

            <div className="form-field span-2">
              <label htmlFor="tx-desc">{t('newTx.description')}</label>
              <input id="tx-desc" name="description" type="text" placeholder={t('newTx.descriptionPlaceholder')}
                value={form.description} onChange={e => set('description', e.target.value)} required />
            </div>

            <div className="form-field">
              <label htmlFor="tx-account">{form.type === 'transfer' ? 'From account' : t('newTx.account')}</label>
              <select id="tx-account" name="account_id" value={form.account_id} onChange={e => set('account_id', e.target.value)}>
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

            <div className="form-field">
              <label htmlFor="tx-category">{t('newTx.category')}</label>
              <select id="tx-category" name="category_id" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
                <option value="">{t('newTx.categorySelect')}</option>
                {parents.map(parent => {
                  const children = childrenOf[parent.id]
                  if (children && children.length > 0) {
                    return (
                      <optgroup key={parent.id} label={parent.name}>
                        {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </optgroup>
                    )
                  }
                  return <option key={parent.id} value={parent.id}>{parent.name}</option>
                })}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="tx-person">{t('newTx.person')}</label>
              <select id="tx-person" name="person" value={form.person} onChange={e => set('person', e.target.value)}>
                <option value="Alexander">Alexander</option>
                <option value="Marcela">Marcela</option>
                <option value="Shared">{t('newTx.shared')}</option>
              </select>
            </div>

            {isEdit && (
              <div className="form-field">
                <label htmlFor="tx-status">{t('newTx.status')}</label>
                <select id="tx-status" name="status" value={form.status} onChange={e => set('status', e.target.value)}>
                  {statuses.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            )}

            <div className="form-field" style={{ justifyContent: 'flex-end' }}>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_recurring}
                  onChange={e => set('is_recurring', e.target.checked)}
                  style={{ width: 'auto', height: 'auto' }} />
                {t('newTx.recurring')}
              </label>
            </div>

            <div className="form-field span-2">
              <label htmlFor="tx-notes">{t('newTx.notes')}</label>
              <textarea id="tx-notes" name="notes" placeholder={t('newTx.notesPlaceholder')}
                value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>

          </div>
          {error && <p style={{ color: 'var(--neg)', fontSize: 12, marginTop: 12 }}>{error}</p>}
        </div>

        <div className="modal-footer">
          {isEdit && !confirmDel && (
            <button type="button" className="btn ghost"
              style={{ marginRight: 'auto', color: 'var(--neg)' }}
              onClick={() => setConfirmDel(true)}>
              {t('newTx.delete')}
            </button>
          )}
          {isEdit && confirmDel && (
            <button type="button" className="btn ghost"
              style={{ marginRight: 'auto', color: 'var(--neg)' }}
              onClick={handleDelete} disabled={deleting}>
              {deleting ? '…' : transaction.partner_id ? 'Delete both legs?' : t('newTx.confirmDelete')}
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>{t('newTx.cancel')}</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? t('newTx.saving') : isEdit ? t('newTx.saveEdit') : t('newTx.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
