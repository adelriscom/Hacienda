import { useState, useMemo } from 'react'
import Modal from './Modal'
import { useCategories } from '../hooks/useCategories'

export default function AutoCategorizeModal({ transactions, onClose, onApply }) {
  const { categories } = useCategories()
  const [step,      setStep]      = useState('idle')   // idle | loading | review
  const [results,   setResults]   = useState([])        // [{id, category_id}] from AI
  const [overrides, setOverrides] = useState({})        // {tx_id: category_id}
  const [applying,  setApplying]  = useState(false)
  const [error,     setError]     = useState(null)

  const uncategorized = useMemo(
    () => transactions.filter(t => !t.category_id && t.type !== 'transfer'),
    [transactions]
  )

  const catById = useMemo(
    () => Object.fromEntries(categories.map(c => [c.id, c])),
    [categories]
  )

  const txById = useMemo(
    () => Object.fromEntries(transactions.map(t => [t.id, t])),
    [transactions]
  )

  async function analyze() {
    setStep('loading')
    setError(null)
    try {
      const res = await fetch('/api/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: uncategorized.map(t => ({
            id: t.id,
            description: t.description,
            amount: t.amount,
            type: t.type,
          })),
          categories: categories.map(c => ({ id: c.id, name: c.name })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'AI error')
      setResults(data)
      setStep('review')
    } catch (err) {
      setError(err.message)
      setStep('idle')
    }
  }

  async function applyAll() {
    setApplying(true)
    try {
      const patches = results.map(r => ({
        id: r.id,
        category_id: overrides[r.id] ?? r.category_id,
      }))
      await onApply(patches)
      onClose()
    } catch (err) {
      setError(err.message)
      setApplying(false)
    }
  }

  const skipped = uncategorized.length - results.length

  return (
    <Modal title="✨ Auto-categorize" onClose={onClose}>
      <div className="modal-body">

        {/* Idle — show count and trigger button */}
        {step === 'idle' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
            <p style={{ fontSize: 14, color: 'var(--ink-1)', marginBottom: 4 }}>
              <strong>{uncategorized.length}</strong> uncategorized transaction{uncategorized.length !== 1 ? 's' : ''} in the current view
            </p>
            <p style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 20 }}>
              Claude will suggest a category for each one. You can review and adjust before applying.
            </p>
            {uncategorized.length === 0 ? (
              <p style={{ color: 'var(--pos)', fontSize: 13 }}>All transactions are already categorized.</p>
            ) : (
              <button className="btn primary" onClick={analyze}>
                Analyze {uncategorized.length} transactions
              </button>
            )}
          </div>
        )}

        {/* Loading */}
        {step === 'loading' && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink-2)' }}>
            <div style={{ fontSize: 28, marginBottom: 12, animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙</div>
            <p style={{ fontSize: 13 }}>Asking Claude to categorize {uncategorized.length} transactions…</p>
            <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6 }}>~{Math.ceil(uncategorized.length / 60) * 5}–10 seconds</p>
          </div>
        )}

        {/* Review suggestions */}
        {step === 'review' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                <strong style={{ color: 'var(--accent)' }}>{results.length}</strong> suggestions
                {skipped > 0 && <span style={{ color: 'var(--ink-3)', marginLeft: 6 }}>· {skipped} skipped (no match)</span>}
              </span>
              <button className="btn ghost sm" onClick={() => { setStep('idle'); setResults([]); setOverrides({}) }}>
                Re-run
              </button>
            </div>

            <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {results.map(r => {
                const tx  = txById[r.id]
                const cat = catById[overrides[r.id] ?? r.category_id]
                if (!tx) return null
                return (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 8,
                    background: 'var(--bg-2)', border: '1px solid var(--line)',
                  }}>
                    {/* Color dot */}
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: cat?.color || 'var(--ink-3)',
                    }} />
                    {/* Description */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {tx.description}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                        {tx.occurred_at?.slice(0, 10)} · {tx.amount > 0 ? '+' : ''}${Math.abs(tx.amount).toFixed(2)}
                      </div>
                    </div>
                    {/* Category picker */}
                    <select
                      value={overrides[r.id] ?? r.category_id}
                      onChange={e => setOverrides(prev => ({ ...prev, [r.id]: e.target.value }))}
                      style={{
                        fontSize: 11.5, borderRadius: 6, border: '1px solid var(--border)',
                        background: 'var(--bg-card)', color: 'var(--ink-0)',
                        padding: '2px 6px', flexShrink: 0, maxWidth: 160,
                      }}
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {error && (
          <p style={{ color: 'var(--neg)', fontSize: 12, marginTop: 12 }}>{error}</p>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        {step === 'review' && results.length > 0 && (
          <button className="btn primary" onClick={applyAll} disabled={applying}>
            {applying ? '…' : `Apply ${results.length} categories`}
          </button>
        )}
      </div>
    </Modal>
  )
}
