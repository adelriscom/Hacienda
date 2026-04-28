// Transactions Ledger — searchable, with ghost charges flagged + reconciliation status
const Transactions = () => {
  const txs = [
    { d: "24 Abr", time: "14:32", name: "Mercado Central", cat: "Alimentación", catColor: "var(--cat-food)", acct: "BBVA •• 4821", amt: -84.50, status: "match", tag: null },
    { d: "24 Abr", time: "09:15", name: "Spotify Premium", cat: "Servicios", catColor: "var(--cat-services)", acct: "Tarjeta Oro", amt: -9.99, status: "match", tag: { kind: "ok", txt: "Recurrente" } },
    { d: "23 Abr", time: "19:48", name: "Uber", cat: "Transporte", catColor: "var(--cat-transport)", acct: "Tarjeta Oro", amt: -12.40, status: "match", tag: null },
    { d: "23 Abr", time: "13:00", name: "Nómina · Acme Corp", cat: "Salario", catColor: "var(--pos)", acct: "BBVA •• 4821", amt: 3210.00, status: "match", tag: { kind: "income", txt: "Ingreso" } },
    { d: "22 Abr", time: "20:14", name: "Newsletter Pro", cat: "Servicios", catColor: "var(--cat-services)", acct: "Tarjeta Oro", amt: -12.99, status: "ghost", tag: { kind: "ghost", txt: "Cargo fantasma" } },
    { d: "22 Abr", time: "12:30", name: "Farmacia San Pablo", cat: "Salud", catColor: "var(--cat-health)", acct: "Efectivo", amt: -28.10, status: "review", tag: { kind: "warn", txt: "Por revisar" } },
    { d: "21 Abr", time: "18:02", name: "Transferencia → Ahorro", cat: "Transferencia", catColor: "var(--ink-2)", acct: "BBVA → Cuenta Ahorro", amt: -500.00, status: "match", tag: { kind: "ok", txt: "Transferencia" } },
    { d: "21 Abr", time: "11:20", name: "Café El Jardín", cat: "Alimentación", catColor: "var(--cat-food)", acct: "Tarjeta Oro", amt: -6.80, status: "match", tag: null },
    { d: "20 Abr", time: "16:45", name: "Hipoteca · BBVA", cat: "Vivienda", catColor: "var(--cat-housing)", acct: "BBVA •• 4821", amt: -1420.00, status: "match", tag: { kind: "ok", txt: "Programado" } },
    { d: "20 Abr", time: "10:00", name: "Pago Tarjeta Oro", cat: "Pago tarjeta", catColor: "var(--ink-2)", acct: "BBVA → Tarjeta Oro", amt: -640.00, status: "match", tag: { kind: "ok", txt: "Liquidación" } },
    { d: "19 Abr", time: "21:11", name: "CloudSync Plus", cat: "Servicios", catColor: "var(--cat-services)", acct: "Tarjeta Oro", amt: -9.99, status: "ghost", tag: { kind: "ghost", txt: "Cargo fantasma" } },
    { d: "19 Abr", time: "14:00", name: "Gasolina Pemex", cat: "Transporte", catColor: "var(--cat-transport)", acct: "Tarjeta Oro", amt: -42.00, status: "match", tag: null },
  ];

  const filters = ["Todos", "Ingresos", "Gastos", "Transferencias", "Tarjeta de crédito", "Por revisar"];

  return (
    <>
      <Topbar greet="Transacciones" date="Abril 2026 · 247 movimientos · 5 por revisar" action="Nuevo movimiento" />

      {/* Filters bar */}
      <div className="card filters-bar">
        <div className="filter-tabs">
          {filters.map((f, i) => (
            <button key={f} className={`tab ${i === 0 ? "active" : ""}`}>
              {f}
              {f === "Por revisar" && <span className="filter-dot" />}
            </button>
          ))}
        </div>
        <div className="filter-spacer" />
        <button className="btn ghost sm"><Icon name="filter" size={12}/> Categoría</button>
        <button className="btn ghost sm"><Icon name="account" size={12}/> Cuenta</button>
        <button className="btn ghost sm"><Icon name="calendar" size={12}/> Abril 2026</button>
      </div>

      {/* Coverage strip */}
      <div className="coverage-strip">
        <div className="coverage-item">
          <div className="coverage-label">Conciliados</div>
          <div className="coverage-bar"><div style={{ width: "94%", background: "var(--pos)" }} /></div>
          <div className="coverage-num"><span className="num">232</span> <span>/ 247</span></div>
        </div>
        <div className="coverage-item">
          <div className="coverage-label">Por revisar</div>
          <div className="coverage-bar"><div style={{ width: "20%", background: "var(--warn)" }} /></div>
          <div className="coverage-num"><span className="num warn-text">5</span> <span>pendientes</span></div>
        </div>
        <div className="coverage-item">
          <div className="coverage-label">Cargos fantasma</div>
          <div className="coverage-bar"><div style={{ width: "12%", background: "var(--accent-2)" }} /></div>
          <div className="coverage-num"><span className="num" style={{ color: "var(--accent-2)" }}>3</span> <span>detectados</span></div>
        </div>
        <div className="coverage-item">
          <div className="coverage-label">Posibles duplicados</div>
          <div className="coverage-bar"><div style={{ width: "8%", background: "var(--neg)" }} /></div>
          <div className="coverage-num"><span className="num neg-text">2</span> <span>encontrados</span></div>
        </div>
      </div>

      {/* Table */}
      <div className="card tx-card">
        <div className="tx-header">
          <span className="tx-col-d">Fecha</span>
          <span className="tx-col-name">Concepto</span>
          <span className="tx-col-cat">Categoría</span>
          <span className="tx-col-acct">Cuenta</span>
          <span className="tx-col-tag">Estado</span>
          <span className="tx-col-amt">Monto</span>
          <span className="tx-col-act"></span>
        </div>
        {txs.map((t, i) => <TxRow key={i} t={t} />)}
      </div>
    </>
  );
};

const TxRow = ({ t }) => {
  const isGhost = t.status === "ghost";
  const isReview = t.status === "review";
  return (
    <div className={`tx-row ${isGhost ? "ghost-row-tx" : ""} ${isReview ? "review-row-tx" : ""}`}>
      <div className="tx-col-d">
        <div className="tx-date">{t.d}</div>
        <div className="tx-time">{t.time}</div>
      </div>
      <div className="tx-col-name">
        <div className="tx-merchant">{t.name}</div>
      </div>
      <div className="tx-col-cat">
        <span className="cat-pill">
          <span className="cat-dot" style={{ background: t.catColor }} />
          {t.cat}
        </span>
      </div>
      <div className="tx-col-acct">{t.acct}</div>
      <div className="tx-col-tag">
        {t.tag && (
          <span className={`chip tag-${t.tag.kind}`}>
            {t.tag.kind === "ghost" && <Icon name="ghost" size={10} />}
            {t.tag.kind === "warn" && <Icon name="review" size={10} />}
            {t.tag.kind === "ok" && <Icon name="check" size={10} />}
            {t.tag.kind === "income" && <Icon name="income" size={10} />}
            {t.tag.txt}
          </span>
        )}
      </div>
      <div className="tx-col-amt num" style={{ color: t.amt > 0 ? "var(--pos)" : "var(--ink-0)" }}>
        {t.amt > 0 ? "+" : "−"}${Math.abs(t.amt).toFixed(2)}
      </div>
      <div className="tx-col-act">
        <button className="icon-btn sm-btn"><Icon name="more" size={14} /></button>
      </div>
    </div>
  );
};

window.Transactions = Transactions;
