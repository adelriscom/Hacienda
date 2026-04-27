// Reconciliation Workspace — import review, duplicate detection, source coverage
const Reconciliation = () => {
  return (
    <>
      <Topbar greet="Conciliación" date="Abril 2026 · Cierre próximo en 6 días" action="Importar archivo" />

      {/* Status banner */}
      <div className="recon-banner">
        <div className="recon-status-ring">
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="26" fill="none" stroke="var(--bg-3)" strokeWidth="6"/>
            <circle cx="32" cy="32" r="26" fill="none" stroke="var(--accent)" strokeWidth="6"
              strokeDasharray={`${0.78 * 2 * Math.PI * 26} ${2 * Math.PI * 26}`}
              strokeLinecap="round"
              transform="rotate(-90 32 32)"
            />
          </svg>
          <div className="recon-ring-num">78%</div>
        </div>
        <div className="recon-status-body">
          <div className="recon-status-label">Estado del mes</div>
          <div className="recon-status-title">Casi completo · 5 decisiones pendientes</div>
          <div className="recon-status-sub">232 de 247 movimientos conciliados · 3 documentos importados · 2 posibles duplicados</div>
        </div>
        <div className="recon-status-actions">
          <button className="btn ghost">Ver checklist</button>
          <button className="btn primary">Cerrar mes</button>
        </div>
      </div>

      <div className="recon-grid">
        {/* Source coverage */}
        <div className="card">
          <div className="card-h">
            <div>
              <h3>Cobertura por fuente</h3>
              <p>Documentos importados este mes</p>
            </div>
            <button className="btn ghost sm"><Icon name="plus" size={12}/> Importar</button>
          </div>
          <div className="source-list">
            <SourceRow name="BBVA · Estado de cuenta" type="PDF" rows="142 / 142" pct={100} status="ok" date="22 Abr 09:14" />
            <SourceRow name="Banamex · Tarjeta Oro" type="DOCX" rows="68 / 71" pct={96} status="warn" date="22 Abr 09:18" />
            <SourceRow name="Cuenta Ahorro · CSV" type="CSV" rows="22 / 22" pct={100} status="ok" date="20 Abr 18:00" />
            <SourceRow name="Movimientos manuales" type="—" rows="12 / 12" pct={100} status="ok" date="—" />
            <SourceRow name="Inversiones · Pendiente" type="—" rows="0 / ?" pct={0} status="missing" date="No importado" />
          </div>
        </div>

        {/* Decisions queue */}
        <div className="card">
          <div className="card-h">
            <div>
              <h3>Decisiones pendientes</h3>
              <p>5 elementos requieren tu revisión</p>
            </div>
            <span className="chip warn-chip"><Icon name="review" size={10}/> Pendientes</span>
          </div>

          <DecisionRow
            kind="duplicate"
            title="Posible duplicado"
            desc="Mercado Central — $84.50 — 24 Abr"
            sub="Coincide con cargo manual del 24 Abr · 14:32"
            actions={["Es el mismo", "Son distintos"]}
          />
          <DecisionRow
            kind="match"
            title="Sugerencia de match"
            desc="Transferencia $500 → Ahorros"
            sub="Vincular con obligación 'Meta de ahorro mensual'"
            actions={["Vincular", "Ignorar"]}
          />
          <DecisionRow
            kind="card"
            title="Pago de tarjeta sin clasificar"
            desc="$640.00 a Tarjeta Oro"
            sub="¿Es liquidación de saldo o gasto del mes?"
            actions={["Liquidación", "Gasto"]}
          />
          <DecisionRow
            kind="missing"
            title="Movimiento esperado faltante"
            desc="Hipoteca BBVA — $1,420 — esperado 28 Abr"
            sub="Programado, aún no aparece en estado de cuenta"
            actions={["Marcar pagado", "Esperar"]}
          />
        </div>

        {/* Audit timeline */}
        <div className="card audit-card">
          <div className="card-h">
            <div>
              <h3>Bitácora reciente</h3>
              <p>Últimos cambios y decisiones</p>
            </div>
          </div>
          <div className="audit-list">
            <AuditRow time="hace 2 min" who="AM" action="Importó" target="BBVA · Estado de cuenta · 142 filas" />
            <AuditRow time="hace 14 min" who="AM" action="Resolvió" target="Cargo fantasma — Newsletter Pro" />
            <AuditRow time="hace 1 h" who="MV" action="Marcó como duplicado" target="Café El Jardín — $6.80" />
            <AuditRow time="hace 3 h" who="AM" action="Vinculó transferencia" target="Ahorro mensual — $500" />
            <AuditRow time="ayer" who="AM" action="Editó categoría" target="Farmacia → Salud" />
          </div>
        </div>

        {/* Carry-forward preview */}
        <div className="card carry-card">
          <div className="card-h">
            <div>
              <h3>Preparación · Mayo 2026</h3>
              <p>Vista previa del próximo mes</p>
            </div>
            <button className="btn ghost sm">Configurar</button>
          </div>
          <div className="carry-stats">
            <CarryStat label="Saldo a trasladar" value="$18,433.40" tone="pos" />
            <CarryStat label="Recurrencias" value="14 obligaciones" />
            <CarryStat label="Saldos sin resolver" value="$640.00" tone="warn" />
            <CarryStat label="Presupuestos clonados" value="6 categorías" />
          </div>
          <div className="carry-cta">
            <Icon name="sparkle" size={14} style={{ color: "var(--accent)" }} />
            <span>Listo para crear Mayo cuando cierres Abril</span>
          </div>
        </div>
      </div>
    </>
  );
};

const SourceRow = ({ name, type, rows, pct, status, date }) => (
  <div className="source-row">
    <div className="source-icon"><Icon name="doc" size={15} /></div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="source-name">{name}</div>
      <div className="source-meta">{type} · {rows} · {date}</div>
    </div>
    <div className="source-bar"><div style={{ width: `${pct}%`, background: status === "ok" ? "var(--pos)" : status === "warn" ? "var(--warn)" : "var(--ink-3)" }} /></div>
    {status === "ok" && <span className="chip ok-chip"><Icon name="check" size={10}/> {pct}%</span>}
    {status === "warn" && <span className="chip warn-chip">{pct}%</span>}
    {status === "missing" && <span className="chip" style={{ background: "var(--bg-3)", color: "var(--ink-3)" }}>Falta</span>}
  </div>
);

const DecisionRow = ({ kind, title, desc, sub, actions }) => {
  const iconMap = { duplicate: "link", match: "sparkle", card: "card", missing: "review" };
  const colorMap = { duplicate: "var(--neg)", match: "var(--accent)", card: "var(--accent-3)", missing: "var(--warn)" };
  return (
    <div className="decision-row">
      <div className="decision-icon" style={{ background: `color-mix(in oklab, ${colorMap[kind]} 16%, transparent)`, color: colorMap[kind] }}>
        <Icon name={iconMap[kind]} size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="decision-title">{title}</div>
        <div className="decision-desc">{desc}</div>
        <div className="decision-sub">{sub}</div>
      </div>
      <div className="decision-actions">
        <button className="btn sm">{actions[0]}</button>
        <button className="btn ghost sm">{actions[1]}</button>
      </div>
    </div>
  );
};

const AuditRow = ({ time, who, action, target }) => (
  <div className="audit-row">
    <div className="audit-avatar">{who}</div>
    <div style={{ flex: 1 }}>
      <div className="audit-line">
        <span className="audit-action">{action}</span> <span className="audit-target">{target}</span>
      </div>
      <div className="audit-time">{time}</div>
    </div>
  </div>
);

const CarryStat = ({ label, value, tone }) => (
  <div className="carry-stat">
    <div className="carry-label">{label}</div>
    <div className={`num carry-value ${tone === "pos" ? "pos-text" : tone === "warn" ? "warn-text" : ""}`}>{value}</div>
  </div>
);

window.Reconciliation = Reconciliation;
