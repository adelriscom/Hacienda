import { useState, useEffect } from 'react'
import Icon from '../components/Icon'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../lib/household'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const { isFamily, myUserId } = useHousehold()

  useEffect(() => {
    async function load() {
      const now   = new Date()
      const start = new Date(now.getFullYear(), now.getMonth() - 5, 1)

      let query = supabase
        .from('transactions')
        .select('amount, type, occurred_at, category_id, account_id, category:categories(name, color)')
        .gte('occurred_at', start.toISOString())
        .order('occurred_at', { ascending: true })
      if (!isFamily && myUserId) query = query.eq('user_id', myUserId)
      const { data: txs } = await query

      if (!txs?.length) { setStats({}); return }

      const curStart  = new Date(now.getFullYear(), now.getMonth(),     1).toISOString()
      const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()

      const cur  = txs.filter(t => t.occurred_at >= curStart)
      const prev = txs.filter(t => t.occurred_at >= prevStart && t.occurred_at < curStart)

      const income   = cur.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
      const expenses = cur.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
      const prevExp  = prev.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
      const expDelta = prevExp > 0 ? ((expenses - prevExp) / prevExp * 100).toFixed(1) : null

      // Category breakdown for current month
      const catMap = {}
      cur.filter(t => t.amount < 0 && t.category).forEach(t => {
        const k = t.category.name
        if (!catMap[k]) catMap[k] = { name: k, color: t.category.color || '#94a3b8', amount: 0 }
        catMap[k].amount += Math.abs(t.amount)
      })
      const topCats = Object.values(catMap).sort((a, b) => b.amount - a.amount).slice(0, 6)
      const totalCat = topCats.reduce((s, c) => s + c.amount, 0)
      const categories = topCats.map(c => ({ ...c, pct: totalCat ? Math.round(c.amount / totalCat * 100) : 0 }))

      // Monthly cash flow (last 6 months)
      const months = []
      for (let i = 5; i >= 0; i--) {
        const s = new Date(now.getFullYear(), now.getMonth() - i,     1).toISOString()
        const e = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).toISOString()
        const label = new Date(now.getFullYear(), now.getMonth() - i).toLocaleDateString('en-CA', { month: 'short' })
        const mTxs = txs.filter(t => t.occurred_at >= s && t.occurred_at < e)
        months.push({
          label,
          income:   mTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
          expenses: mTxs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0),
          current:  i === 0,
        })
      }

      setStats({ income, expenses, expDelta, categories, months, txCount: cur.length })
    }
    load()
  }, [isFamily, myUserId])

  const fmt  = n => '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  const fmtK = n => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : fmt(n)
  const today = new Date().toLocaleDateString('en-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  if (!stats) return (
    <>
      <Topbar greet="Dashboard" date={today} />
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-3)' }}>Loading…</div>
    </>
  )

  if (!stats.income && !stats.expenses) return (
    <>
      <Topbar greet="Dashboard" date={today} />
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-3)' }}>No data for the current period.</div>
    </>
  )

  const savings = stats.income - stats.expenses
  const maxBar  = Math.max(...stats.months.map(m => Math.max(m.income, m.expenses)), 1)

  return (
    <>
      <Topbar greet="Dashboard" date={today} />

      <div className="card hero-balance">
        <div className="hero-left">
          <div className="card-title">This month</div>
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
          <div className="hero-pill">
            <div className="hero-pill-h"><Icon name="income" size={13} style={{ color: 'var(--pos)' }} /><span>Income</span></div>
            <div className="num num-lg">{fmtK(stats.income)}</div>
            <div className="hero-pill-sub">This month</div>
          </div>
          <div className="hero-pill">
            <div className="hero-pill-h"><Icon name="expense" size={13} style={{ color: 'var(--neg)' }} /><span>Expenses</span></div>
            <div className="num num-lg">{fmtK(stats.expenses)}</div>
            <div className="hero-pill-sub">This month</div>
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <KPI icon="piggy"    tint="var(--accent-2)"
          label="Net savings"     value={fmtK(Math.abs(savings))}
          delta={savings >= 0 ? 'Positive' : 'Negative'}   tone={savings >= 0 ? 'pos' : 'neg'} />
        <KPI icon="wallet"   tint="var(--pos)"
          label="Transactions"    value={String(stats.txCount)}
          delta="this month"                                  tone="pos" />
        <KPI icon="filter"   tint="var(--accent-3)"
          label="Top category"    value={stats.categories[0]?.name || '—'}
          delta={stats.categories[0] ? fmtK(stats.categories[0].amount) : ''}  tone="warn" />
        <KPI icon="trend-up" tint="var(--warn)"
          label="Expense change"  value={stats.expDelta != null ? `${Number(stats.expDelta) > 0 ? '+' : ''}${stats.expDelta}%` : '—'}
          delta="vs last month"   tone={Number(stats.expDelta) <= 0 ? 'pos' : 'warn'} />
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
            <div><h3>Expenses by Category</h3><p>Distribution this month</p></div>
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
              No expense data this month
            </div>
          )}
        </div>
      </div>
    </>
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
