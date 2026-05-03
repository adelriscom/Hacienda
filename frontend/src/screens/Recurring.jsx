import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Icon from '../components/Icon'
import Topbar from '../components/Topbar'
import NewTransactionModal from '../components/NewTransactionModal'
import { useRecurring } from '../hooks/useRecurring'
import { useTransactions } from '../hooks/useTransactions'

const fmt     = n => '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK    = n => Math.abs(n) >= 1000 ? `$${(Math.abs(n) / 1000).toFixed(1)}k` : fmt(n)
const fmtDate = d => new Date(d).toLocaleDateString('en-CA', { day: 'numeric', month: 'short' })

export default function Recurring() {
  const { items, loading, removeRecurring, refresh } = useRecurring()
  const { addTransaction, updateTransaction, deleteTransaction } = useTransactions()
  const { t } = useTranslation()
  const [showNew,     setShowNew]     = useState(false)
  const [editingItem, setEditingItem] = useState(null)

  const incomeItems  = items.filter(i => i.amount > 0)
  const expenseItems = items.filter(i => i.amount < 0)

  const monthlyIncome   = incomeItems.reduce((s, i)  => s + i.amount, 0)
  const monthlyExpenses = expenseItems.reduce((s, i) => s + Math.abs(i.amount), 0)
  const net = monthlyIncome - monthlyExpenses

  async function handleAdd(values) {
    await addTransaction({ ...values, is_recurring: true })
    await refresh()
    setShowNew(false)
  }

  return (
    <>
      <Topbar greet={t('recurring.title')}
        date={t('recurring.subtitle', { income: incomeItems.length, expenses: expenseItems.length })}>
        <button className="btn primary sm" onClick={() => setShowNew(true)}>
          <Icon name="plus" size={12} /> Add recurring
        </button>
      </Topbar>

      {/* KPI summary */}
      {!loading && items.length > 0 && (
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <KPI label={t('recurring.monthlyIncome')}   value={fmtK(monthlyIncome)}   tone="pos"  icon="income" />
          <KPI label={t('recurring.monthlyExpenses')} value={fmtK(monthlyExpenses)} tone="warn" icon="expense" />
          <KPI label={t('recurring.net')}             value={fmtK(Math.abs(net))}
            tone={net >= 0 ? 'pos' : 'neg'} icon={net >= 0 ? 'trend-up' : 'trend-down'}
            prefix={net >= 0 ? '+' : '−'} />
          <KPI label={t('recurring.totalItems')} value={String(items.length)} tone="accent" icon="recurring" />
        </div>
      )}

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>{t('recurring.loading')}</div>
      ) : items.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔁</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', marginBottom: 6 }}>No recurring transactions yet</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>Track subscriptions, rent, salary and any fixed transactions.</div>
          <button className="btn primary" onClick={() => setShowNew(true)}>
            <Icon name="plus" size={14} /> Add your first recurring
          </button>
        </div>
      ) : (
        <div className="grid-2">
          <Section title={t('recurring.incomeSection')}  items={incomeItems}  onRemove={removeRecurring} onEdit={setEditingItem} t={t} />
          <Section title={t('recurring.expenseSection')} items={expenseItems} onRemove={removeRecurring} onEdit={setEditingItem} t={t} />
        </div>
      )}

      {showNew && (
        <NewTransactionModal
          onClose={() => setShowNew(false)}
          onSave={handleAdd}
          defaults={{ is_recurring: true }}
        />
      )}
      {editingItem && (
        <NewTransactionModal
          transaction={editingItem}
          onClose={() => setEditingItem(null)}
          onUpdate={async (id, values) => { await updateTransaction(id, values); await refresh(); setEditingItem(null) }}
          onDelete={async (id) => { await deleteTransaction(id); await refresh(); setEditingItem(null) }}
        />
      )}
    </>
  )
}

function Section({ title, items, onRemove, onEdit, t }) {
  if (items.length === 0) return null
  return (
    <div className="card">
      <div className="card-h">
        <div><h3>{title}</h3><p>{items.length} {t('recurring.items')}</p></div>
        <span className="num" style={{ fontSize: 14, fontWeight: 700, color: items[0]?.amount > 0 ? 'var(--pos)' : 'var(--ink-0)' }}>
          {fmtK(items.reduce((s, i) => s + Math.abs(i.amount), 0))} / {t('recurring.mo')}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {items.map(item => <RecurringRow key={item.id} item={item} onRemove={onRemove} onEdit={onEdit} t={t} />)}
      </div>
    </div>
  )
}

function RecurringRow({ item, onRemove, onEdit, t }) {
  const [confirming, setConfirming] = useState(false)
  const color = item.category?.color || 'var(--accent)'
  const isIncome = item.amount > 0

  const nextDate   = item._nextDate
  const daysUntil  = Math.round((nextDate - new Date()) / (1000 * 60 * 60 * 24))
  const isOverdue  = daysUntil < 0
  const isSoon     = daysUntil >= 0 && daysUntil <= 7

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 0',
      borderBottom: '1px solid var(--line)',
    }}>
      {/* Color dot */}
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: `${color}22`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: color }} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-0)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
            {item.description}
          </span>
          {item._count > 1 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
              background: 'var(--bg-2)', color: 'var(--ink-3)',
            }}>
              {item._count}×
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
          {item.category && (
            <span className="cat-pill" style={{ fontSize: 11 }}>
              <span className="cat-dot" style={{ background: color }} />
              {item.category.name}
            </span>
          )}
          {item.account && (
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{item.account.name}</span>
          )}
          {item.person && item.person !== 'Shared' && (
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{item.person}</span>
          )}
        </div>
      </div>

      {/* Next date */}
      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 90 }}>
        <div style={{
          fontSize: 11, fontWeight: 600,
          color: isOverdue ? 'var(--neg)' : isSoon ? 'var(--warn)' : 'var(--ink-3)',
        }}>
          {isOverdue
            ? t('recurring.overdue')
            : isSoon
              ? t('recurring.inDays', { n: daysUntil })
              : fmtDate(nextDate)}
        </div>
        <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 1 }}>
          {t('recurring.lastSeen')} {fmtDate(item.occurred_at)}
        </div>
      </div>

      {/* Amount */}
      <div className="num" style={{
        fontSize: 14, fontWeight: 700, flexShrink: 0, minWidth: 72, textAlign: 'right',
        color: isIncome ? 'var(--pos)' : 'var(--ink-0)',
      }}>
        {isIncome ? '+' : '−'}{fmt(item.amount)}
      </div>

      {/* Edit / Remove buttons */}
      <div style={{ flexShrink: 0, display: 'flex', gap: 4 }}>
        {confirming ? (
          <>
            <button className="btn ghost sm" style={{ fontSize: 11, color: 'var(--neg)' }}
              onClick={() => onRemove(item.id)}>
              {t('recurring.confirm')}
            </button>
            <button className="btn ghost sm" style={{ fontSize: 11 }}
              onClick={() => setConfirming(false)}>✕</button>
          </>
        ) : (
          <>
            <button className="icon-btn sm-btn" title="Edit" onClick={() => onEdit(item)}>
              <Icon name="edit" size={13} />
            </button>
            <button className="icon-btn sm-btn" title={t('recurring.remove')}
              onClick={() => setConfirming(true)}>
              <Icon name="x" size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function KPI({ label, value, tone, icon, prefix = '' }) {
  const tintMap = {
    pos:    'var(--pos)',
    warn:   'var(--warn)',
    neg:    'var(--neg)',
    accent: 'var(--accent-2)',
  }
  const tint = tintMap[tone] || 'var(--accent)'
  return (
    <div className="card kpi">
      <div className="kpi-h">
        <div className="kpi-icon"
          style={{ background: `color-mix(in oklab, ${tint} 18%, transparent)`, color: tint }}>
          <Icon name={icon} size={16} />
        </div>
      </div>
      <div className="num num-lg" style={{ marginTop: 14 }}>{prefix}{value}</div>
      <div className="kpi-foot">
        <span className="kpi-label">{label}</span>
      </div>
    </div>
  )
}
