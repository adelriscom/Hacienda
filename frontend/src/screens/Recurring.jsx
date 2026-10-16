import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Icon from '../components/Icon'
import Topbar from '../components/Topbar'
import NewTransactionModal from '../components/NewTransactionModal'
import ObligationModal from '../components/ObligationModal'
import { useRecurring } from '../hooks/useRecurring'
import { useTransactions } from '../hooks/useTransactions'
import { useHousehold } from '../lib/household'
import { STATUS } from '../lib/paymentSchedule'

// The occurrence carries two independent facts — how much has been paid, and
// where the due date sits — so the row reports payment progress first and falls
// back to the date only when nothing is owed yet.
function statusOf(occ, isIncome, t, paused = false) {
  if (paused) return { text: t('obligation.paused'), tone: 'var(--ink-3)' }
  if (!occ) return { text: '—', tone: 'var(--ink-3)' }
  const d = occ.daysFromDue
  switch (occ.status) {
    case STATUS.PAID:
      return { text: isIncome ? t('recurring.received') : t('recurring.paid'), tone: 'var(--pos)' }
    case STATUS.PARTIAL:
      return { text: t('recurring.partial'), tone: 'var(--warn)' }
    case STATUS.OVERDUE:
      return { text: isIncome ? t('recurring.notReceived') : t('recurring.overdue'), tone: 'var(--neg)' }
    case STATUS.DUE_TODAY:
      return { text: t('recurring.dueToday'), tone: 'var(--neg)' }
    default:
      return d <= 7
        ? { text: t('recurring.inDays', { n: d }), tone: 'var(--warn)' }
        : { text: t('recurring.upcoming'), tone: 'var(--ink-3)' }
  }
}

const fmt     = n => '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK    = n => Math.abs(n) >= 1000 ? `$${(Math.abs(n) / 1000).toFixed(1)}k` : fmt(n)
const fmtDate = d => new Date(d).toLocaleDateString('en-CA', { day: 'numeric', month: 'short' })

export default function Recurring() {
  const { isFamily, myUserId } = useHousehold()
  // Scoped to the selected profile, the same way Transactions, Expenses,
  // Calendar and the Dashboard already are.
  const {
    items, loading, refresh, removeRecurring,
    createObligation, updateObligation, deleteObligation, setObligationActive, adoptSeries,
  } = useRecurring({ userId: isFamily ? null : myUserId })
  const { updateTransaction, deleteTransaction } = useTransactions()
  const { t } = useTranslation()
  const [showNew,     setShowNew]     = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [busy,        setBusy]        = useState(null)

  const incomeItems  = items.filter(i => i.amount > 0)
  const expenseItems = items.filter(i => i.amount < 0)

  const monthlyIncome   = incomeItems.reduce((s, i)  => s + i.amount, 0)
  const monthlyExpenses = expenseItems.reduce((s, i) => s + Math.abs(i.amount), 0)
  const net = monthlyIncome - monthlyExpenses

  // Acting on a row is a round trip, so the row says so rather than going quiet.
  async function run(key, fn) {
    setBusy(key)
    try { await fn() } finally { setBusy(null) }
  }

  const rowActions = {
    busy,
    editRule:   item => setEditingRule(item._rule),
    editTxn:    item => setEditingItem(item),
    remove:     item => run(item._key, () => removeRecurring(item)),
    destroy:    item => run(item._key, () => deleteObligation(item.id)),
    adopt:      item => run(item._key, () => adoptSeries(item)),
    toggle:     item => run(item._key, () => setObligationActive(item.id, item._rule.is_active === false)),
  }

  return (
    <>
      <Topbar greet={t('recurring.title')}
        date={t('recurring.subtitle', { income: incomeItems.length, expenses: expenseItems.length })}>
        <button className="btn primary sm" onClick={() => setShowNew(true)}>
          <Icon name="plus" size={12} /> {t('obligation.addBtn')}
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
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', marginBottom: 6 }}>
            {t('obligation.emptyTitle')}
          </div>
          <div style={{ fontSize: 13, marginBottom: 20, maxWidth: 420, marginInline: 'auto' }}>
            {t('obligation.emptySub')}
          </div>
          <button className="btn primary" onClick={() => setShowNew(true)}>
            <Icon name="plus" size={14} /> {t('obligation.emptyCta')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Section title={t('recurring.expenseSection')} items={expenseItems} actions={rowActions} t={t} />
          <Section title={t('recurring.incomeSection')}  items={incomeItems}  actions={rowActions} t={t} />
        </div>
      )}

      {showNew && (
        <ObligationModal
          onClose={() => setShowNew(false)}
          onSave={createObligation}
        />
      )}
      {editingRule && (
        <ObligationModal
          rule={editingRule}
          onClose={() => setEditingRule(null)}
          onSave={values => updateObligation(editingRule.id, values)}
          onDelete={deleteObligation}
        />
      )}
      {/* A leftover inferred series is still a transaction, so it keeps the
          transaction editor until it is adopted. */}
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

function Section({ title, items, actions, t }) {
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
        {items.map(item => <RecurringRow key={item._key} item={item} actions={actions} t={t} />)}
      </div>
    </div>
  )
}

function RecurringRow({ item, actions, t }) {
  const [confirming, setConfirming] = useState(false)
  const color = item.category?.color || 'var(--accent)'
  const isIncome = item.amount > 0
  // A declared rule is the real obligation; an inferred series is a leftover
  // waiting to be adopted, and only supports what it always did.
  const declared = item._declared === true
  const paused   = declared && item._rule?.is_active === false
  const working  = actions.busy === item._key

  const occ    = item._occurrence
  const status = statusOf(occ, isIncome, t, paused)
  // A partly paid obligation past its due date is both things at once.
  const alsoOverdue = occ?.status === STATUS.PARTIAL && occ.isOverdue

  return (
    <div className="rec-row" style={{
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
          <span className="rec-name" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-0)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
          {paused && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
              background: 'var(--bg-3)', color: 'var(--ink-2)',
            }}>
              {t('obligation.paused')}
            </span>
          )}
          {!declared && (
            <span title={t('obligation.adoptHint')} style={{
              fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 4,
              background: 'var(--warn-soft)', color: 'var(--warn)', whiteSpace: 'nowrap',
            }}>
              {t('obligation.detected')}
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

      {/* Payment status, then the period it belongs to */}
      <div className="rec-status" style={{ textAlign: 'right', flexShrink: 0, minWidth: 84 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: status.tone }}>
          {status.text}
        </div>
        <div style={{ fontSize: 10, color: alsoOverdue ? 'var(--neg)' : 'var(--ink-3)', marginTop: 1 }}>
          {occ
            ? `${t('recurring.due')} ${fmtDate(occ.dueDate)}${alsoOverdue ? ` · ${t('recurring.overdue')}` : ''}`
            : `${t('recurring.lastSeen')} ${fmtDate(item.occurred_at)}`}
        </div>
        {occ?.status === STATUS.PARTIAL && (
          <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 1 }}>
            {fmt(occ.remaining)} {t('recurring.left')}
          </div>
        )}
      </div>

      {/* Amount */}
      <div className="num" style={{
        fontSize: 14, fontWeight: 700, flexShrink: 0, minWidth: 72, textAlign: 'right',
        color: isIncome ? 'var(--pos)' : 'var(--ink-0)',
      }}>
        {isIncome ? '+' : '−'}{fmt(item.amount)}
      </div>

      {/* Actions — a rule can be paused, edited and deleted; a leftover series
          can only be adopted or unflagged. */}
      <div style={{ flexShrink: 0, display: 'flex', gap: 4 }}>
        {confirming ? (
          <>
            <button className="btn ghost sm" style={{ fontSize: 11, color: 'var(--neg)' }}
              disabled={working}
              onClick={() => (declared ? actions.destroy(item) : actions.remove(item))}>
              {declared ? t('obligation.confirmDelete') : t('recurring.confirm')}
            </button>
            <button className="btn ghost sm" style={{ fontSize: 11 }}
              onClick={() => setConfirming(false)}>✕</button>
          </>
        ) : declared ? (
          <>
            <button className="icon-btn sm-btn" disabled={working}
              title={paused ? t('obligation.resume') : t('obligation.pause')}
              onClick={() => actions.toggle(item)}>
              <Icon name={paused ? 'toggle-off' : 'toggle-on'} size={14} />
            </button>
            <button className="icon-btn sm-btn" title={t('obligation.editTitle')}
              onClick={() => actions.editRule(item)}>
              <Icon name="edit" size={13} />
            </button>
            <button className="icon-btn sm-btn" title={t('obligation.delete')}
              onClick={() => setConfirming(true)}>
              <Icon name="x" size={13} />
            </button>
          </>
        ) : (
          <>
            <button className="icon-btn sm-btn" style={{ color: 'var(--accent)' }}
              disabled={working} title={t('obligation.adopt')}
              aria-label={t('obligation.adopt')}
              onClick={() => actions.adopt(item)}>
              <Icon name={working ? 'recurring' : 'check'} size={13} />
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
