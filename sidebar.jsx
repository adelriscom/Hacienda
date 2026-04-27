// Sidebar — vertical nav matching Vault Finanzas reference
const Sidebar = ({ active = "dashboard", onNav }) => {
  const principal = [
    { id: "dashboard", icon: "grid", label: "Dashboard" },
    { id: "expenses", icon: "expense", label: "Gastos", badge: "24" },
    { id: "income", icon: "income", label: "Ingresos", badge: "8" },
    { id: "budgets", icon: "budget", label: "Presupuestos" },
  ];
  const tools = [
    { id: "calendar", icon: "calendar", label: "Calendario", badge: "3", badgeKind: "accent" },
    { id: "review", icon: "review", label: "Por revisar", badge: "5", badgeKind: "warn" },
    { id: "reports", icon: "report", label: "Reportes" },
    { id: "recurring", icon: "recurring", label: "Recurrencias" },
    { id: "accounts", icon: "account", label: "Cuentas" },
  ];

  const Item = ({ it }) => (
    <div
      className={`sb-item ${active === it.id ? "active" : ""}`}
      onClick={() => onNav && onNav(it.id)}
    >
      <Icon name={it.icon} className="ico" />
      <span>{it.label}</span>
      {it.badge && <span className={`badge ${it.badgeKind || ""}`}>{it.badge}</span>}
    </div>
  );

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
        <div className="sb-avatar">AM</div>
        <div>
          <div className="sb-user-name">Alexander M.</div>
          <div className="sb-user-plan">Plan Premium</div>
        </div>
        <div className="sb-cog"><Icon name="cog" size={15} /></div>
      </div>
    </aside>
  );
};

const Topbar = ({ greet, date, action = "Nuevo movimiento" }) => (
  <div className="topbar">
    <div className="greet">
      <h1>{greet}</h1>
      <p>{date}</p>
    </div>
    <div className="topbar-spacer" />
    <div className="search">
      <Icon name="search" size={14} className="ico" />
      <input placeholder="Buscar transacción, categoría…" />
    </div>
    <button className="icon-btn"><Icon name="bell" size={15} /><span className="dot" /></button>
    <button className="btn primary"><Icon name="plus" size={14} /> {action}</button>
  </div>
);

window.Sidebar = Sidebar;
window.Topbar = Topbar;
