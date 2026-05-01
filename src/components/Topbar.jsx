import { useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon'
import { useSearch } from '../hooks/useSearch'

const fmtDate = s => new Date(s).toLocaleDateString('en-CA', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtAmt  = n => (n > 0 ? '+' : '−') + '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function Topbar({ greet, date, action, onAction, children }) {
  const { t }    = useTranslation()
  const navigate = useNavigate()
  const { query, setQuery, results, loading, open, setOpen, clear } = useSearch()
  const wrapRef  = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [setOpen])

  function handleSelect(tx) {
    const month = tx.occurred_at.slice(0, 7)
    navigate('/transactions', { state: { openTxId: tx.id, month } })
    clear()
  }

  function handleKey(e) {
    if (e.key === 'Escape') clear()
  }

  return (
    <div className="topbar">
      <div className="greet">
        <h1>{greet}</h1>
        <p>{date}</p>
      </div>
      <div className="topbar-spacer" />

      {/* Search */}
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <div className="search">
          <Icon name="search" size={14} className="ico" />
          <input
            placeholder={t('topbar.search')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            onKeyDown={handleKey}
          />
          {query && (
            <button onClick={clear} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--ink-3)', padding: '0 4px', lineHeight: 1,
            }}>
              <Icon name="x" size={12} />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
            background: 'var(--bg-card)', border: '1px solid var(--line)',
            borderRadius: 'var(--r-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            zIndex: 200, minWidth: 360, maxWidth: 480,
            overflow: 'hidden',
          }}>
            {loading ? (
              <div style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink-3)' }}>
                {t('topbar.searching')}
              </div>
            ) : results.length === 0 ? (
              <div style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink-3)' }}>
                {t('topbar.noResults')}
              </div>
            ) : (
              <>
                {results.map(tx => (
                  <button key={tx.id} onClick={() => handleSelect(tx)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      width: '100%', padding: '10px 14px',
                      background: 'none', border: 'none', borderBottom: '1px solid var(--line)',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    {/* Category dot */}
                    <div style={{
                      width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                      background: `${tx.category?.color || '#94a3b8'}22`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: tx.category?.color || '#94a3b8' }} />
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 600, color: 'var(--ink-0)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {tx.description}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2, display: 'flex', gap: 8 }}>
                        <span>{fmtDate(tx.occurred_at)}</span>
                        {tx.category && <span>{tx.category.name}</span>}
                        {tx.account  && <span>{tx.account.name}</span>}
                      </div>
                    </div>

                    {/* Amount */}
                    <span className="num" style={{
                      fontSize: 13, fontWeight: 700, flexShrink: 0,
                      color: tx.amount > 0 ? 'var(--pos)' : 'var(--ink-0)',
                    }}>
                      {fmtAmt(tx.amount)}
                    </span>
                  </button>
                ))}
                <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--ink-3)' }}>
                  {t('topbar.searchHint')}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <button className="icon-btn"><Icon name="bell" size={15} /><span className="dot" /></button>
      {children}
      {action && (
        <button className="btn primary" onClick={onAction}>
          <Icon name="plus" size={14} /> {action}
        </button>
      )}
    </div>
  )
}
