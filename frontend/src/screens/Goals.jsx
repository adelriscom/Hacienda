import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import Topbar from '../components/Topbar'
import Modal from '../components/Modal'
import { useAccounts } from '../hooks/useAccounts'
import { useSavingsGoals } from '../hooks/useSavingsGoals'
import { CURRENCIES } from '../lib/currency'

const fmtCAD = n => '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtCOP = n => '$ ' + Math.round(Math.abs(n)).toLocaleString('es-CO')
const fmt    = (n, cur) => cur === 'COP' ? fmtCOP(n) : fmtCAD(n)

function addMonths(date, n) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

// Current saved toward a goal: a linked account's balance takes priority, else the
// manually-tracked current_amount.
function currentSaved(goal, accountsById) {
  if (goal.account_id && accountsById[goal.account_id]) {
    return Math.max(0, accountsById[goal.account_id].balance || 0)
  }
  return goal.current_amount || 0
}

export default function Goals() {
  const { accounts, loading: acctLoading } = useAccounts()
  const { goals, loading, addGoal, updateGoal, deleteGoal } = useSavingsGoals()
  const [editing, setEditing] = useState(null)   // goal object | 'new' | null

  const accountsById = useMemo(
    () => Object.fromEntries(accounts.map(a => [a.id, a])),
    [accounts]
  )

  const activeGoals = goals.filter(g => g.is_active)

  // Per-currency totals (saved / target)
  const totals = useMemo(() => {
    const map = {}
    activeGoals.forEach(g => {
      const cur = g.currency || 'CAD'
      const saved = currentSaved(g, accountsById)
      if (!map[cur]) map[cur] = { saved: 0, target: 0, count: 0 }
      map[cur].saved  += saved
      map[cur].target += g.target_amount || 0
      map[cur].count  += 1
    })
    return Object.entries(map)
  }, [activeGoals, accountsById])

  async function handleSave(values) {
    if (editing && editing !== 'new') await updateGoal(editing.id, values)
    else await addGoal(values)
    setEditing(null)
  }

  if (loading || acctLoading) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>Loading…</div>
  )

  return (
    <>
      <Topbar greet="Savings Goals" date="Track progress toward your targets" />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={14} /> New goal
        </button>
      </div>

      {activeGoals.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--ink-3)' }}>
          No savings goals yet. Create one — e.g. a house down payment or a vacation fund —
          and link it to a savings account (or update its balance manually) to watch the progress.
        </div>
      ) : (
        <>
          {totals.length > 0 && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
              {totals.map(([cur, t]) => {
                const remaining = Math.max(0, t.target - t.saved)
                return (
                  <div key={cur} className="card" style={{ flex: 1, minWidth: 200, padding: '14px 18px' }}>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', marginBottom: 6 }}>
                      {cur} Saved
                    </div>
                    <div className="num" style={{ fontSize: 22, fontWeight: 700, color: 'var(--pos)' }}>{fmt(t.saved, cur)}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
                      of <span className="num" style={{ color: 'var(--ink-1)', fontWeight: 600 }}>{fmt(t.target, cur)}</span> target
                      {' · '}<span className="num" style={{ color: 'var(--warn)', fontWeight: 600 }}>{fmt(remaining, cur)}</span> to go
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                      {t.count} goal{t.count !== 1 ? 's' : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeGoals.map(g => (
              <GoalCard key={g.id} goal={g} accountsById={accountsById} onEdit={() => setEditing(g)} />
            ))}
          </div>
        </>
      )}

      {editing && (
        <GoalModal
          goal={editing === 'new' ? null : editing}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          onDelete={editing !== 'new' ? async () => { await deleteGoal(editing.id); setEditing(null) } : null}
        />
      )}
    </>
  )
}

function GoalCard({ goal: g, accountsById, onEdit }) {
  const saved     = currentSaved(g, accountsById)
  const target    = g.target_amount || 0
  const remaining = Math.max(0, target - saved)
  const progress  = target > 0 ? Math.min(saved / target, 1) : 0
  const pct       = Math.round(progress * 100)
  const reached   = remaining <= 0
  const linkedAcct = g.account_id ? accountsById[g.account_id] : null

  // Projected completion from the monthly contribution
  let projection = null
  if (!reached && g.monthly_contribution > 0) {
    const months = Math.ceil(remaining / g.monthly_contribution)
    const date   = addMonths(new Date(), months)
    const label  = date.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })
    const onTrack = g.target_date ? date <= new Date(g.target_date) : null
    projection = { months, label, onTrack }
  }

  const targetDateLabel = g.target_date
    ? new Date(g.target_date + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: reached ? 'rgba(34,197,94,.12)' : 'rgba(99,102,241,.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: reached ? 'var(--pos)' : 'var(--accent)',
        }}>
          <Icon name={reached ? 'check' : 'piggy'} size={18} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-0)' }}>
              {g.name}
              <button onClick={onEdit} title="Edit goal" style={{
                marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--ink-3)', verticalAlign: 'middle',
              }}>
                <Icon name="edit" size={13} />
              </button>
            </div>
            <div className="num" style={{ fontSize: 16, fontWeight: 700, color: reached ? 'var(--pos)' : 'var(--ink-0)', flexShrink: 0 }}>
              {fmt(saved, g.currency)} <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 500 }}>/ {fmt(target, g.currency)}</span>
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-2)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`,
                background: reached ? 'var(--pos)' : 'var(--accent)', borderRadius: 3, transition: 'width .4s',
              }} />
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 3 }}>
              {reached
                ? `🎉 Goal reached · ${fmt(saved, g.currency)} saved`
                : `${pct}% · ${fmt(remaining, g.currency)} to go`}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
            {linkedAcct && <Chip label="Account" value={linkedAcct.name} />}
            {(g.monthly_contribution || 0) > 0 && (
              <Chip label="Contributing" value={`${fmt(g.monthly_contribution, g.currency)}/mo`} />
            )}
            {targetDateLabel && (
              <Chip label="Target date" value={targetDateLabel} />
            )}
            {projection && (
              <Chip
                label="Projected"
                value={`${projection.label} (${projection.months} mo)`}
                color={projection.onTrack === false ? 'var(--neg)' : 'var(--pos)'}
              />
            )}
            {projection && projection.onTrack === false && (
              <Chip label="" value="behind target date" color="var(--neg)" />
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
      {label && <span style={{ color: 'var(--ink-3)' }}>{label}: </span>}
      <span style={{ fontWeight: 600, color: color || 'var(--ink-1)' }}>{value}</span>
    </div>
  )
}

const EMPTY_FORM = {
  name: '', target_amount: '', current_amount: '', currency: 'CAD',
  target_date: '', account_id: '', monthly_contribution: '', notes: '', is_active: true,
}

function GoalModal({ goal, accounts, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(goal
    ? {
        name: goal.name, target_amount: goal.target_amount ?? '',
        current_amount: goal.current_amount ?? '', currency: goal.currency || 'CAD',
        target_date: goal.target_date || '', account_id: goal.account_id || '',
        monthly_contribution: goal.monthly_contribution ?? '', notes: goal.notes || '',
        is_active: goal.is_active,
      }
    : EMPTY_FORM
  )
  const [saving, setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [error, setError]     = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // When an account is linked, its balance is the source of truth for "current saved",
  // so the manual current_amount field is hidden.
  const linked = !!form.account_id

  // Group active accounts by currency for the picker
  const accountGroups = useMemo(() => {
    const map = {}
    accounts.filter(a => a.is_active).forEach(a => {
      const cur = a.currency || 'CAD'
      ;(map[cur] = map[cur] || []).push(a)
    })
    return Object.entries(map)
  }, [accounts])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name || !form.target_amount) {
      setError('Name and target amount are required.'); return
    }
    setSaving(true); setError(null)
    try {
      await onSave({
        name:                 form.name.trim(),
        target_amount:        parseFloat(form.target_amount) || 0,
        current_amount:       form.account_id ? 0 : (parseFloat(form.current_amount) || 0),
        currency:             form.currency,
        target_date:          form.target_date || null,
        account_id:           form.account_id || null,
        monthly_contribution: form.monthly_contribution ? parseFloat(form.monthly_contribution) : null,
        notes:                form.notes || null,
        is_active:            form.is_active,
      })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true); setError(null)
    try {
      await onDelete()
    } catch (err) {
      setError(err.message)
      setDeleting(false)
    }
  }

  return (
    <Modal title={goal ? 'Edit goal' : 'New savings goal'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="modal-body">
          <div className="form-grid">

            <div className="form-field span-2">
              <label>Name</label>
              <input type="text" placeholder="e.g. House down payment, Vacation 2027"
                value={form.name} onChange={e => set('name', e.target.value)} required />
            </div>

            <div className="form-field">
              <label>Target amount</label>
              <input type="number" step="0.01" min="0" placeholder="0.00"
                value={form.target_amount} onChange={e => set('target_amount', e.target.value)} required />
            </div>

            <div className="form-field">
              <label>Currency</label>
              <select value={form.currency} onChange={e => set('currency', e.target.value)}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
              </select>
            </div>

            <div className="form-field span-2">
              <label>Linked account <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 400 }}>(optional — its balance becomes the current saved)</span></label>
              <select value={form.account_id} onChange={e => set('account_id', e.target.value)}>
                <option value="">Track manually</option>
                {accountGroups.map(([cur, accts]) => (
                  <optgroup key={cur} label={cur}>
                    {accts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            {!linked && (
              <div className="form-field">
                <label>Current saved</label>
                <input type="number" step="0.01" min="0" placeholder="0.00"
                  value={form.current_amount} onChange={e => set('current_amount', e.target.value)} />
              </div>
            )}

            <div className="form-field">
              <label>Monthly contribution <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 400 }}>(for projection)</span></label>
              <input type="number" step="0.01" min="0" placeholder="0.00"
                value={form.monthly_contribution} onChange={e => set('monthly_contribution', e.target.value)} />
            </div>

            <div className="form-field">
              <label>Target date <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 400 }}>(optional)</span></label>
              <input type="date" value={form.target_date} onChange={e => set('target_date', e.target.value)} />
            </div>

            <div className="form-field span-2">
              <label>Notes</label>
              <textarea placeholder="Optional notes"
                value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>

            <div className="form-field span-2" style={{ justifyContent: 'flex-start' }}>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_active}
                  onChange={e => set('is_active', e.target.checked)}
                  style={{ width: 'auto', height: 'auto' }} />
                Active
              </label>
            </div>

          </div>
          {error && <p style={{ color: 'var(--neg)', fontSize: 12, marginTop: 12 }}>{error}</p>}
        </div>

        <div className="modal-footer">
          {onDelete && !confirmDel && (
            <button type="button" className="btn ghost" style={{ marginRight: 'auto', color: 'var(--neg)' }}
              onClick={() => setConfirmDel(true)}>Delete</button>
          )}
          {onDelete && confirmDel && (
            <button type="button" className="btn ghost" style={{ marginRight: 'auto', color: 'var(--neg)' }}
              onClick={handleDelete} disabled={deleting}>{deleting ? '…' : 'Confirm delete?'}</button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : goal ? 'Save changes' : 'Create goal'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
