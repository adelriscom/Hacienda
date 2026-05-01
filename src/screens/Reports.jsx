import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../lib/household'

function nowMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function fmtMonth(ym) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
}

function fmtMonthShort(ym) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-CA', { month: 'short' })
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number)
  const start = `${ym}-01`
  const end   = new Date(y, m, 1).toISOString().slice(0, 10)
  return { start, end }
}

const fmt  = n => '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtK = n => Math.abs(n) >= 1000 ? `$${(Math.abs(n) / 1000).toFixed(1)}k` : fmt(n)

export default function Reports() {
  const { t } = useTranslation()
  const [focusMonth, setFocusMonth] = useState(nowMonth)
  const [txs,     setTxs]     = useState([])
  const [loading, setLoading] = useState(true)
  const { isFamily, myUserId } = useHousehold()

  // Load 6 months of data centred on focusMonth (5 before + focusMonth)
  useEffect(() => {
    async function load() {
      setLoading(true)
      const oldest  = shiftMonth(focusMonth, -5)
      const { start } = monthRange(oldest)
      const { end }   = monthRange(focusMonth)

      let query = supabase
        .from('transactions')
        .select('occurred_at, amount, type, category_id, person, category:categories(name, color)')
        .gte('occurred_at', start)
        .lt('occurred_at', end)
        .order('occurred_at', { ascending: true })
      if (!isFamily && myUserId) query = query.eq('user_id', myUserId)

      const { data } = await query
      setTxs(data || [])
      setLoading(false)
    }
    load()
  }, [focusMonth, isFamily, myUserId])

  // Focus month transactions
  const { start: fStart, end: fEnd } = monthRange(focusMonth)
  const focusTxs = useMemo(
    () => txs.filter(t => t.occurred_at >= fStart && t.occurred_at < fEnd),
    [txs, fStart, fEnd]
  )

  // Previous month for delta
  const prevMonth   = shiftMonth(focusMonth, -1)
  const { start: pStart, end: pEnd } = monthRange(prevMonth)
  const prevTxs = useMemo(
    () => txs.filter(t => t.occurred_at >= pStart && t.occurred_at < pEnd),
    [txs, pStart, pEnd]
  )

  const income   = focusTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const expenses = focusTxs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  const net      = income - expenses
  const prevExp  = prevTxs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  const expDelta = prevExp > 0 ? ((expenses - prevExp) / prevExp * 100).toFixed(1) : null

  // 6-month trend
  const trendMonths = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const ym = shiftMonth(focusMonth, i - 5)
      const { start, end } = monthRange(ym)
      const mTxs = txs.filter(t => t.occurred_at >= start && t.occurred_at < end)
      return {
        label:    fmtMonthShort(ym),
        income:   mTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
        expenses: mTxs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0),
        current:  ym === focusMonth,
      }
    })
  }, [txs, focusMonth])

  const maxBar = Math.max(...trendMonths.map(m => Math.max(m.income, m.expenses)), 1)

  // Category breakdown for focus month
  const catBreakdown = useMemo(() => {
    const map = {}
    focusTxs.filter(t => t.amount < 0 && t.category).forEach(t => {
      const k = t.category_id
      if (!map[k]) map[k] = { name: t.category.name, color: t.category.color || '#94a3b8', amount: 0, count: 0 }
      map[k].amount += Math.abs(t.amount)
      map[k].count++
    })
    const sorted = Object.values(map).sort((a, b) => b.amount - a.amount)
    const total  = sorted.reduce((s, c) => s + c.amount, 0)
    return sorted.map(c => ({ ...c, pct: total ? Math.round(c.amount / total * 100) : 0 }))
  }, [focusTxs])

  // Person breakdown
  const personBreakdown = useMemo(() => {
    const map = { Alexander: 0, Marcela: 0, Shared: 0 }
    focusTxs.filter(t => t.amount < 0).forEach(t => {
      const p = t.person || 'Shared'
      if (p in map) map[p] += Math.abs(t.amount)
    })
    const total = Object.values(map).reduce((s, v) => s + v, 0)
    return Object.entries(map)
      .filter(([, v]) => v > 0)
      .map(([name, amount]) => ({ name, amount, pct: total ? Math.round(amount / total * 100) : 0 }))
      .sort((a, b) => b.amount - a.amount)
  }, [focusTxs])

  return (
    <>
      <Topbar greet={t('reports.title')} date={fmtMonth(focusMonth)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button className="btn ghost sm" style={{ padding: '0 8px' }}
            onClick={() => setFocusMonth(m => shiftMonth(m, -1))}>←</button>
          <span style={{ fontSize: 12, color: 'var(--ink-2)', padding: '0 6px', minWidth: 90, textAlign: 'center' }}>
            {fmtMonth(focusMonth)}
          </span>
          <button className="btn ghost sm" style={{ padding: '0 8px' }}
            onClick={() => setFocusMonth(m => shiftMonth(m, 1))}>→</button>
        </div>
      </Topbar>

      {/* KPI row */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPI label={t('reports.income')}   value={fmtK(income)}   color="var(--pos)" />
        <KPI label={t('reports.expenses')} value={fmtK(expenses)} color="var(--accent-3)" />
        <KPI label={t('reports.net')}      value={(net >= 0 ? '+' : '−') + fmtK(net)}
          color={net >= 0 ? 'var(--pos)' : 'var(--neg)'} />
        <KPI label={t('reports.vsLastMonth')}
          value={expDelta != null ? `${Number(expDelta) > 0 ? '+' : ''}${expDelta}%` : '—'}
          color={expDelta == null ? 'var(--ink-2)' : Number(expDelta) <= 0 ? 'var(--pos)' : 'var(--neg)'}
          sub={t('reports.expenses')} />
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>{t('reports.loading')}</div>
      ) : (
        <div className="grid-2">
          {/* 6-month cash flow */}
          <div className="card">
            <div className="card-h">
              <div><h3>{t('reports.trendTitle')}</h3><p>{t('reports.trendSub')}</p></div>
            </div>
            <div className="cashflow-legend">
              <span className="row" style={{ gap: 6 }}>
                <span className="legend-dot" style={{ background: 'var(--accent)' }} /> {t('reports.income')}
              </span>
              <span className="row" style={{ gap: 6 }}>
                <span className="legend-dot" style={{ background: 'var(--accent-3)' }} /> {t('reports.expenses')}
              </span>
            </div>
            <div className="bars">
              {trendMonths.map((mo, i) => (
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

          {/* Category breakdown */}
          <div className="card">
            <div className="card-h">
              <div><h3>{t('reports.catTitle')}</h3><p>{fmtMonth(focusMonth)}</p></div>
              <span className="num" style={{ fontSize: 13, fontWeight: 700 }}>{fmtK(expenses)}</span>
            </div>
            {catBreakdown.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
                {t('reports.noExpenses')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {catBreakdown.map(c => (
                  <div key={c.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-0)' }}>{c.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{c.count} tx</span>
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{c.pct}%</span>
                        <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(c.amount)}</span>
                      </div>
                    </div>
                    <div style={{ height: 5, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${c.pct}%`, background: c.color, borderRadius: 3, transition: 'width .4s' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Person breakdown */}
          {personBreakdown.length > 0 && (
            <div className="card">
              <div className="card-h">
                <div><h3>{t('reports.personTitle')}</h3><p>{fmtMonth(focusMonth)}</p></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {personBreakdown.map(p => (
                  <div key={p.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</span>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{p.pct}%</span>
                        <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(p.amount)}</span>
                      </div>
                    </div>
                    <div style={{ height: 7, background: 'var(--bg-3)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${p.pct}%`, borderRadius: 4, transition: 'width .4s',
                        background: p.name === 'Alexander' ? 'linear-gradient(90deg,#6366f1,#a855f7)'
                          : p.name === 'Marcela' ? 'linear-gradient(90deg,#ec4899,#f97316)'
                          : 'var(--bg-3)',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Monthly totals table */}
          <div className="card">
            <div className="card-h">
              <div><h3>{t('reports.monthlyTable')}</h3><p>{t('reports.last6')}</p></div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <th style={{ textAlign: 'left',  padding: '6px 4px', color: 'var(--ink-3)', fontWeight: 600 }}>{t('reports.month')}</th>
                  <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--ink-3)', fontWeight: 600 }}>{t('reports.income')}</th>
                  <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--ink-3)', fontWeight: 600 }}>{t('reports.expenses')}</th>
                  <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--ink-3)', fontWeight: 600 }}>{t('reports.net')}</th>
                </tr>
              </thead>
              <tbody>
                {[...trendMonths].reverse().map((mo, i) => {
                  const n = mo.income - mo.expenses
                  return (
                    <tr key={i} style={{
                      borderBottom: '1px solid var(--line)',
                      background: mo.current ? 'rgba(99,102,241,0.06)' : 'transparent',
                    }}>
                      <td style={{ padding: '7px 4px', fontWeight: mo.current ? 700 : 400, color: mo.current ? 'var(--accent)' : 'var(--ink-0)' }}>
                        {mo.label}
                      </td>
                      <td className="num" style={{ textAlign: 'right', padding: '7px 4px', color: 'var(--pos)' }}>
                        {mo.income > 0 ? fmtK(mo.income) : '—'}
                      </td>
                      <td className="num" style={{ textAlign: 'right', padding: '7px 4px' }}>
                        {mo.expenses > 0 ? fmtK(mo.expenses) : '—'}
                      </td>
                      <td className="num" style={{ textAlign: 'right', padding: '7px 4px', fontWeight: 600,
                        color: n >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                        {mo.income === 0 && mo.expenses === 0 ? '—' : (n >= 0 ? '+' : '−') + fmtK(n)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

function KPI({ label, value, color, sub }) {
  return (
    <div className="card kpi">
      <div className="num num-lg" style={{ marginTop: 8, color }}>{value}</div>
      <div className="kpi-foot" style={{ marginTop: 8 }}>
        <span className="kpi-label">{label}</span>
        {sub && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{sub}</span>}
      </div>
    </div>
  )
}
