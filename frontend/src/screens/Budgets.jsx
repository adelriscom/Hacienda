import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Icon from '../components/Icon'
import Topbar from '../components/Topbar'
import Modal from '../components/Modal'
import { useBudgets } from '../hooks/useBudgets'
import { useCategories, buildCategoryTree } from '../hooks/useCategories'
import { useExchangeRates } from '../hooks/useExchangeRates'
import { toBase } from '../lib/currency'
import { supabase } from '../lib/supabase'

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

function fmtCAD(n) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toLocaleString('en-CA', { maximumFractionDigits: 0 })}`
}

function fmtCOP(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M COP`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k COP`
  return `${n.toLocaleString('en-CA', { maximumFractionDigits: 0 })} COP`
}

function fmt(n, currency) {
  return currency === 'COP' ? fmtCOP(n) : fmtCAD(n)
}

export default function Budgets() {
  const { t } = useTranslation()
  const [filterMonth, setFilterMonth] = useState(nowMonth)
  const [editing, setEditing]         = useState(null)
  const [selectedBudget, setSelectedBudget] = useState(null)
  const [editingRate, setEditingRate] = useState(false)
  const [rateInput, setRateInput]     = useState('')

  const { budgets, spending, hasCop, loading, addBudget, updateBudget, deleteBudget } = useBudgets(filterMonth)
  const { categories } = useCategories()
  const { rates, inherited, saveRate } = useExchangeRates(filterMonth)
  const copToCAD      = rates['COP']
  const rateInherited = inherited['COP']

  // Totals — everything converted to the base currency (CAD)
  const totalBudgetCAD = budgets.reduce((s, b) => s + toBase(b.amount, b.currency, rates), 0)
  const totalSpentCAD = budgets.reduce((s, b) => {
    const sp = spending[b.category_id] || {}
    return s + Object.entries(sp).reduce((ss, [cur, amt]) => ss + toBase(amt, cur, rates), 0)
  }, 0)
  const totalLeftCAD = totalBudgetCAD - totalSpentCAD

  const now      = new Date()
  const daysIn   = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayNum   = filterMonth === nowMonth() ? now.getDate() : daysIn
  const monthPct = Math.round((dayNum / daysIn) * 100)
  const spentPct = totalBudgetCAD > 0 ? Math.round((totalSpentCAD / totalBudgetCAD) * 100) : 0

  // Show the rate editor whenever COP is relevant this month: a COP budget exists,
  // or there's any COP transaction (income or expense).
  const hasCOP = budgets.some(b => b.currency === 'COP') || hasCop

  const { leafCategories } = useMemo(() => buildCategoryTree(categories), [categories])
  const budgetedCatIds = new Set(budgets.map(b => b.category_id))
  const availableCats  = leafCategories.filter(c => !budgetedCatIds.has(c.id))

  function startEditRate() {
    setRateInput(copToCAD ? Math.round(1 / copToCAD).toString() : '')
    setEditingRate(true)
  }
  async function commitRate() {
    const cadPerCOP = parseFloat(rateInput)
    if (cadPerCOP > 0) await saveRate('COP', 1 / cadPerCOP)
    setEditingRate(false)
  }

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
            <div className="num num-hero">{fmtCAD(totalBudgetCAD)}</div>
            <div className="bo-meta">
              <span>{t('budget.spent')} <span className="num pos-text">{fmtCAD(totalSpentCAD)}</span></span>
              <span className="hero-pip" />
              <span>{t('budget.remaining')} <span className="num">{fmtCAD(Math.max(totalLeftCAD, 0))}</span></span>
              <span className="hero-pip" />
              <span>{t('budget.today', { day: dayNum })}</span>
            </div>

            {/* Exchange rate editor — only visible when COP budgets exist */}
            {hasCOP && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-3)' }}>
                <span>1 CAD =</span>
                {editingRate ? (
                  <>
                    <input
                      type="number" value={rateInput} min="1"
                      onChange={e => setRateInput(e.target.value)}
                      onBlur={commitRate}
                      onKeyDown={e => e.key === 'Enter' && commitRate()}
                      autoFocus
                      style={{ width: 80, fontSize: 12, padding: '2px 6px', borderRadius: 6,
                        border: '1px solid var(--accent)', background: 'var(--bg-2)',
                        color: 'var(--ink-0)', outline: 'none' }}
                    />
                    <span>COP</span>
                  </>
                ) : (
                  <button
                    onClick={startEditRate}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      color: 'var(--ink-2)', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <span className="num">{copToCAD ? Math.round(1 / copToCAD).toLocaleString('en-CA') : '—'}</span>
                    <span>COP</span>
                    <Icon name="edit" size={10} />
                  </button>
                )}
                {rateInherited && !editingRate && (
                  <span title="No rate saved for this month — showing the last saved rate. Click to set it."
                    style={{ color: 'var(--warn)', fontSize: 11 }}>· not set this month</span>
                )}
              </div>
            )}
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
          {budgets.map(b => {
            const sp = spending[b.category_id] || { CAD: 0, COP: 0 }
            const spent = sp[b.currency] || 0
            return (
              <Envelope key={b.id}
                budget={b}
                spent={spent}
                onEdit={() => setEditing(b)}
                onClick={() => setSelectedBudget(b)}
                t={t} />
            )
          })}
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

      {selectedBudget && (
        <BudgetDetailModal
          budget={selectedBudget}
          filterMonth={filterMonth}
          spending={spending}
          onClose={() => setSelectedBudget(null)}
        />
      )}

      {editing !== null && (
        <BudgetModal
          budget={editing === 'new' ? null : editing}
          categories={categories}
          budgetedCatIds={budgetedCatIds}
          onClose={() => setEditing(null)}
          onSave={async ({ category_id, amount, currency }) => {
            if (editing === 'new') await addBudget(category_id, amount, currency)
            else await updateBudget(editing.id, amount, currency)
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

function Envelope({ budget: b, spent, onEdit, onClick, t }) {
  const rawPct   = b.amount > 0 ? (spent / b.amount) * 100 : 0
  const pct      = Math.min(rawPct, 120)
  const over     = spent > b.amount
  const warning  = !over && rawPct >= 80
  const mPct     = monthPctNow()
  const ahead    = !over && rawPct > mPct + 10
  const color    = b.category?.color || 'var(--accent)'
  const barColor = over ? 'var(--neg)' : warning ? 'var(--warn)' : color
  const remaining = b.amount - spent

  const chipClass = over ? 'tag-warn' : warning ? 'tag-warn' : ahead ? '' : 'tag-ok'
  const chipLabel = over
    ? `🔴 ${t('budget.over')} (${Math.round(rawPct)}%)`
    : warning
      ? `⚠️ ${Math.round(rawPct)}% used`
      : ahead
        ? t('budget.aheadPace')
        : t('budget.onPace')

  return (
    <div
      className={`envelope ${over ? 'envelope-over' : warning ? 'envelope-warn' : ''}`}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      <div className="env-head">
        <div className="env-icon" style={{ background: `${color}22`, color }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
        </div>
        <div className="env-name">{b.category?.name || '—'}</div>
        {b.currency === 'COP' && (
          <span style={{
            fontSize: 9.5, fontWeight: 600, padding: '1px 5px', borderRadius: 4,
            background: 'rgba(20,184,166,.15)', color: '#14b8a6',
            border: '1px solid rgba(20,184,166,.3)', marginLeft: 4, flexShrink: 0,
          }}>COP</span>
        )}
        <button className="icon-btn sm-btn" style={{ marginLeft: 'auto' }}
          onClick={e => { e.stopPropagation(); onEdit() }}>
          <Icon name="more" size={12} />
        </button>
      </div>
      <div className="env-amt">
        <span className="num num-md" style={{ color: over ? 'var(--neg)' : warning ? 'var(--warn)' : undefined }}>
          {fmt(spent, b.currency)}
        </span>
        <span className="env-of">/ {fmt(b.amount, b.currency)}</span>
      </div>
      <div className="env-bar">
        <div className="env-bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
        {over && <div className="env-bar-over" style={{ width: `${pct - 100}%`, left: '100%' }} />}
      </div>
      <div className="env-foot">
        <span className={`chip ${chipClass}`}>{chipLabel}</span>
        <span style={{ fontSize: 10.5, color: over ? 'var(--neg)' : 'var(--ink-3)', marginLeft: 'auto', fontWeight: over ? 600 : 400 }}>
          {over ? `${fmt(-remaining, b.currency)} over` : `${fmt(remaining, b.currency)} left`}
        </span>
      </div>
    </div>
  )
}

function monthPctNow() {
  const now = new Date()
  return (now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) * 100
}

function StatBox({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--bg-2)', borderRadius: 10, padding: '10px 12px',
      border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        {label}
      </div>
      <div className="num" style={{ fontSize: 14, fontWeight: 700, color }}>
        {value}
      </div>
    </div>
  )
}

function BudgetDetailModal({ budget: b, filterMonth, spending, onClose }) {
  const [txns, setTxns]       = useState([])
  const [txLoading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchTxns() {
      const [y, m] = filterMonth.split('-').map(Number)
      const from = `${filterMonth}-01`
      const nextMonth = new Date(y, m, 1)
      const to = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`

      const { data } = await supabase
        .from('transactions')
        .select('id, occurred_at, description, amount, account:accounts(name, currency)')
        .eq('category_id', b.category_id)
        .eq('type', 'expense')
        .gte('occurred_at', from)
        .lt('occurred_at', to)
        .order('occurred_at', { ascending: false })

      setTxns(data || [])
      setLoading(false)
    }
    fetchTxns()
  }, [b.category_id, filterMonth])

  const sp        = spending[b.category_id] || { CAD: 0, COP: 0 }
  const spent     = sp[b.currency] || 0
  const remaining = b.amount - spent
  const over      = spent > b.amount
  const pct       = b.amount > 0 ? Math.min((spent / b.amount) * 100, 100) : 0
  const color     = b.category?.color || 'var(--accent)'
  const barColor  = over ? 'var(--neg)' : color

  return (
    <Modal title={b.category?.name || '—'} onClose={onClose} wide>
      <div className="modal-body">
        {/* Stat boxes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
          <StatBox label="Allocated" value={fmt(b.amount, b.currency)} color="var(--ink-1)" />
          <StatBox label="Spent"     value={fmt(spent, b.currency)}    color={over ? 'var(--neg)' : 'var(--ink-1)'} />
          <StatBox
            label={over ? 'Over budget' : 'Remaining'}
            value={fmt(Math.abs(remaining), b.currency)}
            color={over ? 'var(--neg)' : 'var(--pos)'}
          />
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-3)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${pct}%`, background: barColor,
              borderRadius: 4, transition: 'width 0.4s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11, color: 'var(--ink-3)' }}>
            <span>0</span>
            <span style={{ color: over ? 'var(--neg)' : 'var(--ink-2)', fontWeight: 500 }}>{Math.round(pct)}% used</span>
            <span>{fmt(b.amount, b.currency)}</span>
          </div>
        </div>

        {/* Transaction list */}
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
          Transactions
        </div>
        {txLoading ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>
        ) : txns.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink-3)', fontSize: 13 }}>No transactions this month</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {txns.map(tx => (
              <div key={tx.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 0', borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tx.description || '—'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>
                    {new Date(tx.occurred_at + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                    {tx.account?.name && ` · ${tx.account.name}`}
                  </div>
                </div>
                <div className="num" style={{ fontSize: 13, fontWeight: 600, color: 'var(--neg)', flexShrink: 0 }}>
                  {fmt(tx.amount, tx.account?.currency || b.currency)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

function BudgetModal({ budget, categories, budgetedCatIds = new Set(), onClose, onSave, onDelete, t }) {
  const [catId,    setCatId]    = useState(budget?.category_id || '')
  const [amount,   setAmount]   = useState(budget?.amount ? String(budget.amount) : '')
  const [currency, setCurrency] = useState(budget?.currency || 'CAD')
  const [saving,   setSaving]   = useState(false)
  const [delStep,  setDelStep]  = useState(0)
  const [error,    setError]    = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!catId || !amount) { setError(t('budget.modal.required')); return }
    setSaving(true); setError(null)
    try { await onSave({ category_id: catId, amount, currency }) }
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
                  {(() => {
                    const { parents: ps, childrenOf: co } = buildCategoryTree(categories)
                    return ps.map(parent => {
                      const children = (co[parent.id] || []).filter(c => !budgetedCatIds.has(c.id))
                      const isLeaf = !co[parent.id]
                      if (!isLeaf) {
                        if (children.length === 0) return null
                        return (
                          <optgroup key={parent.id} label={parent.name}>
                            {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </optgroup>
                        )
                      }
                      if (budgetedCatIds.has(parent.id)) return null
                      return <option key={parent.id} value={parent.id}>{parent.name}</option>
                    })
                  })()}
                </select>
              )}
            </div>

            <div className="form-field">
              <label>Currency</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['CAD', 'COP'].map(c => (
                  <button key={c} type="button"
                    style={{
                      flex: 1, height: 34, borderRadius: 8, border: '1px solid',
                      borderColor: currency === c ? 'var(--accent)' : 'var(--border)',
                      background:  currency === c ? 'rgba(99,102,241,.12)' : 'var(--bg-2)',
                      color:       currency === c ? 'var(--accent)' : 'var(--ink-2)',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                    onClick={() => setCurrency(c)}>{c}</button>
                ))}
              </div>
            </div>

            <div className="form-field">
              <label>{t('budget.modal.amount')} <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>({currency})</span></label>
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
