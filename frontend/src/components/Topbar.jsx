import { useRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon'
import { useSearch } from '../hooks/useSearch'
import { useNotifications } from '../hooks/useNotifications'
import { useTheme } from '../hooks/useTheme'
import { useSidebar } from '../lib/sidebar'

const LANGS = [
  { code: 'en', label: 'English',  flag: '🇨🇦' },
  { code: 'es', label: 'Español',  flag: '🇨🇴' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
]

const fmtDate = s => new Date(s).toLocaleDateString('en-CA', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtAmt  = n => (n > 0 ? '+' : '−') + '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function Topbar({ greet, date, action, onAction, children }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { query, setQuery, results, loading, open, setOpen, clear } = useSearch()
  const { items: notifs, count: notifCount } = useNotifications()
  const { theme, toggle: toggleTheme } = useTheme()

  const { toggle: toggleSidebar } = useSidebar()
  const searchRef = useRef(null)
  const bellRef   = useRef(null)
  const langRef   = useRef(null)
  const [bellOpen, setBellOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const currentLang = LANGS.find(l => l.code === i18n.language) || LANGS[0]

  // Close search dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [setOpen])

  // Close bell panel on outside click
  useEffect(() => {
    function handler(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false)
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleSelect(tx) {
    const month = tx.occurred_at.slice(0, 7)
    navigate('/transactions', { state: { openTxId: tx.id, month } })
    clear()
  }

  function handleKey(e) {
    if (e.key === 'Escape') { clear(); setBellOpen(false); setLangOpen(false) }
  }

  const SEVERITY_COLOR = { neg: 'var(--neg)', warn: 'var(--warn)', pos: 'var(--pos)' }
  const TYPE_ICON      = { review: 'review', budget: 'budget' }

  return (
    <div className="topbar">
      <button className="hamburger icon-btn" onClick={toggleSidebar} aria-label="Menu">
        <Icon name="menu" size={18} />
      </button>
      <div className="greet">
        <h1>{greet}</h1>
        <p>{date}</p>
      </div>
      <div className="topbar-spacer" />

      {/* Search */}
      <div ref={searchRef} style={{ position: 'relative' }}>
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

        {/* Search dropdown */}
        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
            background: 'var(--bg-card)', border: '1px solid var(--line)',
            borderRadius: 'var(--r-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            zIndex: 200, minWidth: 360, maxWidth: 480, overflow: 'hidden',
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
                    <div style={{
                      width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                      background: `${tx.category?.color || '#94a3b8'}22`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: tx.category?.color || '#94a3b8' }} />
                    </div>
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

      {/* Bell */}
      <div ref={bellRef} style={{ position: 'relative' }}>
        <button className="icon-btn" onClick={() => setBellOpen(v => !v)}
          style={{ background: bellOpen ? 'var(--bg-3)' : undefined }}>
          <Icon name="bell" size={15} />
          {notifCount > 0 && (
            <span style={{
              position: 'absolute', top: 5, right: 5,
              minWidth: 16, height: 16, borderRadius: 99,
              background: notifCount > 0 ? 'var(--neg)' : 'transparent',
              color: 'white', fontSize: 9, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 3px', border: '2px solid var(--bg-0)',
              lineHeight: 1,
            }}>
              {notifCount > 9 ? '9+' : notifCount}
            </span>
          )}
        </button>

        {/* Notification panel */}
        {bellOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: 320, background: 'var(--bg-card)',
            border: '1px solid var(--line)', borderRadius: 'var(--r-lg)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            zIndex: 300, overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              padding: '12px 14px 10px',
              borderBottom: '1px solid var(--line)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-0)' }}>
                Notifications
              </span>
              {notifCount > 0 && (
                <span style={{
                  fontSize: 10.5, fontWeight: 600, color: 'var(--ink-3)',
                  background: 'var(--bg-3)', borderRadius: 99, padding: '1px 7px',
                }}>
                  {notifCount} alert{notifCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Items */}
            {notifs.length === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>✓</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)' }}>All clear</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>No budget alerts or pending reviews</div>
              </div>
            ) : (
              <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                {notifs.map(item => {
                  const color = SEVERITY_COLOR[item.severity] || 'var(--ink-2)'
                  const icon  = TYPE_ICON[item.type] || 'bell'
                  return (
                    <button key={item.id}
                      onClick={() => { navigate(item.path); setBellOpen(false) }}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12,
                        width: '100%', padding: '11px 14px',
                        background: 'none', border: 'none',
                        borderBottom: '1px solid var(--line)',
                        cursor: 'pointer', textAlign: 'left',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        background: `color-mix(in oklab, ${color} 15%, transparent)`,
                        color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon name={icon} size={15} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-0)', lineHeight: 1.3 }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3 }}>
                          {item.body}
                        </div>
                      </div>
                      <Icon name="chevron-right" size={13} style={{ color: 'var(--ink-4)', marginTop: 8, flexShrink: 0 }} />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Language switcher — hidden on mobile */}
      <div ref={langRef} style={{ position: 'relative' }} className="topbar-lang">
        <button className="icon-btn" onClick={() => setLangOpen(v => !v)}
          title="Language"
          style={{ background: langOpen ? 'var(--bg-3)' : undefined, width: 36, height: 36 }}>
          <Icon name="globe" size={15} />
        </button>

        {langOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: 170, background: 'var(--bg-card)',
            border: '1px solid var(--line)', borderRadius: 'var(--r-md)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            zIndex: 300, overflow: 'hidden',
            padding: '4px',
          }}>
            {LANGS.map(lang => {
              const active = i18n.language === lang.code
              return (
                <button key={lang.code}
                  onClick={() => { i18n.changeLanguage(lang.code); setLangOpen(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '8px 10px', borderRadius: 6,
                    background: active ? 'color-mix(in oklab, var(--accent) 12%, transparent)' : 'transparent',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-2)' }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ fontSize: 16, lineHeight: 1 }}>{lang.flag}</span>
                  <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? 'var(--accent)' : 'var(--ink-1)', flex: 1 }}>
                    {lang.label}
                  </span>
                  {active && <Icon name="check" size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Theme toggle */}
      <button
        className="icon-btn"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
      </button>

      {children}
      {action && (
        <button className="btn primary" onClick={onAction}>
          <Icon name="plus" size={14} /> {action}
        </button>
      )}
    </div>
  )
}
