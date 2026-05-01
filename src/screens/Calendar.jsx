import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Topbar from '../components/Topbar'
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

const fmtAmt = n => '$' + Math.abs(n).toLocaleString('en-CA', { maximumFractionDigits: 0 })

export default function CalendarScreen() {
  const { t } = useTranslation()
  const [filterMonth, setFilterMonth] = useState(nowMonth)
  const [txs,     setTxs]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [y, m] = filterMonth.split('-').map(Number)
      const start  = `${filterMonth}-01`
      const end    = new Date(y, m, 1).toISOString().slice(0, 10)

      const { data } = await supabase
        .from('transactions')
        .select('id, occurred_at, description, amount, type, category:categories(name, color)')
        .gte('occurred_at', start)
        .lt('occurred_at', end)
        .order('occurred_at', { ascending: true })

      setTxs(data || [])
      setLoading(false)
    }
    load()
  }, [filterMonth])

  // Group by day number
  const byDay = useMemo(() => {
    const map = {}
    txs.forEach(t => {
      const day = new Date(t.occurred_at).getDate()
      if (!map[day]) map[day] = []
      map[day].push(t)
    })
    return map
  }, [txs])

  // Build calendar grid cells
  const [year, month] = filterMonth.split('-').map(Number)
  const firstWeekday  = new Date(year, month - 1, 1).getDay()
  const daysInMonth   = new Date(year, month, 0).getDate()
  const todayNum      = (() => {
    const n = new Date()
    return n.getFullYear() === year && n.getMonth() + 1 === month ? n.getDate() : -1
  })()

  const cells = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  // Sidebar: last 10 transactions of the month sorted newest first
  const sidebarTxs = [...txs].reverse().slice(0, 12)

  const totalIncome   = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const totalExpenses = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)

  const WEEKDAYS = t('cal.weekdays', { returnObjects: true })

  return (
    <>
      <Topbar greet={t('cal.title')}
        date={t('cal.subtitle', { month: fmtMonth(filterMonth), total: txs.length })}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button className="btn ghost sm" style={{ padding: '0 8px' }}
            onClick={() => setFilterMonth(m => shiftMonth(m, -1))}>←</button>
          <span style={{ fontSize: 12, color: 'var(--ink-2)', padding: '0 6px', minWidth: 90, textAlign: 'center' }}>
            {fmtMonth(filterMonth)}
          </span>
          <button className="btn ghost sm" style={{ padding: '0 8px' }}
            onClick={() => setFilterMonth(m => shiftMonth(m, 1))}>→</button>
        </div>
      </Topbar>

      {/* Month summary strip */}
      {!loading && txs.length > 0 && (
        <div style={{
          display: 'flex', gap: 10, marginBottom: 12,
        }}>
          <SummaryPill label={t('cal.summaryIncome')}   value={fmtAmt(totalIncome)}   color="var(--pos)" />
          <SummaryPill label={t('cal.summaryExpenses')} value={fmtAmt(totalExpenses)} color="var(--accent)" />
          <SummaryPill label={t('cal.summaryNet')}
            value={(totalIncome - totalExpenses >= 0 ? '+' : '−') + fmtAmt(totalIncome - totalExpenses)}
            color={totalIncome - totalExpenses >= 0 ? 'var(--pos)' : 'var(--neg)'} />
          <SummaryPill label={t('cal.summaryTxs')} value={String(txs.length)} color="var(--ink-2)" />
        </div>
      )}

      <div className="cal-grid">
        {/* Main calendar */}
        <div className="card cal-main">
          <div className="card-h" style={{ marginBottom: 4 }}>
            <div><h3>{fmtMonth(filterMonth)}</h3></div>
          </div>

          <div className="cal-weekdays">
            {WEEKDAYS.map(d => <div key={d}>{d}</div>)}
          </div>

          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>{t('cal.loading')}</div>
          ) : (
            <div className="cal-days">
              {cells.map((day, i) => {
                if (day === null) return <div key={i} className="cal-cell cal-empty" />
                const events = byDay[day] || []
                const visible = events.slice(0, 2)
                const overflow = events.length - visible.length
                return (
                  <div key={i} className={`cal-cell ${day === todayNum ? 'cal-today' : ''}`}>
                    <div className="cal-num">{day}</div>
                    <div className="cal-events">
                      {visible.map(e => (
                        <div key={e.id}
                          className={`cal-evt ${e.amount > 0 ? 'cal-evt-income' : e.type === 'transfer' ? 'cal-evt-transfer' : 'cal-evt-exp'}`}>
                          <span className="cal-evt-name">{e.description}</span>
                          <span className="cal-evt-amt">{fmtAmt(e.amount)}</span>
                        </div>
                      ))}
                      {overflow > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--ink-3)', paddingLeft: 2 }}>
                          +{overflow} {t('cal.more')}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="card cal-sidebar" style={{ padding: '18px 16px' }}>
          <div className="card-h" style={{ marginBottom: 12 }}>
            <div>
              <h3>{t('cal.listTitle')}</h3>
              <p>{fmtMonth(filterMonth)}</p>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>{t('cal.loading')}</div>
          ) : sidebarTxs.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>{t('cal.empty')}</div>
          ) : (
            <div className="cal-list">
              {sidebarTxs.map(tx => {
                const isIncome   = tx.amount > 0
                const isTransfer = tx.type === 'transfer'
                const evtClass   = isIncome ? 'cal-evt-income' : isTransfer ? 'cal-evt-transfer' : 'cal-evt-exp'
                const d = new Date(tx.occurred_at)
                const dateStr = d.toLocaleDateString('en-CA', { day: 'numeric', month: 'short' })
                return (
                  <div key={tx.id} className="cal-list-row">
                    <div className={`cal-list-dot ${evtClass}`}
                      style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="cal-list-name" style={{
                        fontSize: 12.5, fontWeight: 600,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {tx.description}
                      </div>
                      {tx.category && (
                        <div className="cal-list-sub" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>
                          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                            background: tx.category.color, marginRight: 4, verticalAlign: 'middle' }} />
                          {tx.category.name}
                        </div>
                      )}
                    </div>
                    <div className="cal-list-right" style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div className={`num cal-list-amt`}
                        style={{ fontSize: 13, fontWeight: 700, color: isIncome ? 'var(--pos)' : 'var(--ink-0)' }}>
                        {isIncome ? '+' : '−'}{fmtAmt(tx.amount)}
                      </div>
                      <div className="cal-list-date" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>
                        {dateStr}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function SummaryPill({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--line)',
      borderRadius: 'var(--r-md)', padding: '8px 14px',
      display: 'flex', flexDirection: 'column', gap: 2, flex: 1,
    }}>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {label}
      </div>
      <div className="num" style={{ fontSize: 15, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}
