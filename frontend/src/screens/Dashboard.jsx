import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../lib/household'
import { useRecurring } from '../hooks/useRecurring'
import { useExchangeRates } from '../hooks/useExchangeRates'
import { toBase, BASE_CURRENCY } from '../lib/currency'
import {
  STATUS, statusLabel, toObligation, buildSchedule, groupByPeriod,
  periodBounds, isOutstanding,
} from '../lib/paymentSchedule'

function nowMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmtMonthLong(ym) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
}

function fmtMonthShort(ym) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-CA', { month: 'short' })
}

function fmtDay(d) {
  return d.toLocaleDateString('en-CA', { day: 'numeric', month: 'short' })
}

function fmtFullDay(d) {
  return d.toLocaleDateString('en-CA', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Amounts shown in the obligation's own currency — never converted for display,
// only for the cross-currency totals (see convertToBase below).
function fmtAmt(n, currency) {
  const abs = Math.abs(Number(n) || 0)
  return currency === 'COP'
    ? '$' + Math.round(abs).toLocaleString('es-CO')
    : '$' + abs.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const STATUS_TONE = {
  [STATUS.PAID]:      { bg: 'var(--pos-soft)',  fg: 'var(--pos)' },
  [STATUS.PARTIAL]:   { bg: 'var(--warn-soft)', fg: 'var(--warn)' },
  [STATUS.OVERDUE]:   { bg: 'var(--neg-soft)',  fg: 'var(--neg)' },
  [STATUS.DUE_TODAY]: { bg: 'var(--neg-soft)',  fg: 'var(--neg)' },
  [STATUS.UPCOMING]:  { bg: 'var(--bg-3)',      fg: 'var(--ink-1)' },
}

export default function Dashboard() {
  const [focusMonth, setFocusMonth] = useState(nowMonth)
  const [stats, setStats]           = useState(null)
  const [loading, setLoading]       = useState(true)
  const [showPaid, setShowPaid]     = useState(false)
  const { isFamily, myUserId, household, members, myName } = useHousehold()
  const didAutoJump = useRef(false)
  const navigate    = useNavigate()

  // Payments are scoped to the selected profile: own user in a personal profile,
  // the whole household in Family (which is what RLS already permits).
  const { items: recurringItems } = useRecurring({ userId: isFamily ? null : myUserId })

  // Obligations are a "today" view, independent of the month the stats above are
  // focused on, so cross-currency totals use the current month's rates.
  const currentMonth = useMemo(nowMonth, [])
  const { rates: liveRates } = useExchangeRates(currentMonth)
  const convertToBase = useMemo(
    () => (amount, currency) => toBase(amount, currency, liveRates),
    [liveRates]
  )

  const memberName = useMemo(() => {
    const map = {}
    ;(members || []).forEach(m => { map[m.user_id] = m.display_name })
    return map
  }, [members])
  // Ownership only needs spelling out when the household actually has more than one member.
  const showOwner = isFamily && (members?.length || 0) > 1

  const occurrences = useMemo(
    () => buildSchedule(recurringItems.map(toObligation), { today: new Date() }),
    [recurringItems]
  )
  const visibleOccurrences = useMemo(
    () => (showPaid ? occurrences : occurrences.filter(isOutstanding)),
    [occurrences, showPaid]
  )
  const periods = useMemo(
    () => groupByPeriod(visibleOccurrences, convertToBase),
    [visibleOccurrences, convertToBase]
  )
  // Period totals always describe the whole period, not just the rows on screen.
  const periodTotals = useMemo(() => {
    const map = {}
    groupByPeriod(occurrences, convertToBase).forEach(p => { map[p.ym] = p })
    return map
  }, [occurrences, convertToBase])

  const overdueCount  = occurrences.filter(o => o.isOverdue).length
  // The headline balance is what this month still owes — the per-period rows
  // below carry the rest, so it can't read as "all of this is due now".
  const thisPeriod    = periodTotals[currentMonth]
  const profileLabel  = isFamily
    ? `Family${household?.name ? ` · ${household.name}` : ''}`
    : (myName || 'My profile')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setStats(null)

      // Load 6 months ending at focusMonth
      const oldest  = shiftMonth(focusMonth, -5)
      const [oy, om] = oldest.split('-').map(Number)
      const [fy, fm] = focusMonth.split('-').map(Number)
      const start = new Date(oy, om - 1, 1).toISOString()
      const end   = new Date(fy, fm, 1).toISOString()

      const buildQuery = (withFx) => {
        const cols = withFx
          ? 'amount, type, occurred_at, category_id, exchange_rate, category:categories(name, color), account:accounts(currency)'
          : 'amount, type, occurred_at, category_id, category:categories(name, color), account:accounts(currency)'
        let q = supabase.from('transactions').select(cols)
          .gte('occurred_at', start).lt('occurred_at', end)
          .order('occurred_at', { ascending: true })
        if (!isFamily && myUserId) q = q.eq('user_id', myUserId)
        return q
      }
      let [txResult, { data: rateRows }] = await Promise.all([
        buildQuery(true),
        supabase.from('exchange_rates')
          .select('currency_code, rate_to_base, month')
          .lte('month', `${focusMonth}-01`)
          .order('month', { ascending: true }),
      ])
      // If exchange_rate column not in schema cache yet, fall back without it
      if (txResult.error) {
        console.warn('Dashboard query error, retrying without exchange_rate:', txResult.error.message)
        txResult = await buildQuery(false)
      }
      const txs = txResult.data
      // Effective rate per currency: latest saved rate on or before focusMonth
      const rateMap = {}
      ;(rateRows || []).forEach(r => { rateMap[r.currency_code] = Number(r.rate_to_base) })
      const toCAD = t => {
        const cur = t.account?.currency
        if (!cur || cur === BASE_CURRENCY) return t.amount
        if (t.exchange_rate) return t.amount * t.exchange_rate  // exact rate at txn time
        return toBase(t.amount, cur, rateMap)
      }

      // Auto-jump: on first load if focusMonth is empty, jump to last month with data
      if (!didAutoJump.current) {
        didAutoJump.current = true
        const curStart = new Date(fy, fm - 1, 1).toISOString()
        const curEnd   = new Date(fy, fm, 1).toISOString()
        const curTxs   = (txs || []).filter(t => t.occurred_at >= curStart && t.occurred_at < curEnd)
        if (curTxs.length === 0 && txs?.length > 0) {
          // Find the latest month in the 6-month window that has data
          for (let i = -1; i >= -5; i--) {
            const ym = shiftMonth(focusMonth, i)
            const [my, mm] = ym.split('-').map(Number)
            const ms = new Date(my, mm - 1, 1).toISOString()
            const me = new Date(my, mm, 1).toISOString()
            if (txs.some(t => t.occurred_at >= ms && t.occurred_at < me)) {
              setFocusMonth(ym)
              setLoading(false)
              return // will re-run with new focusMonth
            }
          }
        }
      }

      if (!txs?.length) { setStats({}); setLoading(false); return }

      const curStart  = new Date(fy, fm - 1, 1).toISOString()
      const curEnd    = new Date(fy, fm, 1).toISOString()
      const prevStart = new Date(fy, fm - 2, 1).toISOString()

      const cur  = txs.filter(t => t.occurred_at >= curStart && t.occurred_at < curEnd)
      const prev = txs.filter(t => t.occurred_at >= prevStart && t.occurred_at < curStart)

      const income   = cur.filter(t => t.amount > 0 && t.type !== 'transfer').reduce((s, t) => s + toCAD(t), 0)
      const expenses = cur.filter(t => t.amount < 0 && t.type !== 'transfer').reduce((s, t) => s + Math.abs(toCAD(t)), 0)
      const prevExp  = prev.filter(t => t.amount < 0 && t.type !== 'transfer').reduce((s, t) => s + Math.abs(toCAD(t)), 0)
      const expDelta = prevExp > 0 ? ((expenses - prevExp) / prevExp * 100).toFixed(1) : null

      const catMap = {}
      cur.filter(t => t.amount < 0 && t.type !== 'transfer' && t.category).forEach(t => {
        const k = t.category.name
        if (!catMap[k]) catMap[k] = { name: k, color: t.category.color || '#94a3b8', amount: 0 }
        catMap[k].amount += Math.abs(toCAD(t))
      })
      const topCats    = Object.values(catMap).sort((a, b) => b.amount - a.amount).slice(0, 6)
      const totalCat   = topCats.reduce((s, c) => s + c.amount, 0)
      const categories = topCats.map(c => ({ ...c, pct: totalCat ? Math.round(c.amount / totalCat * 100) : 0 }))

      const months = []
      for (let i = 5; i >= 0; i--) {
        const ym = shiftMonth(focusMonth, -i)
        const [my, mm] = ym.split('-').map(Number)
        const ms = new Date(my, mm - 1, 1).toISOString()
        const me = new Date(my, mm, 1).toISOString()
        const mTxs = txs.filter(t => t.occurred_at >= ms && t.occurred_at < me)
        months.push({
          label:    fmtMonthShort(ym),
          income:   mTxs.filter(t => t.amount > 0 && t.type !== 'transfer').reduce((s, t) => s + toCAD(t), 0),
          expenses: mTxs.filter(t => t.amount < 0 && t.type !== 'transfer').reduce((s, t) => s + Math.abs(toCAD(t)), 0),
          current:  i === 0,
        })
      }

      setStats({ income, expenses, expDelta, categories, months, txCount: cur.filter(t => t.type !== 'transfer').length })
      setLoading(false)
    }
    load()
  }, [focusMonth, isFamily, myUserId])

  const fmt  = n => '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  const fmtK = n => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : fmt(n)
  const todayLabel = new Date().toLocaleDateString('en-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const paymentsCard = occurrences.length > 0 && (
    <div className="card insight pay-card">
      <div className="insight-h">
        <div className="insight-icon" style={{ background: 'rgba(99,102,241,.14)', color: 'var(--accent)' }}>
          <Icon name="recurring" size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="insight-title">Upcoming Payments</div>
          <div className="insight-sub">
            {profileLabel}
            {overdueCount > 0 && (
              <> · <strong style={{ color: 'var(--neg)' }}>{overdueCount} overdue</strong></>
            )}
            {thisPeriod && (
              <> · {fmt(thisPeriod.outstandingBase)} outstanding in {fmtMonthLong(currentMonth)}</>
            )}
          </div>
        </div>
        <div className="pay-toggle">
          <button className={`btn sm ${showPaid ? 'ghost' : 'primary'}`}
            onClick={() => setShowPaid(false)}>Outstanding</button>
          <button className={`btn sm ${showPaid ? 'primary' : 'ghost'}`}
            onClick={() => setShowPaid(true)}>All</button>
        </div>
      </div>

      {periods.length === 0 ? (
        <div className="pay-empty">Every payment in this window is settled.</div>
      ) : periods.map(p => (
        <PeriodSection key={p.ym} period={p} totals={periodTotals[p.ym]}
          showOwner={showOwner} memberName={memberName} fmt={fmt}
          onOpen={() => navigate('/recurring')} />
      ))}
    </div>
  )

  const nav = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <button className="btn ghost sm" style={{ padding: '0 8px' }}
        onClick={() => { didAutoJump.current = true; setFocusMonth(m => shiftMonth(m, -1)) }}>←</button>
      <span style={{ fontSize: 12, color: 'var(--ink-2)', padding: '0 6px', minWidth: 110, textAlign: 'center' }}>
        {fmtMonthLong(focusMonth)}
      </span>
      <button className="btn ghost sm" style={{ padding: '0 8px' }}
        onClick={() => { didAutoJump.current = true; setFocusMonth(m => shiftMonth(m, 1)) }}>→</button>
    </div>
  )

  if (loading) return (
    <>
      <Topbar greet="Dashboard" date={todayLabel}>{nav}</Topbar>
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-3)' }}>Loading…</div>
    </>
  )

  // Obligations don't depend on the focused month, so they stay visible even when
  // that month has no transactions to summarise.
  if (!stats?.income && !stats?.expenses) return (
    <>
      <Topbar greet="Dashboard" date={todayLabel}>{nav}</Topbar>
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-3)' }}>
        No data for {fmtMonthLong(focusMonth)}.
      </div>
      {paymentsCard}
    </>
  )

  const savings = stats.income - stats.expenses
  const maxBar  = Math.max(...stats.months.map(m => Math.max(m.income, m.expenses)), 1)

  return (
    <>
      <Topbar greet="Dashboard" date={todayLabel}>{nav}</Topbar>

      <div className="card hero-balance">
        <div className="hero-left">
          <div className="card-title">{fmtMonthLong(focusMonth)}</div>
          <div className="num num-hero" style={{ color: savings < 0 ? 'var(--neg)' : undefined }}>
            {savings < 0 ? '−' : ''}{fmt(Math.abs(savings))}
          </div>
          <div className="hero-meta">
            <span className={`delta ${savings < 0 ? 'neg' : ''}`}>
              <Icon name={savings >= 0 ? 'trend-up' : 'trend-down'} size={11} />
              {stats.expDelta != null
                ? ` ${Math.abs(stats.expDelta)}% ${Number(stats.expDelta) > 0 ? 'more expenses' : 'less expenses'} than last month`
                : ' Net savings'}
            </span>
          </div>
          <div className="hero-bar">
            <div className="hero-bar-fill"
              style={{ width: `${stats.income > 0 ? Math.min(Math.max(savings / stats.income * 100, 0), 100) : 0}%` }} />
          </div>
          <div className="hero-bar-legend">
            <span><span className="dot" style={{ background: 'var(--pos)' }} /> Income {fmt(stats.income)}</span>
            <span><span className="dot" style={{ background: 'var(--neg)' }} /> Expenses {fmt(stats.expenses)}</span>
            <span className="hero-bar-total">Net {savings >= 0 ? '+' : ''}{fmt(savings)}</span>
          </div>
        </div>
        <div className="hero-right">
          <div className="hero-pill hero-pill-link"
            role="button" tabIndex={0}
            onClick={() => navigate('/income', { state: { month: focusMonth } })}
            onKeyDown={e => e.key === 'Enter' && navigate('/income', { state: { month: focusMonth } })}>
            <div className="hero-pill-h"><Icon name="income" size={13} style={{ color: 'var(--pos)' }} /><span>Income</span></div>
            <div className="num num-lg" style={{ color: 'var(--pos)' }}>{fmtK(stats.income)}</div>
            <div className="hero-pill-sub">{fmt(stats.income)} total</div>
            <Icon name="chevron-right" size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)' }} />
          </div>
          <div className="hero-pill hero-pill-link"
            role="button" tabIndex={0}
            onClick={() => navigate('/expenses', { state: { month: focusMonth } })}
            onKeyDown={e => e.key === 'Enter' && navigate('/expenses', { state: { month: focusMonth } })}>
            <div className="hero-pill-h"><Icon name="expense" size={13} style={{ color: 'var(--neg)' }} /><span>Expenses</span></div>
            <div className="num num-lg" style={{ color: 'var(--neg)' }}>{fmtK(stats.expenses)}</div>
            <div className="hero-pill-sub">{fmt(stats.expenses)} total</div>
            <Icon name="chevron-right" size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)' }} />
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <KPI icon="piggy"    tint="var(--accent-2)"
          label="Net savings"    value={fmtK(Math.abs(savings))}
          delta={savings >= 0 ? 'Positive' : 'Negative'} tone={savings >= 0 ? 'pos' : 'neg'} />
        <KPI icon="wallet"   tint="var(--pos)"
          label="Transactions"   value={String(stats.txCount)}
          delta={fmtMonthLong(focusMonth)} tone="pos" />
        <KPI icon="filter"   tint="var(--accent-3)"
          label="Top category"   value={stats.categories[0]?.name || '—'}
          delta={stats.categories[0] ? fmtK(stats.categories[0].amount) : ''} tone="warn" />
        <KPI icon="trend-up" tint="var(--warn)"
          label="Expense change" value={stats.expDelta != null ? `${Number(stats.expDelta) > 0 ? '+' : ''}${stats.expDelta}%` : '—'}
          delta="vs last month"  tone={Number(stats.expDelta) <= 0 ? 'pos' : 'warn'} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-h">
            <div><h3>Cash Flow</h3><p>Income vs Expenses · 6 months</p></div>
          </div>
          <div className="cashflow-legend">
            <span className="row" style={{ gap: 6 }}><span className="legend-dot" style={{ background: 'var(--accent)' }} /> Income</span>
            <span className="row" style={{ gap: 6 }}><span className="legend-dot" style={{ background: 'var(--accent-3)' }} /> Expenses</span>
          </div>
          <div className="bars">
            {stats.months.map((mo, i) => (
              <div key={i} className={`bar-col ${mo.current ? 'current' : ''}`}>
                <div className="bar-stack">
                  <div className="bar inc" style={{ height: `${(mo.income   / maxBar) * 100}%` }} />
                  <div className="bar exp" style={{ height: `${(mo.expenses / maxBar) * 100}%` }} />
                </div>
                <div className="bar-label">{mo.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <div><h3>Expenses by Category</h3><p>Distribution · {fmtMonthLong(focusMonth)}</p></div>
          </div>
          {stats.categories.length > 0 ? (
            <>
              <Donut categories={stats.categories} total={fmtK(stats.expenses)} />
              <div className="cat-list">
                {stats.categories.map(c => (
                  <div key={c.name} className="cat-row">
                    <span className="cat-dot" style={{ background: c.color }} />
                    <span className="cat-name">{c.name}</span>
                    <span className="cat-pct">{c.pct}%</span>
                    <span className="num cat-amt">{fmtK(c.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
              No expense data for {fmtMonthLong(focusMonth)}
            </div>
          )}
        </div>
      </div>

      {paymentsCard}
    </>
  )
}

// One payment period: the month an obligation belongs to, its exact span, and
// its totals. Totals describe the whole period even when paid rows are hidden.
function PeriodSection({ period, totals, showOwner, memberName, fmt, onOpen }) {
  const { first, last } = periodBounds(period.ym)
  const t = totals || period
  return (
    <div className="pay-period">
      <div className="pay-period-h">
        <div className="pay-period-id">
          <div className="pay-period-title">{fmtMonthLong(period.ym)}</div>
          <div className="pay-period-span">
            Payment period · {fmtDay(first)} – {fmtDay(last)}
          </div>
        </div>
        <div className="pay-period-tot">
          <div><span className="pay-tot-label">Scheduled</span>
            <span className="num">{fmt(t.scheduledBase)}</span></div>
          <div><span className="pay-tot-label">Outstanding</span>
            <span className="num" style={{ color: t.outstandingBase > 0 ? 'var(--neg)' : 'var(--pos)' }}>
              {fmt(t.outstandingBase)}
            </span></div>
          {t.inflowBase > 0 && (
            <div><span className="pay-tot-label">Expected in</span>
              <span className="num" style={{ color: 'var(--pos)' }}>{fmt(t.inflowBase)}</span></div>
          )}
        </div>
      </div>
      <div className="upcoming-list">
        {period.occurrences.map(o => (
          <PaymentRow key={o.id} occ={o} showOwner={showOwner}
            memberName={memberName} onOpen={onOpen} />
        ))}
      </div>
    </div>
  )
}

function PaymentRow({ occ, showOwner, memberName, onOpen }) {
  const ob    = occ.obligation
  const tone  = STATUS_TONE[occ.status] || STATUS_TONE[STATUS.UPCOMING]
  const owner = memberName[ob.ownerUserId] || ob.person || null
  const label = statusLabel(occ.status, ob.isIncome)
  const pct   = Math.round(occ.progress * 100)
  const d     = occ.daysFromDue
  const timing = occ.status === STATUS.PAID ? ''
               : d === 0 ? ' · today'
               : d < 0   ? ` · ${Math.abs(d)}d late`
               : ` · in ${d}d`

  return (
    <div className="up-row pay-row" role="button" tabIndex={0}
      title={`${ob.description} · due ${fmtFullDay(occ.dueDate)} · ${label}`}
      onClick={onOpen} onKeyDown={e => e.key === 'Enter' && onOpen()}>
      <div className="up-date pay-date" style={{ background: tone.bg, color: tone.fg }}>
        <div className="pay-date-day">{occ.dueDate.getDate()}</div>
        <div className="pay-date-mon">
          {occ.dueDate.toLocaleDateString('en-CA', { month: 'short' })}
        </div>
      </div>

      <div className="pay-main">
        <div className="pay-main-h">
          <span className="up-name">{ob.description}</span>
          <span className="pay-chip" style={{ background: tone.bg, color: tone.fg }}>{label}</span>
          {/* A partially paid obligation past its due date is both. */}
          {occ.isOverdue && occ.status === STATUS.PARTIAL && (
            <span className="pay-chip" style={{ background: 'var(--neg-soft)', color: 'var(--neg)' }}>
              Overdue
            </span>
          )}
          {showOwner && owner && <span className="pay-owner">{owner}</span>}
        </div>
        <div className="up-sub">
          Due {fmtFullDay(occ.dueDate)}{timing}
          {` · ${ob.freqLabel}`}
          {ob.accountName ? ` · ${ob.accountName}` : ''}
          {/* Actual payment date, kept distinct from the due date. */}
          {occ.lastPaymentDate ? ` · paid ${fmtDay(occ.lastPaymentDate)}` : ''}
        </div>
        {occ.status === STATUS.PARTIAL && (
          <div className="pay-progress">
            <div className="pay-progress-bar">
              <div className="pay-progress-fill" style={{ width: `${pct}%`, background: tone.fg }} />
            </div>
            <div className="pay-progress-txt">
              {pct}% · {fmtAmt(occ.paid, ob.currency)} of {fmtAmt(occ.scheduled, ob.currency)} ·{' '}
              <strong style={{ color: 'var(--neg)' }}>{fmtAmt(occ.remaining, ob.currency)} left</strong>
            </div>
          </div>
        )}
      </div>

      <div className="pay-amt-col">
        <div className="up-amt" style={{ color: ob.isIncome ? 'var(--pos)' : 'var(--neg)' }}>
          {ob.isIncome ? '+' : '−'}{fmtAmt(occ.scheduled, ob.currency)}
        </div>
        {ob.currency && ob.currency !== BASE_CURRENCY && (
          <div className="pay-amt-sub">{ob.currency}</div>
        )}
      </div>
    </div>
  )
}

function KPI({ icon, label, value, delta, tone = 'pos', tint }) {
  return (
    <div className="card kpi">
      <div className="kpi-h">
        <div className="kpi-icon" style={{ background: `color-mix(in oklab, ${tint} 18%, transparent)`, color: tint }}>
          <Icon name={icon} size={16} />
        </div>
      </div>
      <div className="num num-lg" style={{ marginTop: 14 }}>{value}</div>
      <div className="kpi-foot">
        <span className="kpi-label">{label}</span>
        <span className={`delta ${tone === 'warn' ? 'warn' : tone === 'neg' ? 'neg' : ''}`}>{delta}</span>
      </div>
    </div>
  )
}

function Donut({ categories, total }) {
  const r = 58, c = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="donut-wrap">
      <svg width="180" height="180" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--bg-3)" strokeWidth="14" />
        {categories.map((cat, i) => {
          const len = (cat.pct / 100) * c
          const dash = `${len} ${c - len}`
          const dashOffset = -offset
          offset += len
          return <circle key={i} cx="80" cy="80" r={r} fill="none"
            stroke={cat.color} strokeWidth="14"
            strokeDasharray={dash} strokeDashoffset={dashOffset}
            strokeLinecap="butt" transform="rotate(-90 80 80)" />
        })}
      </svg>
      <div className="donut-center">
        <div className="num num-lg">{total}</div>
        <div className="donut-sub">Total</div>
      </div>
    </div>
  )
}
