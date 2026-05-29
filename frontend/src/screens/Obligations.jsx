import { useMemo } from 'react'
import Icon from '../components/Icon'
import Topbar from '../components/Topbar'
import { useAccounts } from '../hooks/useAccounts'

const fmtCAD = n => '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtCOP = n => '$ ' + Math.round(Math.abs(n)).toLocaleString('es-CO')
const fmt    = (n, cur) => cur === 'COP' ? fmtCOP(n) : fmtCAD(n)

function payoffMonths(balance, monthlyPayment, annualRate) {
  if (!monthlyPayment || monthlyPayment <= 0) return null
  const B = Math.abs(balance || 0)
  if (B <= 0) return 0
  const r = (annualRate || 0) / 100 / 12
  if (r <= 0) return Math.ceil(B / monthlyPayment)
  if (monthlyPayment <= B * r) return null  // payment doesn't cover interest
  return Math.ceil(-Math.log(1 - r * B / monthlyPayment) / Math.log(1 + r))
}

function nextDueInfo(dueDay) {
  if (!dueDay) return null
  const now = new Date()
  let yr = now.getFullYear(), mo = now.getMonth()
  if (now.getDate() >= dueDay) { mo++; if (mo > 11) { mo = 0; yr++ } }
  const target = new Date(yr, mo, dueDay)
  const days   = Math.ceil((target - now) / 86400000)
  const label  = target.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
  return { label, days }
}

export default function Obligations() {
  const { accounts, loading } = useAccounts()

  const debtAccounts = useMemo(
    () => accounts.filter(a => a.is_active && (a.type === 'credit' || (a.balance || 0) < 0)),
    [accounts]
  )

  const cadDebts = debtAccounts.filter(a => a.currency === 'CAD')
  const copDebts = debtAccounts.filter(a => a.currency === 'COP')

  const totalCAD   = cadDebts.reduce((s, a) => s + Math.abs(a.balance || 0), 0)
  const totalCOP   = copDebts.reduce((s, a) => s + Math.abs(a.balance || 0), 0)
  const monthlyCAD = cadDebts.reduce((s, a) => s + (a.monthly_payment || 0), 0)
  const monthlyCOP = copDebts.reduce((s, a) => s + (a.monthly_payment || 0), 0)

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>Loading…</div>
  )

  return (
    <>
      <Topbar greet="Financial Obligations" date="Debt tracker & payoff projections" />

      {debtAccounts.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--ink-3)' }}>
          No active debt accounts found. Add monthly payment details to credit or negative-balance accounts in Accounts to track them here.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
            {cadDebts.length > 0 && (
              <div className="card" style={{ flex: 1, padding: '14px 18px' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', marginBottom: 6 }}>
                  Total CAD Debt
                </div>
                <div className="num" style={{ fontSize: 22, fontWeight: 700, color: 'var(--neg)' }}>{fmtCAD(totalCAD)}</div>
                {monthlyCAD > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
                    <span className="num" style={{ color: 'var(--warn)', fontWeight: 600 }}>{fmtCAD(monthlyCAD)}</span>/mo commitments
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                  {cadDebts.length} obligation{cadDebts.length !== 1 ? 's' : ''}
                </div>
              </div>
            )}
            {copDebts.length > 0 && (
              <div className="card" style={{ flex: 1, padding: '14px 18px' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', marginBottom: 6 }}>
                  Total COP Debt
                </div>
                <div className="num" style={{ fontSize: 22, fontWeight: 700, color: 'var(--neg)' }}>{fmtCOP(totalCOP)}</div>
                {monthlyCOP > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
                    <span className="num" style={{ color: 'var(--warn)', fontWeight: 600 }}>{fmtCOP(monthlyCOP)}</span>/mo commitments
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                  {copDebts.length} obligation{copDebts.length !== 1 ? 's' : ''}
                </div>
              </div>
            )}
          </div>

          {cadDebts.length > 0 && <DebtGroup label="CAD Obligations" accounts={cadDebts} />}
          {copDebts.length > 0 && <DebtGroup label="COP Obligations" accounts={copDebts} />}
        </>
      )}
    </>
  )
}

function DebtGroup({ label, accounts }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em',
        color: 'var(--ink-3)', marginBottom: 10, paddingLeft: 2,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {accounts.map(a => <DebtCard key={a.id} account={a} />)}
      </div>
    </div>
  )
}

function DebtCard({ account: a }) {
  const balance = Math.abs(a.balance || 0)
  const months  = payoffMonths(a.balance, a.monthly_payment, a.interest_rate)
  const due     = nextDueInfo(a.payment_due_day)

  let progress = null, progressLabel = '', progressColor = 'var(--accent)'
  if (a.type === 'credit' && a.credit_limit > 0) {
    progress      = Math.min(balance / a.credit_limit, 1)
    progressLabel = `${Math.round(progress * 100)}% of ${fmt(a.credit_limit, a.currency)} limit used`
    progressColor = progress > 0.7 ? 'var(--neg)' : progress > 0.4 ? 'var(--warn)' : 'var(--pos)'
  } else if (a.original_amount > 0) {
    const paid    = Math.max(0, a.original_amount - balance)
    progress      = Math.min(paid / a.original_amount, 1)
    progressLabel = `${Math.round(progress * 100)}% paid off · ${fmt(paid, a.currency)} of ${fmt(a.original_amount, a.currency)}`
    progressColor = 'var(--pos)'
  }

  const monthlyInterest = (a.interest_rate || 0) > 0 ? balance * (a.interest_rate / 100 / 12) : 0

  let payoffLabel = null
  if (months !== null) {
    if (months === 0) payoffLabel = 'Paid off'
    else {
      const y = Math.floor(months / 12)
      const m = months % 12
      payoffLabel = months < 12 ? `${months} mo` : (m > 0 ? `${y}y ${m}m` : `${y}y`)
    }
  }

  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: 'rgba(239,68,68,.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--neg)',
        }}>
          <Icon name={a.type === 'credit' ? 'card' : 'doc'} size={16} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-0)' }}>{a.name}</div>
            <div className="num" style={{ fontSize: 16, fontWeight: 700, color: 'var(--neg)', flexShrink: 0 }}>
              {fmt(balance, a.currency)}
            </div>
          </div>

          {progress !== null && (
            <div style={{ marginTop: 8 }}>
              <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-2)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${Math.round(progress * 100)}%`,
                  background: progressColor, borderRadius: 3, transition: 'width .4s',
                }} />
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 3 }}>{progressLabel}</div>
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
            {(a.monthly_payment || 0) > 0 && (
              <Chip label="Payment" value={`${fmt(a.monthly_payment, a.currency)}/mo`} />
            )}
            {(a.interest_rate || 0) > 0 && (
              <Chip label="Rate" value={`${a.interest_rate}% APR`} color="var(--warn)" />
            )}
            {monthlyInterest > 0 && (
              <Chip label="Interest" value={`${fmt(monthlyInterest, a.currency)}/mo`} color="var(--warn)" />
            )}
            {payoffLabel && (
              <Chip label="Payoff" value={payoffLabel} color="var(--pos)" />
            )}
            {due && (
              <Chip
                label="Due"
                value={`${due.label} (${due.days}d)`}
                color={due.days <= 5 ? 'var(--neg)' : due.days <= 10 ? 'var(--warn)' : 'var(--ink-2)'}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Chip({ label, value, color }) {
  return (
    <div style={{ fontSize: 11 }}>
      <span style={{ color: 'var(--ink-3)' }}>{label}: </span>
      <span style={{ fontWeight: 600, color: color || 'var(--ink-1)' }}>{value}</span>
    </div>
  )
}
