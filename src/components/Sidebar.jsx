import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import Icon from './Icon'

const principal = [
  { id: 'dashboard', path: '/dashboard', icon: 'grid',    label: 'Dashboard' },
  { id: 'expenses',  path: '/expenses',  icon: 'expense', label: 'Gastos',        badge: '24' },
  { id: 'income',    path: '/income',    icon: 'income',  label: 'Ingresos',       badge: '8' },
  { id: 'budgets',   path: '/budgets',   icon: 'budget',  label: 'Presupuestos' },
]
const tools = [
  { id: 'calendar',  path: '/calendar',  icon: 'calendar',  label: 'Calendario',    badge: '3', badgeKind: 'accent' },
  { id: 'review',    path: '/review',    icon: 'review',    label: 'Por revisar',   badge: '5', badgeKind: 'warn' },
  { id: 'reports',   path: '/reports',   icon: 'report',    label: 'Reportes' },
  { id: 'recurring', path: '/recurring', icon: 'recurring', label: 'Recurrencias' },
  { id: 'accounts',  path: '/accounts',  icon: 'account',   label: 'Cuentas' },
]

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { session } = useAuth()

  const email = session?.user?.email ?? ''
  const initials = email.slice(0, 2).toUpperCase()

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
          <div className="sb-brand-sub">Control familiar</div>
        </div>
      </div>

      <div className="sb-section">Principal</div>
      {principal.map(it => <Item key={it.id} it={it} />)}

      <div className="sb-section">Herramientas</div>
      {tools.map(it => <Item key={it.id} it={it} />)}

      <div className="sb-spacer" />

      <div className="sb-user">
        <div className="sb-avatar">{initials}</div>
        <div>
          <div className="sb-user-name">{email}</div>
          <div className="sb-user-plan">Plan Premium</div>
        </div>
        <button className="sb-cog icon-btn" onClick={() => supabase.auth.signOut()}>
          <Icon name="cog" size={15} />
        </button>
      </div>
    </aside>
  )
}
