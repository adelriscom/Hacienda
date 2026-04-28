import Icon from '../components/Icon'
import Topbar from '../components/Topbar'

const startDay = 3
const events = {
  1:  [{ kind: 'income',   amt: 3210, name: 'Nómina' }],
  5:  [{ kind: 'exp',      amt: 84,   name: 'Internet' }],
  8:  [{ kind: 'exp',      amt: 1420, name: 'Hipoteca', big: true }],
  12: [{ kind: 'exp',      amt: 124,  name: 'Servicios' }],
  15: [{ kind: 'income',   amt: 3210, name: 'Nómina' }, { kind: 'transfer', amt: 500, name: 'Ahorro' }],
  18: [{ kind: 'exp',      amt: 640,  name: 'Tarjeta', warn: true }],
  22: [{ kind: 'exp',      amt: 124,  name: 'CFE + Telmex' }],
  24: [{ kind: 'today' }],
  28: [{ kind: 'exp',      amt: 1420, name: 'Hipoteca', future: true }],
  29: [{ kind: 'exp',      amt: 640,  name: 'Tarjeta', future: true, warn: true }],
}

const upcoming = [
  { date: '28 Abr', name: 'Hipoteca BBVA',  sub: 'Auto-débito · $1,420', kind: 'exp', amt: 1420 },
  { date: '29 Abr', name: 'Tarjeta Oro',    sub: 'Banamex · pago mín. $480', kind: 'exp', amt: 640, warn: true },
  { date: '01 May', name: 'Internet + Luz', sub: 'Telmex · CFE', kind: 'exp', amt: 124.50 },
  { date: '15 May', name: 'Nómina',         sub: 'Acme Corp', kind: 'income', amt: 3210 },
]

export default function CalendarScreen() {
  const days = []
  for (let i = 0; i < startDay; i++) days.push(null)
  for (let d = 1; d <= 30; d++) days.push(d)
  while (days.length % 7 !== 0) days.push(null)

  return (
    <>
      <Topbar greet="Calendario" date="Abril 2026 · 8 pagos programados · $4,238 comprometidos" action="Programar pago" />

      <div className="cal-grid">
        <div className="card cal-main">
          <div className="card-h">
            <div><h3>Abril 2026</h3><p>Pagos programados, ingresos y transferencias</p></div>
            <div className="tabs">
              <button className="tab active">Mes</button>
              <button className="tab">Semana</button>
              <button className="tab">Lista</button>
            </div>
          </div>
          <div className="cal-weekdays">
            {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="cal-days">
            {days.map((d, i) => (
              <div key={i} className={`cal-cell ${d === null ? 'cal-empty' : ''} ${d === 24 ? 'cal-today' : ''}`}>
                {d !== null && (
                  <>
                    <div className="cal-num">{d}</div>
                    <div className="cal-events">
                      {(events[d] || []).filter(e => e.kind !== 'today').map((e, j) => (
                        <div key={j} className={`cal-evt cal-evt-${e.kind} ${e.future ? 'cal-evt-future' : ''} ${e.warn ? 'cal-evt-warn' : ''}`}>
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

        <div className="card cal-sidebar">
          <div className="card-h"><div><h3>Próximos · 30 días</h3><p>Ordenados por fecha</p></div></div>
          <div className="cal-list">
            {upcoming.map((u, i) => (
              <div key={i} className="cal-list-row">
                <div className={`cal-list-dot cal-evt-${u.kind}`} />
                <div style={{ flex: 1 }}>
                  <div className="cal-list-name">{u.name}</div>
                  <div className="cal-list-sub">{u.sub}</div>
                </div>
                <div className="cal-list-right">
                  <div className={`num cal-list-amt ${u.kind === 'income' ? 'pos-text' : ''}`}>
                    {u.kind === 'income' ? '+' : '−'}${u.amt.toLocaleString()}
                  </div>
                  <div className="cal-list-date">{u.date}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
