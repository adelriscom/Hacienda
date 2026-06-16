import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../lib/household'
import { useExchangeRates } from '../hooks/useExchangeRates'
import { toBase, BASE_CURRENCY } from '../lib/currency'

function nowMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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
  const end = new Date(y, m, 1).toISOString().slice(0, 10)
  return { start, end }
}

const fmt = n => '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtK = n => Math.abs(n) >= 1000 ? `$${(Math.abs(n) / 1000).toFixed(1)}k` : fmt(n)
const sign = n => n >= 0 ? `+${fmtK(n)}` : `−${fmtK(n)}`

const PERSON_COLORS = {
  default: ['linear-gradient(135deg,#6366f1,#a855f7)', 'linear-gradient(135deg,#ec4899,#f97316)'],
  bars:    ['#6366f1', '#ec4899'],
}

function personColor(name, members, idx = 0) {
  const gradients = PERSON_COLORS.default
  const bars      = PERSON_COLORS.bars
  const i = members.findIndex(m => m.display_name === name)
  const slot = i >= 0 ? i : idx
  return { gradient: gradients[slot % gradients.length], bar: bars[slot % bars.length] }
}

export default function FamilyView() {
  const { t } = useTranslation()
  const { household, members, viewMode, setViewMode, isFamily, myUserId } = useHousehold()
  const [focusMonth, setFocusMonth] = useState(nowMonth)
  const [txs,    setTxs]    = useState([])
  const [loading, setLoading] = useState(false)
  const { rates } = useExchangeRates(focusMonth)
  const toCAD = t => {
    const cur = t.account?.currency
    if (!cur || cur === BASE_CURRENCY) return t.amount
    if (t.exchange_rate) return t.amount * t.exchange_rate
    return toBase(t.amount, cur, rates)
  }

  // Unique named persons from members
  const memberNames = useMemo(() => members.map(m => m.display_name), [members])

  useEffect(() => {
    if (!isFamily) return
    async function load() {
      setLoading(true)
      const oldest = shiftMonth(focusMonth, -5)
      const { start } = monthRange(oldest)
      const { end }   = monthRange(focusMonth)
      const cols = (fx) => fx
        ? 'occurred_at, amount, type, category_id, person, status, exchange_rate, category:categories(name, color), account:accounts(currency)'
        : 'occurred_at, amount, type, category_id, person, status, category:categories(name, color), account:accounts(currency)'
      let result = await supabase.from('transactions').select(cols(true))
        .gte('occurred_at', start).lt('occurred_at', end).neq('type', 'transfer')
        .neq('status', 'ghost').neq('status', 'duplicate')
        .order('occurred_at', { ascending: true })
      if (result.error) {
        console.warn('FamilyView query error, retrying without exchange_rate:', result.error.message)
        result = await supabase.from('transactions').select(cols(false))
          .gte('occurred_at', start).lt('occurred_at', end).neq('type', 'transfer')
          .neq('status', 'ghost').neq('status', 'duplicate')
          .order('occurred_at', { ascending: true })
      }
      setTxs(result.data || [])
      setLoading(false)
    }
    load()
  }, [focusMonth, isFamily])

  const { start: fStart, end: fEnd } = monthRange(focusMonth)
  const focusTxs = useMemo(
    () => txs.filter(t => t.occurred_at >= fStart && t.occurred_at < fEnd),
    [txs, fStart, fEnd]
  )

  // Per-person stats for focus month
  const personStats = useMemo(() => {
    const stats = {}
    memberNames.forEach(name => { stats[name] = { income: 0, expenses: 0 } })
    stats['Shared'] = { income: 0, expenses: 0 }

    focusTxs.forEach(tx => {
      const person = tx.person || 'Shared'
      const bucket = stats[person] || (stats[person] = { income: 0, expenses: 0 })
      const cad = toCAD(tx)
      if (cad > 0) bucket.income   += cad
      else         bucket.expenses += Math.abs(cad)
    })
    return stats
  }, [focusTxs, memberNames, rates])

  const householdIncome   = Object.values(personStats).reduce((s, p) => s + p.income, 0)
  const householdExpenses = Object.values(personStats).reduce((s, p) => s + p.expenses, 0)
  const householdNet      = householdIncome - householdExpenses

  // 6-month trend per person
  const trendData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const ym = shiftMonth(focusMonth, i - 5)
      const { start, end } = monthRange(ym)
      const mTxs = txs.filter(t => t.occurred_at >= start && t.occurred_at < end)
      const perPerson = {}
      memberNames.forEach(name => { perPerson[name] = { income: 0, expenses: 0 } })
      mTxs.forEach(tx => {
        const person = tx.person
        if (!person || !perPerson[person]) return
        const cad = toCAD(tx)
        if (cad > 0) perPerson[person].income   += cad
        else         perPerson[person].expenses += Math.abs(cad)
      })
      return { label: fmtMonthShort(ym), current: ym === focusMonth, perPerson }
    })
  }, [txs, focusMonth, memberNames, rates])

  const maxBar = useMemo(() => {
    let max = 1
    trendData.forEach(mo => {
      memberNames.forEach(name => {
        max = Math.max(max, mo.perPerson[name]?.expenses || 0)
      })
    })
    return max
  }, [trendData, memberNames])

  // Category breakdown with per-person split
  const catBreakdown = useMemo(() => {
    const map = {}
    focusTxs.filter(tx => tx.amount < 0 && tx.category).forEach(tx => {
      const k = tx.category_id
      if (!map[k]) map[k] = { name: tx.category.name, color: tx.category.color || '#94a3b8', total: 0, byPerson: {} }
      const cad = Math.abs(toCAD(tx))
      map[k].total += cad
      const p = tx.person || 'Shared'
      map[k].byPerson[p] = (map[k].byPerson[p] || 0) + cad
    })
    const sorted = Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10)
    const grandTotal = sorted.reduce((s, c) => s + c.total, 0)
    return sorted.map(c => ({ ...c, pct: grandTotal ? Math.round(c.total / grandTotal * 100) : 0 }))
  }, [focusTxs, rates])

  // Not in family mode — show prompt
  if (!household) {
    return (
      <>
        <Topbar greet={t('family.title')} date="" />
        <div style={{ padding: '64px 32px', textAlign: 'center', color: 'var(--ink-3)' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>👨‍👩</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-1)', marginBottom: 8 }}>{t('family.noHousehold')}</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>{t('family.noHouseholdSub')}</div>
        </div>
      </>
    )
  }

  if (!isFamily) {
    return (
      <>
        <Topbar greet={t('family.title')} date="" />
        <div style={{ padding: '64px 32px', textAlign: 'center', color: 'var(--ink-3)' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>👨‍👩</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-1)', marginBottom: 8 }}>{t('family.notFamilyMode')}</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>{t('family.notFamilyModeSub')}</div>
          <button className="btn primary" onClick={() => setViewMode('family')}>{t('family.switchToFamily')}</button>
        </div>
      </>
    )
  }

  return (
    <>
      <Topbar greet={t('family.title')} date={household.name}>
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

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>{t('family.loading')}</div>
      ) : (
        <>
          {/* ── Side-by-side member cards ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${memberNames.length}, 1fr) 1fr`,
            gap: 12,
            marginBottom: 20,
          }}>
            {memberNames.map((name, idx) => {
              const s = personStats[name] || { income: 0, expenses: 0 }
              const net = s.income - s.expenses
              const shared = personStats['Shared'] || { expenses: 0 }
              const colors = personColor(name, members, idx)
              return (
                <div key={name} className="card" style={{ borderTop: `3px solid ${colors.bar}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%',
                      background: colors.gradient,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: 'white', flexShrink: 0,
                    }}>{name.slice(0, 2).toUpperCase()}</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink-0)' }}>{name}</div>
                  </div>
                  <StatRow label={t('family.income')}   value={fmtK(s.income)}   color="var(--pos)" />
                  <StatRow label={t('family.expenses')} value={fmtK(s.expenses)} color="var(--accent-3)" />
                  {idx === memberNames.length - 1 && shared.expenses > 0 && (
                    <StatRow label={t('family.shared')} value={fmtK(shared.expenses)} color="var(--ink-3)" small />
                  )}
                  <div style={{ borderTop: '1px solid var(--line)', marginTop: 10, paddingTop: 10 }}>
                    <StatRow label={t('family.net')}
                      value={sign(net)}
                      color={net >= 0 ? 'var(--pos)' : 'var(--neg)'}
                      bold />
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <SavingsBar income={s.income} expenses={s.expenses} color={colors.bar} />
                  </div>
                </div>
              )
            })}

            {/* Household total card */}
            <div className="card" style={{ borderTop: '3px solid var(--accent)', background: 'rgba(99,102,241,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: 'linear-gradient(135deg,var(--accent),var(--accent-2))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, flexShrink: 0,
                }}>🏠</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink-0)' }}>{t('family.household')}</div>
              </div>
              <StatRow label={t('family.income')}   value={fmtK(householdIncome)}   color="var(--pos)" />
              <StatRow label={t('family.expenses')} value={fmtK(householdExpenses)} color="var(--accent-3)" />
              <div style={{ borderTop: '1px solid var(--line)', marginTop: 10, paddingTop: 10 }}>
                <StatRow label={t('family.net')}
                  value={sign(householdNet)}
                  color={householdNet >= 0 ? 'var(--pos)' : 'var(--neg)'}
                  bold />
              </div>
              <div style={{ marginTop: 10 }}>
                <SavingsBar income={householdIncome} expenses={householdExpenses} color="var(--accent)" />
              </div>
            </div>
          </div>

          <div className="grid-2">
            {/* ── 6-month expense trend per person ── */}
            <div className="card">
              <div className="card-h">
                <div>
                  <h3>{t('family.trendTitle')}</h3>
                  <p>{t('family.trendSub')}</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {memberNames.map((name, idx) => {
                    const colors = personColor(name, members, idx)
                    return (
                      <span key={name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ink-3)' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.bar }} />
                        {name}
                      </span>
                    )
                  })}
                </div>
              </div>
              <div className="bars" style={{ '--bar-gap': '6px' }}>
                {trendData.map((mo, i) => (
                  <div key={i} className={`bar-col ${mo.current ? 'current' : ''}`}>
                    <div className="bar-stack">
                      {memberNames.map((name, idx) => {
                        const colors = personColor(name, members, idx)
                        const exp = mo.perPerson[name]?.expenses || 0
                        return (
                          <div key={name} className="bar" style={{
                            height: `${(exp / maxBar) * 100}%`,
                            background: colors.bar,
                            opacity: 0.85,
                            width: `${Math.floor(88 / memberNames.length)}%`,
                            marginRight: idx < memberNames.length - 1 ? '2px' : 0,
                          }} />
                        )
                      })}
                    </div>
                    <div className="bar-label">{mo.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Category breakdown with per-person split ── */}
            <div className="card">
              <div className="card-h">
                <div>
                  <h3>{t('family.catTitle')}</h3>
                  <p>{fmtMonth(focusMonth)}</p>
                </div>
                <span className="num" style={{ fontSize: 13, fontWeight: 700 }}>{fmtK(householdExpenses)}</span>
              </div>
              {catBreakdown.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
                  {t('family.noExpenses')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {catBreakdown.map(c => (
                    <div key={c.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-0)' }}>{c.name}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{c.pct}%</span>
                          <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(c.total)}</span>
                        </div>
                      </div>
                      {/* Stacked bar showing per-person split */}
                      <div style={{ height: 6, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
                        {memberNames.map((name, idx) => {
                          const colors = personColor(name, members, idx)
                          const pct = c.total > 0 ? ((c.byPerson[name] || 0) / c.total) * 100 : 0
                          return (
                            <div key={name} title={`${name}: ${fmt(c.byPerson[name] || 0)}`}
                              style={{ height: '100%', width: `${pct}%`, background: colors.bar, transition: 'width .4s' }} />
                          )
                        })}
                        {/* Shared portion */}
                        {(c.byPerson['Shared'] || 0) > 0 && (
                          <div title={`Shared: ${fmt(c.byPerson['Shared'])}`}
                            style={{ height: '100%', width: `${(c.byPerson['Shared'] / c.total) * 100}%`, background: 'var(--ink-3)', transition: 'width .4s' }} />
                        )}
                      </div>
                      {/* Mini per-person amounts */}
                      <div style={{ display: 'flex', gap: 12, marginTop: 3 }}>
                        {memberNames.map((name, idx) => {
                          const amt = c.byPerson[name] || 0
                          if (amt === 0) return null
                          const colors = personColor(name, members, idx)
                          return (
                            <span key={name} style={{ fontSize: 10.5, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.bar }} />
                              {name.split(' ')[0]}: {fmt(amt)}
                            </span>
                          )
                        })}
                        {(c.byPerson['Shared'] || 0) > 0 && (
                          <span style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>
                            Shared: {fmt(c.byPerson['Shared'])}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Monthly comparison table ── */}
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <div className="card-h" style={{ marginBottom: 12 }}>
                <div><h3>{t('family.monthlyTable')}</h3><p>{t('family.last6')}</p></div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 4px', color: 'var(--ink-3)', fontWeight: 600 }}>{t('family.month')}</th>
                    {memberNames.map(name => (
                      <>
                        <th key={`${name}-inc`} style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--ink-3)', fontWeight: 600 }}>
                          {name.split(' ')[0]} {t('family.income')}
                        </th>
                        <th key={`${name}-exp`} style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--ink-3)', fontWeight: 600 }}>
                          {name.split(' ')[0]} {t('family.expenses')}
                        </th>
                      </>
                    ))}
                    <th style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--ink-3)', fontWeight: 600 }}>{t('family.net')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...trendData].reverse().map((mo, i) => {
                    const totInc = memberNames.reduce((s, n) => s + (mo.perPerson[n]?.income || 0), 0)
                    const totExp = memberNames.reduce((s, n) => s + (mo.perPerson[n]?.expenses || 0), 0)
                    const net = totInc - totExp
                    return (
                      <tr key={i} style={{
                        borderBottom: '1px solid var(--line)',
                        background: mo.current ? 'rgba(99,102,241,0.06)' : 'transparent',
                      }}>
                        <td style={{ padding: '7px 4px', fontWeight: mo.current ? 700 : 400, color: mo.current ? 'var(--accent)' : 'var(--ink-0)' }}>
                          {mo.label}
                        </td>
                        {memberNames.map(name => (
                          <>
                            <td key={`${name}-inc`} className="num" style={{ textAlign: 'right', padding: '7px 4px', color: 'var(--pos)', fontSize: 12 }}>
                              {mo.perPerson[name]?.income > 0 ? fmtK(mo.perPerson[name].income) : '—'}
                            </td>
                            <td key={`${name}-exp`} className="num" style={{ textAlign: 'right', padding: '7px 4px', fontSize: 12 }}>
                              {mo.perPerson[name]?.expenses > 0 ? fmtK(mo.perPerson[name].expenses) : '—'}
                            </td>
                          </>
                        ))}
                        <td className="num" style={{ textAlign: 'right', padding: '7px 4px', fontWeight: 600,
                          color: net >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                          {totInc === 0 && totExp === 0 ? '—' : sign(net)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}

function StatRow({ label, value, color, bold, small }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
      <span style={{ fontSize: small ? 11 : 12, color: 'var(--ink-3)' }}>{label}</span>
      <span className="num" style={{ fontSize: small ? 12 : 13, fontWeight: bold ? 700 : 600, color }}>{value}</span>
    </div>
  )
}

function SavingsBar({ income, expenses, color }) {
  const pct = income > 0 ? Math.min((expenses / income) * 100, 100) : 0
  const saving = income > 0 ? Math.max(0, income - expenses) : 0
  return (
    <div>
      <div style={{ height: 4, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct > 90 ? 'var(--neg)' : color, transition: 'width .4s', borderRadius: 2 }} />
      </div>
      {saving > 0 && (
        <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 3 }}>
          ${saving.toLocaleString('en-CA', { maximumFractionDigits: 0 })} saved
        </div>
      )}
    </div>
  )
}
