import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useHousehold } from '../lib/household'
import Icon from './Icon'
import { useSidebarCounts } from '../hooks/useSidebarCounts'
import { useTheme } from '../hooks/useTheme'
import { useSidebar } from '../lib/sidebar'

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { t } = useTranslation()
  useTheme()

  const email  = session?.user?.email ?? ''
  const counts = useSidebarCounts()
  const { household, members, myName, viewMode, setViewMode, isFamily } = useHousehold()
  const { open, close } = useSidebar()

  const badge = (n) => (n === null || n === 0) ? undefined : String(n)

  const principal = [
    { id: 'dashboard', path: '/dashboard', icon: 'grid',    label: t('nav.dashboard') },
    { id: 'expenses',  path: '/expenses',  icon: 'expense', label: t('nav.expenses'),  badge: badge(counts.expenses) },
    { id: 'income',    path: '/income',    icon: 'income',  label: t('nav.income'),    badge: badge(counts.income) },
    { id: 'budgets',   path: '/budgets',   icon: 'budget',  label: t('nav.budgets') },
    ...(household ? [{ id: 'family', path: '/family', icon: 'users', label: t('nav.family') }] : []),
  ]
  const tools = [
    { id: 'calendar',   path: '/calendar',   icon: 'calendar',   label: t('nav.calendar') },
    { id: 'review',     path: '/review',     icon: 'review',     label: t('nav.review'),  badge: badge(counts.review), badgeKind: 'warn' },
    { id: 'reports',    path: '/reports',    icon: 'report',     label: t('nav.reports') },
    { id: 'recurring',  path: '/recurring',  icon: 'recurring',  label: t('nav.recurring') },
    { id: 'accounts',   path: '/accounts',   icon: 'account',    label: t('nav.accounts') },
    { id: 'categories', path: '/categories', icon: 'filter',     label: t('nav.categories') },
    { id: 'obligations',path: '/obligations',icon: 'trend-down', label: t('nav.obligations') },
    { id: 'goals',      path: '/goals',      icon: 'piggy',      label: t('nav.goals') },
    { id: 'settings',   path: '/settings',   icon: 'cog',        label: t('nav.settings') },
  ]

  const toolPaths = new Set(tools.map(t => t.path))
  const activeToolRoute = toolPaths.has(location.pathname)

  // Accordion state — default open; auto-open when a tools route is active
  const [toolsOpen, setToolsOpen] = useState(
    () => localStorage.getItem('hacienda_tools_open') !== 'false'
  )

  useEffect(() => {
    if (activeToolRoute && !toolsOpen) {
      setToolsOpen(true)
      localStorage.setItem('hacienda_tools_open', 'true')
    }
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleTools() {
    const next = !toolsOpen
    setToolsOpen(next)
    localStorage.setItem('hacienda_tools_open', String(next))
  }

  const Item = ({ it }) => {
    const active = location.pathname === it.path
    return (
      <button
        type="button"
        className={`sb-item ${active ? 'active' : ''}`}
        onClick={() => { navigate(it.path); close() }}
        aria-current={active ? 'page' : undefined}
        title={it.label}
      >
        <Icon name={it.icon} className="ico" />
        <span>{it.label}</span>
        {it.badge && <span className={`badge ${it.badgeKind || ''}`}>{it.badge}</span>}
      </button>
    )
  }

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sb-brand">
        <div className="sb-logo">H</div>
        <div>
          <div className="sb-brand-name">Hacienda</div>
          <div className="sb-brand-sub">{t('brand.sub')}</div>
        </div>
      </div>

      <div className="sb-nav-scroll">
        <div className="sb-section">{t('nav.principal')}</div>
        {principal.map(it => <Item key={it.id} it={it} />)}

        {/* Tools accordion */}
        <button
          onClick={toggleTools}
          aria-expanded={toolsOpen}
          className="sb-tools-toggle"
          title={t('nav.tools')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
            padding: '14px 16px 6px',
            color: 'var(--ink-3)',
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {t('nav.tools')}
          </span>
          <Icon name="chevron-down" size={13} style={{
            transition: 'transform 0.22s ease',
            transform: toolsOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
            color: 'var(--ink-3)',
          }} />
        </button>

        {/* Outer grid controls height; inner overflow:hidden makes 0fr collapse work.
            Negative margin + matching padding lets the active-indicator pseudo-element
            (positioned at left:-14px inside .sb-item) show through. */}
        <div style={{
          display: 'grid',
          gridTemplateRows: toolsOpen ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.25s ease',
        }}>
          <div style={{ overflow: 'hidden', marginLeft: -14, paddingLeft: 14 }}>
            {tools.map(it => <Item key={it.id} it={it} />)}
          </div>
        </div>
      </div>

      <div className="sb-bottom">

      {/* Household view toggle */}
      {household && (
        <div style={{ padding: '0 16px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-3)', marginBottom: 8 }}>
            {household.name}
          </div>
          {/* Member avatars */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
            {members.map(m => (
              <div key={m.user_id} title={m.display_name} style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: m.display_name === 'Alexander'
                  ? 'linear-gradient(135deg,#6366f1,#a855f7)'
                  : 'linear-gradient(135deg,#ec4899,#f97316)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: 'white',
                opacity: isFamily || m.display_name === myName ? 1 : 0.35,
                transition: 'opacity .2s',
              }}>
                {m.display_name.slice(0, 2).toUpperCase()}
              </div>
            ))}
          </div>
          {/* Toggle */}
          <div style={{ display: 'flex', gap: 4 }}>
            {['personal', 'family'].map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                style={{
                  flex: 1, height: 26, borderRadius: 6, border: '1px solid',
                  borderColor: viewMode === mode ? 'var(--accent)' : 'var(--border)',
                  background: viewMode === mode ? 'rgba(99,102,241,.15)' : 'transparent',
                  color: viewMode === mode ? 'var(--accent)' : 'var(--ink-3)',
                  fontSize: 10.5, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                }}>
                {mode === 'family' ? '👨‍👩 Family' : '👤 Personal'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sb-user">
        <div className="sb-user-card">
          <div className="sb-avatar-lg">
            {(myName || email).slice(0, 2).toUpperCase()}
          </div>
          <div className="sb-user-info">
            <div className="sb-user-display">{myName || email.split('@')[0]}</div>
            <div className="sb-user-email" title={email}>{email}</div>
          </div>
          <button className="sb-signout" title="Sign out" aria-label="Sign out" onClick={() => supabase.auth.signOut()}>
            <Icon name="logout" size={14} />
          </button>
        </div>
      </div>

      </div>{/* sb-bottom */}
    </aside>
  )
}
