// Budgets — envelope-style with smart pacing
const Budgets = () => {
  const buckets = [
    { name: "Vivienda", spent: 1420, total: 1500, color: "var(--cat-housing)", icon: "wallet", trend: "On pace", txs: 3 },
    { name: "Alimentación", spent: 892, total: 800, color: "var(--cat-food)", icon: "cash", trend: "Sobre presupuesto", over: true, txs: 28 },
    { name: "Transporte", spent: 562, total: 700, color: "var(--cat-transport)", icon: "card", trend: "On pace", txs: 14 },
    { name: "Servicios", spent: 384, total: 500, color: "var(--cat-services)", icon: "doc", trend: "Por debajo", under: true, txs: 9 },
    { name: "Ocio", spent: 312, total: 350, color: "var(--cat-leisure)", icon: "sparkle", trend: "On pace", txs: 11 },
    { name: "Salud", spent: 88, total: 200, color: "var(--cat-health)", icon: "review", trend: "Por debajo", under: true, txs: 2 },
  ];

  return (
    <>
      <Topbar greet="Presupuestos" date="Abril 2026 · Día 24 de 30 · 80% del mes" action="Nueva categoría" />

      {/* Overview */}
      <div className="budget-overview card">
        <div className="bo-left">
          <div className="card-title">Presupuesto total</div>
          <div className="num num-hero">$3,658<span className="cents">.<span>00</span></span></div>
          <div className="bo-meta">
            <span>Gastado <span className="num pos-text">$3,658</span></span>
            <span className="hero-pip" />
            <span>Restante <span className="num">$392</span></span>
            <span className="hero-pip" />
            <span>Total <span className="num">$4,050</span></span>
          </div>
        </div>
        <div className="bo-right">
          <div className="pace-track">
            <div className="pace-month-fill" style={{ width: "80%" }} />
            <div className="pace-spent" style={{ width: "90%" }} />
            <div className="pace-marker" style={{ left: "80%" }}>
              <div className="pace-marker-line" />
              <div className="pace-marker-label">Hoy · día 24</div>
            </div>
          </div>
          <div className="pace-legend">
            <span><span className="legend-dot" style={{ background: "var(--accent)" }}/> Gastado 90%</span>
            <span><span className="legend-dot" style={{ background: "var(--bg-3)" }}/> Mes 80%</span>
            <span className="warn-text" style={{ marginLeft: "auto" }}>10% adelantado del ritmo</span>
          </div>
        </div>
      </div>

      {/* Envelope grid */}
      <div className="envelope-grid">
        {buckets.map((b, i) => <Envelope key={i} b={b} />)}
        <div className="envelope envelope-add">
          <Icon name="plus" size={18} />
          <span>Añadir categoría</span>
        </div>
      </div>
    </>
  );
};

const Envelope = ({ b }) => {
  const pct = Math.min((b.spent / b.total) * 100, 120);
  const over = b.spent > b.total;
  return (
    <div className={`envelope ${over ? "envelope-over" : ""}`}>
      <div className="env-head">
        <div className="env-icon" style={{ background: `color-mix(in oklab, ${b.color} 18%, transparent)`, color: b.color }}>
          <Icon name={b.icon} size={14} />
        </div>
        <div className="env-name">{b.name}</div>
        <button className="icon-btn sm-btn" style={{ marginLeft: "auto" }}><Icon name="more" size={12} /></button>
      </div>
      <div className="env-amt">
        <span className="num num-md">${b.spent.toLocaleString()}</span>
        <span className="env-of">/ ${b.total.toLocaleString()}</span>
      </div>
      <div className="env-bar">
        <div
          className="env-bar-fill"
          style={{ width: `${Math.min(pct, 100)}%`, background: over ? "var(--neg)" : b.color }}
        />
        {over && <div className="env-bar-over" style={{ width: `${pct - 100}%`, left: "100%" }} />}
      </div>
      <div className="env-foot">
        <span className={`chip ${over ? "tag-warn" : b.under ? "tag-ok" : ""}`}>{b.trend}</span>
        <span className="env-txs">{b.txs} mov.</span>
      </div>
    </div>
  );
};

window.Budgets = Budgets;
