import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import { useAccounts } from '../hooks/useAccounts'
import { useCategories, buildCategoryTree } from '../hooks/useCategories'
import { useHousehold } from '../lib/household'

const FREQUENCIES = [
  'weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'yearly',
]

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function initForm(rule, defaultPerson) {
  if (!rule) return {
    name: '', amount: '', type: 'expense', frequency: 'monthly',
    anchor_date: today(), ends_on: '', account_id: '', category_id: '',
    person: defaultPerson, is_variable: false, is_active: true,
  }
  return {
    name:        rule.name || '',
    // Stored as a positive magnitude; direction lives in `type`.
    amount:      Math.abs(Number(rule.amount)).toString(),
    type:        rule.type || 'expense',
    frequency:   rule.frequency || 'monthly',
    anchor_date: rule.anchor_date || today(),
    ends_on:     rule.ends_on || '',
    account_id:  rule.account_id || '',
    category_id: rule.category_id || '',
    person:      rule.person || defaultPerson,
    is_variable: rule.is_variable === true,
    is_active:   rule.is_active !== false,
  }
}

/**
 * Create or edit a scheduled obligation — the rule itself, not a payment
 * against it. An obligation can exist before it has ever been paid; that is the
 * whole point of declaring one.
 */
export default function ObligationModal({ rule, onClose, onSave, onDelete }) {
  const { t } = useTranslation()
  const { accounts }   = useAccounts()
  const { categories } = useCategories()
  const { myName, members } = useHousehold()

  const [form, setForm]   = useState(() => initForm(rule, myName || 'Shared'))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const [confirmDel, setConfirmDel] = useState(false)

  const isEdit = Boolean(rule?.id)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { parents, childrenOf } = useMemo(
    () => buildCategoryTree(categories || []), [categories])
  const people = useMemo(() => {
    const names = (members || []).map(m => m.display_name).filter(Boolean)
    return [...new Set([...names, 'Shared'])]
  }, [members])

  const activeAccounts = (accounts || []).filter(a => a.is_active !== false)
  const currency = activeAccounts.find(a => a.id === form.account_id)?.currency

  async function submit(e) {
    e.preventDefault()
    setError(null)

    const amount = parseFloat(form.amount)
    if (!form.name.trim())          return setError(t('obligation.errName'))
    if (!amount || amount <= 0)     return setError(t('obligation.errAmount'))
    if (!form.anchor_date)          return setError(t('obligation.errAnchor'))
    if (form.ends_on && form.ends_on < form.anchor_date)
      return setError(t('obligation.errEnds'))

    setSaving(true)
    try {
      await onSave({
        name:        form.name.trim(),
        amount:      Math.abs(amount),
        type:        form.type,
        frequency:   form.frequency,
        anchor_date: form.anchor_date,
        ends_on:     form.ends_on || null,
        account_id:  form.account_id || null,
        category_id: form.category_id || null,
        person:      form.person || null,
        is_variable: form.is_variable,
        is_active:   form.is_active,
      })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose} title={isEdit ? t('obligation.editTitle') : t('obligation.title')}>
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="form-grid">

            <div className="form-field span-2">
              <label htmlFor="ob-name">{t('obligation.name')}</label>
              <input id="ob-name" name="name" value={form.name} autoFocus
                placeholder={t('obligation.namePlaceholder')}
                onChange={e => set('name', e.target.value)} />
            </div>

            <div className="form-field">
              <label htmlFor="ob-type">{t('obligation.type')}</label>
              <select id="ob-type" name="type" value={form.type}
                onChange={e => set('type', e.target.value)}>
                <option value="expense">{t('obligation.expense')}</option>
                <option value="income">{t('obligation.income')}</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="ob-amount">
                {t('obligation.amount')}{currency ? ` (${currency})` : ''}
              </label>
              <input id="ob-amount" name="amount" type="number" step="0.01" min="0"
                value={form.amount} placeholder="0.00"
                onChange={e => set('amount', e.target.value)} />
            </div>

            <div className="form-field">
              <label htmlFor="ob-frequency">{t('obligation.frequency')}</label>
              <select id="ob-frequency" name="frequency" value={form.frequency}
                onChange={e => set('frequency', e.target.value)}>
                {FREQUENCIES.map(f => (
                  <option key={f} value={f}>{t(`obligation.freq.${f}`)}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="ob-anchor">{t('obligation.anchor')}</label>
              <input id="ob-anchor" name="anchor_date" type="date" value={form.anchor_date}
                onChange={e => set('anchor_date', e.target.value)} />
              <span className="field-hint">{t('obligation.anchorHint')}</span>
            </div>

            <div className="form-field">
              <label htmlFor="ob-account">{t('obligation.account')}</label>
              <select id="ob-account" name="account_id" value={form.account_id}
                onChange={e => set('account_id', e.target.value)}>
                <option value="">{t('obligation.accountNone')}</option>
                {activeAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="ob-category">{t('obligation.category')}</label>
              <select id="ob-category" name="category_id" value={form.category_id}
                onChange={e => set('category_id', e.target.value)}>
                <option value="">{t('obligation.categoryNone')}</option>
                {parents.map(parent => {
                  const children = childrenOf[parent.id]
                  return children?.length ? (
                    <optgroup key={parent.id} label={parent.name}>
                      {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  ) : (
                    <option key={parent.id} value={parent.id}>{parent.name}</option>
                  )
                })}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="ob-person">{t('obligation.person')}</label>
              <select id="ob-person" name="person" value={form.person}
                onChange={e => set('person', e.target.value)}>
                {people.map(p => (
                  <option key={p} value={p}>{p === 'Shared' ? t('obligation.shared') : p}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="ob-ends">{t('obligation.endsOn')}</label>
              <input id="ob-ends" name="ends_on" type="date" value={form.ends_on}
                onChange={e => set('ends_on', e.target.value)} />
              <span className="field-hint">{t('obligation.endsHint')}</span>
            </div>

            <div className="form-field span-2">
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" name="is_variable" checked={form.is_variable}
                  onChange={e => set('is_variable', e.target.checked)}
                  style={{ width: 'auto', height: 'auto' }} />
                {t('obligation.variable')}
              </label>
              <span className="field-hint">{t('obligation.variableHint')}</span>
            </div>

            {isEdit && (
              <div className="form-field span-2">
                <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" name="is_active" checked={form.is_active}
                    onChange={e => set('is_active', e.target.checked)}
                    style={{ width: 'auto', height: 'auto' }} />
                  {t('obligation.active')}
                </label>
                <span className="field-hint">{t('obligation.activeHint')}</span>
              </div>
            )}

          </div>
          {error && <p style={{ color: 'var(--neg)', fontSize: 12, marginTop: 12 }}>{error}</p>}
        </div>

        <div className="modal-footer">
          {isEdit && onDelete && (
            confirmDel ? (
              <button type="button" className="btn ghost"
                style={{ marginRight: 'auto', color: 'var(--neg)' }}
                onClick={async () => { await onDelete(rule.id); onClose() }}>
                {t('obligation.confirmDelete')}
              </button>
            ) : (
              <button type="button" className="btn ghost"
                style={{ marginRight: 'auto', color: 'var(--neg)' }}
                onClick={() => setConfirmDel(true)}>
                {t('obligation.delete')}
              </button>
            )
          )}
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('obligation.cancel')}
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? t('obligation.saving') : isEdit ? t('obligation.saveEdit') : t('obligation.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
