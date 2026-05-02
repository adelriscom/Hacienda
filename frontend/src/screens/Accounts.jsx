import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Icon from '../components/Icon'
import Topbar from '../components/Topbar'
import Modal from '../components/Modal'
import { useAccounts } from '../hooks/useAccounts'

const TYPE_ICON = {
  checking:   'account',
  savings:    'piggy',
  credit:     'card',
  investment: 'trend-up',
  cash:       'cash',
}

const TYPE_COLOR = {
  checking:   'var(--accent)',
  savings:    'var(--pos)',
  credit:     'var(--warn)',
  investment: 'var(--accent-2)',
  cash:       'var(--ink-2)',
}

export default function Accounts() {
  const { accounts, loading, addAccount, updateAccount, toggleActive } = useAccounts()
  const { t } = useTranslation()
  const [editing, setEditing]         = useState(null)
  const [showInactive, setShowInactive] = useState(false)

  const inactiveCount   = accounts.filter(a => !a.is_active).length
  const visibleAccounts = showInactive ? accounts : accounts.filter(a => a.is_active)
  const cadAccounts = visibleAccounts.filter(a => a.currency === 'CAD')
  const copAccounts = visibleAccounts.filter(a => a.currency === 'COP')

  const activeAccounts = accounts.filter(a => a.is_active)
  const cadNet = activeAccounts.filter(a => a.currency === 'CAD').reduce((s, a) => s + (a.balance || 0), 0)
  const copNet = activeAccounts.filter(a => a.currency === 'COP').reduce((s, a) => s + (a.balance || 0), 0)
  const fmtCAD = n => '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtCOP = n => '$ ' + Math.round(n).toLocaleString('es-CO')

  const { cadInterestCost, cadInterestReturn, copInterestCost, copInterestReturn } = activeAccounts.reduce((acc, a) => {
    if (!a.interest_rate || a.interest_rate <= 0) return acc
    const rate = a.interest_rate / 100 / 12
    if (a.type === 'credit' && (a.balance || 0) < 0) {
      if (a.currency === 'CAD') acc.cadInterestCost += Math.abs(a.balance) * rate
      else acc.copInterestCost += Math.abs(a.balance) * rate
    } else if ((a.type === 'savings' || a.type === 'investment') && (a.balance || 0) > 0) {
      if (a.currency === 'CAD') acc.cadInterestReturn += a.balance * rate
      else acc.copInterestReturn += a.balance * rate
    }
    return acc
  }, { cadInterestCost: 0, cadInterestReturn: 0, copInterestCost: 0, copInterestReturn: 0 })

  return (
    <>
      <Topbar greet={t('acct.title')} date={t('acct.subtitle', { total: accounts.length })}>
        {inactiveCount > 0 && (
          <button className="btn ghost sm" onClick={() => setShowInactive(v => !v)}>
            {showInactive ? t('acct.hideInactive') : t('acct.showInactive', { count: inactiveCount })}
          </button>
        )}
        <button className="btn primary sm" onClick={() => setEditing('new')}>
          <Icon name="plus" size={12} /> {t('acct.addBtn')}
        </button>
      </Topbar>

      {/* Net worth summary */}
      {!loading && activeAccounts.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {cadAccounts.length > 0 && (
            <div className="card" style={{ flex: 1, padding: '14px 18px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', marginBottom: 6 }}>
                CAD Net Worth
              </div>
              <div className="num" style={{ fontSize: 22, fontWeight: 700, color: cadNet >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                {fmtCAD(cadNet)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
                {cadAccounts.length} active account{cadAccounts.length !== 1 ? 's' : ''}
              </div>
              {cadInterestCost > 0 && (
                <div style={{ fontSize: 11, color: 'var(--warn)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>Est. interest cost:</span>
                  <span className="num" style={{ fontWeight: 600 }}>{fmtCAD(cadInterestCost)}/mo</span>
                </div>
              )}
              {cadInterestReturn > 0 && (
                <div style={{ fontSize: 11, color: 'var(--pos)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>Est. return:</span>
                  <span className="num" style={{ fontWeight: 600 }}>{fmtCAD(cadInterestReturn)}/mo</span>
                </div>
              )}
            </div>
          )}
          {copAccounts.length > 0 && (
            <div className="card" style={{ flex: 1, padding: '14px 18px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', marginBottom: 6 }}>
                COP Net Worth
              </div>
              <div className="num" style={{ fontSize: 22, fontWeight: 700, color: copNet >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                {fmtCOP(copNet)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
                {copAccounts.length} active account{copAccounts.length !== 1 ? 's' : ''}
              </div>
              {copInterestCost > 0 && (
                <div style={{ fontSize: 11, color: 'var(--warn)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>Est. interest cost:</span>
                  <span className="num" style={{ fontWeight: 600 }}>{fmtCOP(copInterestCost)}/mo</span>
                </div>
              )}
              {copInterestReturn > 0 && (
                <div style={{ fontSize: 11, color: 'var(--pos)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>Est. return:</span>
                  <span className="num" style={{ fontWeight: 600 }}>{fmtCOP(copInterestReturn)}/mo</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>{t('acct.loading')}</div>
      ) : accounts.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-3)' }}>{t('acct.empty')}</div>
      ) : (
        <>
          {cadAccounts.length > 0 && (
            <AccountGroup currency="CAD" label={t('acct.cadSection')} accounts={cadAccounts}
              onEdit={setEditing} onToggle={toggleActive} t={t} />
          )}
          {copAccounts.length > 0 && (
            <AccountGroup currency="COP" label={t('acct.copSection')} accounts={copAccounts}
              onEdit={setEditing} onToggle={toggleActive} t={t} />
          )}
        </>
      )}

      {editing !== null && (
        <AccountModal
          account={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            if (editing === 'new') await addAccount(values)
            else await updateAccount(editing.id, values)
            setEditing(null)
          }}
          t={t}
        />
      )}
    </>
  )
}

function AccountGroup({ currency, label, accounts, onEdit, onToggle, t }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em',
        color: 'var(--ink-3)', marginBottom: 10, paddingLeft: 2,
      }}>
        {label}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 10,
      }}>
        {accounts.map(a => <AccountCard key={a.id} account={a} onEdit={onEdit} onToggle={onToggle} t={t} />)}
      </div>
    </div>
  )
}

function AccountCard({ account: a, onEdit, onToggle, t }) {
  const color = TYPE_COLOR[a.type] || 'var(--ink-2)'
  const icon  = TYPE_ICON[a.type]  || 'account'

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${a.is_active ? 'var(--line)' : 'var(--line)'}`,
      borderRadius: 'var(--r-md)',
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      opacity: a.is_active ? 1 : 0.45,
      transition: 'opacity .2s',
    }}>
      {/* Type icon */}
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: `${color}1a`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color,
      }}>
        <Icon name={icon} size={16} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {a.name}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10.5, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
            background: `${color}22`, color,
          }}>
            {t('acct.types.' + a.type)}
          </span>
          {!a.is_active && (
            <span style={{
              fontSize: 10.5, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
              background: 'var(--bg-2)', color: 'var(--ink-3)',
            }}>
              {t('acct.inactive')}
            </span>
          )}
          {a.interest_rate > 0 && (
            <span style={{
              fontSize: 10.5, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
              background: a.type === 'credit' ? 'var(--warn-soft)' : 'var(--pos-soft)',
              color: a.type === 'credit' ? 'var(--warn)' : 'var(--pos)',
            }}>
              {a.interest_rate}% APR
            </span>
          )}
        </div>
        {a.interest_rate > 0 && (() => {
          const rate = a.interest_rate / 100 / 12
          const bal  = a.balance || 0
          if (a.type === 'credit' && bal < 0) {
            const est = Math.abs(bal) * rate
            return (
              <div style={{ fontSize: 10.5, color: 'var(--warn)', marginTop: 3 }}>
                Est. {a.currency === 'CAD'
                  ? '$' + est.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : '$ ' + Math.round(est).toLocaleString('es-CO')}/mo interest
              </div>
            )
          }
          if ((a.type === 'savings' || a.type === 'investment') && bal > 0) {
            const est = bal * rate
            return (
              <div style={{ fontSize: 10.5, color: 'var(--pos)', marginTop: 3 }}>
                Est. {a.currency === 'CAD'
                  ? '$' + est.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : '$ ' + Math.round(est).toLocaleString('es-CO')}/mo return
              </div>
            )
          }
          return null
        })()}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button className="icon-btn sm-btn" title={t('acct.editBtn')} onClick={() => onEdit(a)}>
          <Icon name="edit" size={14} />
        </button>
        <button
          className="icon-btn sm-btn"
          title={a.is_active ? t('acct.deactivate') : t('acct.activate')}
          style={{ color: a.is_active ? 'var(--pos)' : 'var(--ink-3)' }}
          onClick={() => onToggle(a.id, a.is_active)}
        >
          <Icon name={a.is_active ? 'toggle-on' : 'toggle-off'} size={16} />
        </button>
      </div>
    </div>
  )
}

const EMPTY_FORM = { name: '', type: 'checking', currency: 'CAD', balance: '', credit_limit: '', interest_rate: '', is_active: true }

function AccountModal({ account, onClose, onSave, t }) {
  const [form, setForm] = useState(account
    ? { name: account.name, type: account.type, currency: account.currency,
        balance: account.balance ?? '', credit_limit: account.credit_limit ?? '',
        interest_rate: account.interest_rate ?? '', is_active: account.is_active }
    : EMPTY_FORM
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name || !form.type || !form.currency) {
      setError(t('acct.modal.required')); return
    }
    setSaving(true); setError(null)
    try {
      await onSave({
        name:          form.name.trim(),
        type:          form.type,
        currency:      form.currency,
        balance:       parseFloat(form.balance) || 0,
        credit_limit:  form.type === 'credit' && form.credit_limit ? parseFloat(form.credit_limit) : null,
        interest_rate: ['credit', 'savings', 'investment'].includes(form.type) && form.interest_rate
                         ? parseFloat(form.interest_rate)
                         : 0,
        is_active:     form.is_active,
      })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const types = ['checking', 'savings', 'credit', 'investment', 'cash']

  return (
    <Modal title={account ? t('acct.modal.titleEdit') : t('acct.modal.titleNew')} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="modal-body">
          <div className="form-grid">

            <div className="form-field span-2">
              <label>{t('acct.modal.name')}</label>
              <input type="text" placeholder={t('acct.modal.namePlaceholder')}
                value={form.name} onChange={e => set('name', e.target.value)} required />
            </div>

            <div className="form-field">
              <label>{t('acct.modal.type')}</label>
              <select value={form.type} onChange={e => set('type', e.target.value)}>
                {types.map(tp => (
                  <option key={tp} value={tp}>{t('acct.types.' + tp)}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>{t('acct.modal.currency')}</label>
              <select value={form.currency} onChange={e => set('currency', e.target.value)}>
                <option value="CAD">CAD — Canadian Dollar</option>
                <option value="COP">COP — Colombian Peso</option>
              </select>
            </div>

            <div className="form-field">
              <label>{t('acct.modal.balance')}</label>
              <input type="number" step="0.01" placeholder="0.00"
                value={form.balance} onChange={e => set('balance', e.target.value)} />
            </div>

            {form.type === 'credit' && (
              <div className="form-field">
                <label>{t('acct.modal.creditLimit')}</label>
                <input type="number" step="0.01" placeholder="0.00"
                  value={form.credit_limit} onChange={e => set('credit_limit', e.target.value)} />
              </div>
            )}

            {['credit', 'savings', 'investment'].includes(form.type) && (
              <div className="form-field">
                <label>{t('acct.modal.interestRate')}</label>
                <input type="number" step="0.01" min="0" max="100"
                  placeholder={t('acct.modal.interestRatePlaceholder')}
                  value={form.interest_rate} onChange={e => set('interest_rate', e.target.value)} />
              </div>
            )}

            <div className="form-field span-2" style={{ justifyContent: 'flex-start' }}>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_active}
                  onChange={e => set('is_active', e.target.checked)}
                  style={{ width: 'auto', height: 'auto' }} />
                {t('acct.modal.active')}
              </label>
            </div>

          </div>
          {error && <p style={{ color: 'var(--neg)', fontSize: 12, marginTop: 12 }}>{error}</p>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn ghost" onClick={onClose}>{t('acct.modal.cancel')}</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? t('acct.modal.saving') : account ? t('acct.modal.saveEdit') : t('acct.modal.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
