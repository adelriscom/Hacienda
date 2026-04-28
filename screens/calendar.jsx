// Calendar — smart payment scheduling
const CalendarScreen = () => {
  // Build calendar for April 2026 (30 days, starts on Wed)
  const startDay = 3; // 0=Sun ... Wed=3
  const days = [];
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let d = 1; d <= 30; d++) days.push(d);
  while (days.length % 7 !== 0) days.push(null);

  const events = {
    1:  [{ kind: "income", amt: 3210, name: "Nómina" }],
    5:  [{ kind: "exp", amt: 84, name: "Internet" }],
    8:  [{ kind: "exp", amt: 1420, name: "Hipoteca", big: true }],
    12: [{ kind: "exp", amt: 124, name: "Servicios" }],
    15: [{ kind: "income", amt: 3210, name: "Nómina" }, { kind: "transfer", amt: 500, name: "Ahorro" }],
    18: [{ kind: "exp", amt: 640, name: "Tarjeta", warn: true }],
    22: [{ kind: "exp", amt: 124, name: "CFE + Telmex" }],
    24: [{ kind: "today" }],
    28: [{ kind: "exp", amt: 1420, name: "Hipoteca", future: true }],
    29: [{ kind: "exp", amt: 640, name: "Tarjeta", future: true, warn: true }],
  };

  return (
    <>
      <Topbar greet="Calendario" date="Abril 2026 · 8 pagos programados · $4,238 comprometidos" action="Programar pago" />

      <div className="cal-grid">
        <div className="card cal-main">
          <div className="card-h">
            <div>
              <h3>Abril 2026</h3>
              <p>Pagos programados, ingresos y transferencias</p>
            </div>
            <div className="tabs">
              <button className="tab active">Mes</button>
              <button className="tab">Semana</button>
              <button className="tab">Lista</button>
            </div>
          </div>

          <div className="cal-weekdays">
            {["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="cal-days">
            {days.map((d, i) => (
              <div key={i} className={`cal-cell ${d === null ? "cal-empty" : ""} ${d === 24 ? "cal-today" : ""}`}>
                {d !== null && (
                  <>
                    <div className="cal-num">{d}</div>
                    <div className="cal-events">
                      {(events[d] || []).filter(e => e.kind !== "today").map((e, j) => (
                        <div key={j} className={`cal-evt cal-evt-${e.kind} ${e.future ? "cal-evt-future" : ""} ${e.warn ? "cal-evt-warn" : ""}`}>
                          <span className="cal-evt-name">{e.name}</span>
                          <span className="num cal-evt-amt">${e.amt}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card">
            <div className="card-h">
              <div>
                <h3>Sugerencia inteligente</h3>
                <p>Optimiza tu flujo de efectivo</p>
              </div>
              <Icon name="sparkle" size={16} style={{ color: "var(--accent)" }} />
            </div>
            <div className="suggest-card">
              <div className="suggest-headline">
                Mueve el pago de tarjeta del 29 al 02 de mayo
              </div>
              <div className="suggest-body">
                Tu nómina llega el 01 may. Pagar el 02 evita que tu saldo disponible baje a <span className="neg-text num">$1,210</span> el 29 abr.
              </div>
              <div className="suggest-row">
                <div className="suggest-stat">
                  <div className="suggest-stat-l">Hoy</div>
                  <div className="num neg-text">$1,210</div>
                  <div className="suggest-stat-s">29 abr</div>
                </div>
                <Icon name="chevron-right" size={14} style={{ color: "var(--ink-3)" }}/>
                <div className="suggest-stat">
                  <div className="suggest-stat-l">Si reagendas</div>
                  <div className="num pos-text">$2,420</div>
                  <div className="suggest-stat-s">02 may</div>
                </div>
              </div>
              <div className="row" style={{ marginTop: 14, gap: 8 }}>
                <button className="btn primary sm">Reagendar</button>
                <button className="btn ghost sm">Ver detalle</button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <div>
                <h3>Próximos 14 días</h3>
                <p>$4,238 comprometidos</p>
              </div>
            </div>
            <div className="upcoming-list">
              <UpRow date="28 Abr" name="Hipoteca BBVA" sub="Auto-débito" amount="$1,420" tag="Programado" tagKind="ok" />
              <UpRow date="29 Abr" name="Tarjeta Oro" sub="Recomendamos mover" amount="$640" tag="Optimizar" tagKind="warn" />
              <UpRow date="01 May" name="Nómina" sub="Ingreso esperado" amount="+$3,210" tag="Ingreso" tagKind="ok" />
              <UpRow date="05 May" name="Internet + CFE" sub="Domiciliado" amount="$124" tag="Programado" tagKind="ok" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

window.CalendarScreen = CalendarScreen;
