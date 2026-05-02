import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Icon from '../components/Icon'
import Topbar from '../components/Topbar'
import Modal from '../components/Modal'
import { useBudgets } from '../hooks/useBudgets'
import { useCategories } from '../hooks/useCategories'

function nowMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function fmtMonth(ym) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function Budgets() {
  const { t } = useTranslation()
  const [filterMonth, setFilterMonth] = useState(nowMonth)
  const [editing, setEditing] = useState(null)

  const { budgets, spending, loading, addBudget, updateBudget, deleteBudget } = useBudgets(filterMonth)
  const { categories } = useCategories()

  const totalBudget  = budgets.reduce((s, b) => s + b.amount, 0)
  const totalSpent   = budgets.reduce((s, b) => s + (spending[b.category_id] || 0), 0)
  const totalLeft    = totalBudget - totalSpent

  const now     = new Date()
  const daysIn  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayNum  = filterMonth === nowMonth() ? now.getDate() : daysIn
  const monthPct = Math.round((dayNum / daysIn) * 100)
  const spentPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0

  const fmtK = n => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toLocaleString('en-CA', { maximumFractionDigits: 0 })}`

  const budgetedCatIds = new Set(budgets.map(b => b.category_id))
  const availableCats  = categories.filter(c => !budgetedCatIds.has(c.id))

  return (
    <>
      <Topbar greet={t('budget.title')} date={fmtMonth(filterMonth)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button className="btn ghost sm" style={{ padding: '0 8px' }}
            onClick={() => setFilterMonth(m => shiftMonth(m, -1))}>←</button>
          <span style={{ fontSize: 12, color: 'var(--ink-2)', padding: '0 6px', minWidth: 90, textAlign: 'center' }}>
            {fmtMonth(filterMonth)}
          </span>
          <button className="btn ghost sm" style={{ padding: '0 8px' }}
            onClick={() => setFilterMonth(m => shiftMonth(m, 1))}>→</button>
        </div>
        <button className="btn primary sm" onClick={() => setEditing('new')} title={t('budget.addBtn')}>
          <Icon name="plus" size={12} /> <span className="btn-label">{t('budget.addBtn')}</span>
        </button>
      </Topbar>

      {budgets.length > 0 && (
        <div className="budget-overview card">
          <div className="bo-left">
            <div className="card-title">{t('budget.totalBudget')}</div>
            <div className="num num-hero">{fmtK(totalBudget)}</div>
            <div className="bo-meta">
              <span>{t('budget.spent')} <span className="num pos-text">{fmtK(totalSpent)}</span></span>
              <span className="hero-pip" />
              <span>{t('budget.remaining')} <span className="num">{fmtK(Math.max(totalLeft, 0))}</span></span>
              <span className="hero-pip" />
              <span>{t('budget.today', { day: dayNum })}</span>
            </div>
          </div>
          <div className="bo-right">
            <div className="pace-track">
              <div className="pace-month-fill" style={{ width: `${monthPct}%` }} />
              <div className="pace-spent"      style={{ width: `${Math.min(spentPct, 100)}%` }} />
              <div className="pace-marker"     style={{ left: `${monthPct}%` }}>
                <div className="pace-marker-line" />
                <div className="pace-marker-label">{t('budget.today', { day: dayNum })}</div>
              </div>
            </div>
            <div className="pace-legend">
              <span><span className="legend-dot" style={{ background: 'var(--accent)' }} /> {t('budget.spent')} {spentPct}%</span>
              <span><span className="legend-dot" style={{ background: 'var(--bg-3)' }} /> {t('budget.month')} {monthPct}%</span>
              {spentPct > monthPct && (
                <span className="warn-text" style={{ marginLeft: 'auto' }}>{spentPct - monthPct}% {t('budget.ahead')}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>{t('budget.loading')}</div>
      ) : (
        <div className="envelope-grid">
          {budgets.map(b => (
            <Envelope key={b.id}
              budget={b}
              spent={spending[b.category_id] || 0}
              onEdit={() => setEditing(b)}
              t={t} />
          ))}
          {availableCats.length > 0 && (
            <div className="envelope envelope-add" onClick={() => setEditing('new')}>
              <Icon name="plus" size={18} />
              <span>{t('budget.addBtn')}</span>
            </div>
          )}
          {budgets.length === 0 && availableCats.length === 0 && (
            <div style={{ gridColumn: '1/-1', padding: 48, textAlign: 'center', color: 'var(--ink-3)' }}>
              {t('budget.empty')}
            </div>
          )}
        </div>
      )}

      {editing !== null && (
        <BudgetModal
          budget={editing === 'new' ? null : editing}
          categories={editing === 'new' ? availableCats : categories}
          onClose={() => setEditing(null)}
          onSave={async ({ category_id, amount }) => {
            if (editing === 'new') await addBudget(category_id, amount)
            else await updateBudget(editing.id, amount)
            setEditing(null)
          }}
          onDelete={async () => {
            await deleteBudget(editing.id)
            setEditing(null)
          }}
          t={t}
        />
      )}
    </>
  )
}

function Envelope({ budget: b, spent, onEdit, t }) {
  const rawPct  = b.amount > 0 ? (spent / b.amount) * 100 : 0
  const pct     = Math.min(rawPct, 120)
  const over    = spent > b.amount
  const warning = !over && rawPct >= 80
  const mPct    = monthPctNow()
  const ahead   = !over && rawPct > mPct + 10
  const color   = b.category?.color || 'var(--accent)'
  const barColor = over ? 'var(--neg)' : warning ? 'var(--warn)' : color

  const chipClass = over ? 'tag-warn' : warning ? 'tag-warn' : ahead ? '' : 'tag-ok'
  const chipLabel = over
    ? `🔴 ${t('budget.over')} (${Math.round(rawPct)}%)`
    : warning
      ? `⚠️ ${Math.round(rawPct)}% used`
      : ahead
        ? t('budget.aheadPace')
        : t('budget.onPace')

  return (
    <div className={`envelope ${over ? 'envelope-over' : warning ? 'envelope-warn' : ''}`}>
      <div className="env-head">
        <div className="env-icon" style={{ background: `${color}22`, color }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
        </div>
        <div className="env-name">{b.category?.name || '—'}</div>
        <button className="icon-btn sm-btn" style={{ marginLeft: 'auto' }} onClick={onEdit}>
          <Icon name="more" size={12} />
        </button>
      </div>
      <div className="env-amt">
        <span className="num num-md" style={{ color: over ? 'var(--neg)' : warning ? 'var(--warn)' : undefined }}>
          ${spent.toLocaleString('en-CA', { maximumFractionDigits: 0 })}
        </span>
        <span className="env-of">/ ${b.amount.toLocaleString('en-CA', { maximumFractionDigits: 0 })}</span>
      </div>
      <div className="env-bar">
        <div className="env-bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
        {over && <div className="env-bar-over" style={{ width: `${pct - 100}%`, left: '100%' }} />}
      </div>
      <div className="env-foot">
        <span className={`chip ${chipClass}`}>{chipLabel}</span>
        <span style={{ fontSize: 10.5, color: 'var(--ink-3)', marginLeft: 'auto' }}>
          {Math.round(rawPct)}%
        </span>
      </div>
    </div>
  )
}

function monthPctNow() {
  const now = new Date()
  return (now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) * 100
}

function BudgetModal({ budget, categories, onClose, onSave, onDelete, t }) {
  const [catId,   setCatId]   = useState(budget?.category_id || '')
  const [amount,  setAmount]  = useState(budget?.amount ? String(budget.amount) : '')
  const [saving,  setSaving]  = useState(false)
  const [delStep, setDelStep] = useState(0)
  const [error,   setError]   = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!catId || !amount) { setError(t('budget.modal.required')); return }
    setSaving(true); setError(null)
    try { await onSave({ category_id: catId, amount }) }
    catch (err) { setError(err.message); setSaving(false) }
  }

  async function handleDelete() {
    if (delStep === 0) { setDelStep(1); return }
    setSaving(true)
    try { await onDelete() }
    catch (err) { setError(err.message); setSaving(false) }
  }

  return (
    <Modal title={budget ? t('budget.modal.titleEdit') : t('budget.modal.titleNew')} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="modal-body">
          <div className="form-grid">

            <div className="form-field span-2">
              <label>{t('budget.modal.category')}</label>
              {budget ? (
                <input type="text" readOnly value={budget.category?.name || ''} style={{ opacity: 0.6 }} />
              ) : (
                <select value={catId} onChange={e => { setCatId(e.target.value); setDelStep(0) }} required>
                  <option value="">{t('budget.modal.categorySelect')}</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>

            <div className="form-field span-2">
              <label>{t('budget.modal.amount')}</label>
              <input type="number" step="0.01" min="0" placeholder="0.00"
                value={amount} onChange={e => setAmount(e.target.value)} required />
            </div>

          </div>
          {error && <p style={{ color: 'var(--neg)', fontSize: 12, marginTop: 12 }}>{error}</p>}
        </div>

        <div className="modal-footer">
          {budget && (
            <button type="button" className="btn ghost" disabled={saving}
              style={{ marginRight: 'auto', color: 'var(--neg)' }}
              onClick={handleDelete}>
              {delStep === 1 ? t('budget.modal.confirmDelete') : t('budget.modal.delete')}
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>{t('budget.modal.cancel')}</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? t('budget.modal.saving') : budget ? t('budget.modal.saveEdit') : t('budget.modal.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
