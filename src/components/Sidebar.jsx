import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import Icon from './Icon'

const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' },
  { code: 'fr', label: 'FR' },
]

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { t, i18n } = useTranslation()

  const email = session?.user?.email ?? ''
  const initials = email.slice(0, 2).toUpperCase()

  const principal = [
    { id: 'dashboard', path: '/dashboard', icon: 'grid',    label: t('nav.dashboard') },
    { id: 'expenses',  path: '/expenses',  icon: 'expense', label: t('nav.expenses'),  badge: '24' },
    { id: 'income',    path: '/income',    icon: 'income',  label: t('nav.income'),    badge: '8' },
    { id: 'budgets',   path: '/budgets',   icon: 'budget',  label: t('nav.budgets') },
  ]
  const tools = [
    { id: 'calendar',  path: '/calendar',  icon: 'calendar',  label: t('nav.calendar'),  badge: '3', badgeKind: 'accent' },
    { id: 'review',    path: '/review',    icon: 'review',    label: t('nav.review'),    badge: '5', badgeKind: 'warn' },
    { id: 'reports',   path: '/reports',   icon: 'report',    label: t('nav.reports') },
    { id: 'recurring', path: '/recurring', icon: 'recurring', label: t('nav.recurring') },
    { id: 'accounts',    path: '/accounts',   icon: 'account',  label: t('nav.accounts') },
    { id: 'categories',  path: '/categories', icon: 'filter',   label: t('nav.categories') },
  ]

  const Item = ({ it }) => {
    const active = location.pathname === it.path
    return (
      <div className={`sb-item ${active ? 'active' : ''}`} onClick={() => navigate(it.path)}>
        <Icon name={it.icon} className="ico" />
        <span>{it.label}</span>
        {it.badge && <span className={`badge ${it.badgeKind || ''}`}>{it.badge}</span>}
      </div>
    )
  }

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div className="sb-logo">H</div>
        <div>
          <div className="sb-brand-name">Hacienda</div>
          <div className="sb-brand-sub">{t('brand.sub')}</div>
        </div>
      </div>

      <div className="sb-section">{t('nav.principal')}</div>
      {principal.map(it => <Item key={it.id} it={it} />)}

      <div className="sb-section">{t('nav.tools')}</div>
      {tools.map(it => <Item key={it.id} it={it} />)}

      <div className="sb-spacer" />

      {/* Language selector */}
      <div style={{ display: 'flex', gap: 4, padding: '0 16px 12px', justifyContent: 'center' }}>
        {LANGS.map(({ code, label }) => (
          <button key={code} onClick={() => i18n.changeLanguage(code)}
            style={{
              flex: 1, height: 28, borderRadius: 6, border: '1px solid',
              borderColor: i18n.language === code ? 'var(--accent)' : 'var(--border)',
              background: i18n.language === code ? 'rgba(99,102,241,.15)' : 'transparent',
              color: i18n.language === code ? 'var(--accent)' : 'var(--ink-3)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}>
            {label}
          </button>
        ))}
      </div>

      <div className="sb-user">
        <div className="sb-avatar">{initials}</div>
        <div>
          <div className="sb-user-name">{email}</div>
          <div className="sb-user-plan">{t('brand.plan')}</div>
        </div>
        <button className="sb-cog icon-btn" onClick={() => supabase.auth.signOut()}>
          <Icon name="cog" size={15} />
        </button>
      </div>
    </aside>
  )
}
