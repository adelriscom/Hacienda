import Icon from '../components/Icon'
import Topbar from '../components/Topbar'

const months = [
  { m: 'Ene', inc: 5800, exp: 3200 }, { m: 'Feb', inc: 6100, exp: 3650 },
  { m: 'Mar', inc: 5950, exp: 3400 }, { m: 'Abr', inc: 6420, exp: 3847, current: true },
  { m: 'May', inc: 6500, exp: 3950, forecast: true }, { m: 'Jun', inc: 6500, exp: 4100, forecast: true },
]
const categories = [
  { name: 'Vivienda',     amount: 1420, pct: 37, color: 'var(--cat-housing)' },
  { name: 'Alimentación', amount: 892,  pct: 23, color: 'var(--cat-food)' },
  { name: 'Transporte',   amount: 562,  pct: 15, color: 'var(--cat-transport)' },
  { name: 'Servicios',    amount: 384,  pct: 10, color: 'var(--cat-services)' },
  { name: 'Ocio',         amount: 312,  pct: 8,  color: 'var(--cat-leisure)' },
  { name: 'Otros',        amount: 277,  pct: 7,  color: 'var(--cat-other)' },
]
const max = 7000

export default function Dashboard() {
  return (
    <>
      <Topbar greet="Buenos días" date="Viernes, 24 de abril de 2026" />

      <div className="card hero-balance">
        <div className="hero-left">
          <div className="card-title">Saldo disponible real</div>
          <div className="num num-hero">$18,433<span className="cents">.<span>40</span></span></div>
          <div className="hero-meta">
            <span className="delta"><Icon name="trend-up" size={11} /> +12.5%</span>
            <span className="hero-sub">vs mes anterior</span>
            <span className="hero-pip" />
            <span className="hero-sub">Después de $6,422.90 en facturas próximas</span>
          </div>
          <div className="hero-bar">
            <div className="hero-bar-fill" style={{ width: '73%' }} />
            <div className="hero-bar-tick" style={{ left: '73%' }} />
          </div>
          <div className="hero-bar-legend">
            <span><span className="dot" style={{ background: 'var(--accent)' }} /> Disponible $18,433</span>
            <span><span className="dot" style={{ background: 'var(--bg-3)' }} /> Comprometido $6,423</span>
            <span className="hero-bar-total">Total $24,856.30</span>
          </div>
        </div>
        <div className="hero-right">
          <div className="hero-pill">
            <div className="hero-pill-h"><Icon name="income" size={13} style={{ color: 'var(--pos)' }} /><span>Ingresos</span></div>
            <div className="num num-lg">$6,420</div>
            <div className="hero-pill-sub">Este mes</div>
            <Sparkline points="0,8 5,7 10,5 15,6 20,4 25,3 30,2" color="var(--pos)" />
          </div>
          <div className="hero-pill">
            <div className="hero-pill-h"><Icon name="expense" size={13} style={{ color: 'var(--neg)' }} /><span>Gastos</span></div>
            <div className="num num-lg">$3,847</div>
            <div className="hero-pill-sub">Este mes</div>
            <Sparkline points="0,5 5,4 10,6 15,3 20,5 25,2 30,3" color="var(--neg)" />
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <KPI icon="piggy" label="Ahorros del mes"    value="$2,573" delta="+8.2%"       tone="pos"  tint="var(--accent-2)" />
        <KPI icon="card"  label="Tarjeta de crédito" value="$1,240" delta="42% del límite" tone="warn" tint="var(--accent-3)" />
        <KPI icon="wallet" label="Cuenta bancaria"   value="$18,420" delta="+$420"       tone="pos"  tint="var(--pos)" />
        <KPI icon="btc"   label="Inversiones"        value="$5,196" delta="+3.4%"        tone="pos"  tint="var(--warn)" />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-h">
            <div><h3>Flujo de Efectivo</h3><p>Ingresos vs Gastos · Pronóstico 3 meses</p></div>
            <div className="tabs">
              <button className="tab active">Mensual</button>
              <button className="tab">Semanal</button>
            </div>
          </div>
          <div className="cashflow-legend">
            <span className="row" style={{ gap: 6 }}><span className="legend-dot" style={{ background: 'var(--accent)' }} /> Ingresos</span>
            <span className="row" style={{ gap: 6 }}><span className="legend-dot" style={{ background: 'var(--accent-3)' }} /> Gastos</span>
            <span className="row" style={{ gap: 6, marginLeft: 'auto' }}><span className="legend-dot dashed" /> Pronóstico</span>
          </div>
          <div className="bars">
            {months.map((mo, i) => (
              <div key={i} className={`bar-col ${mo.current ? 'current' : ''}`}>
                <div className="bar-stack">
                  <div className={`bar inc ${mo.forecast ? 'forecast' : ''}`} style={{ height: `${(mo.inc / max) * 100}%` }} />
                  <div className={`bar exp ${mo.forecast ? 'forecast' : ''}`} style={{ height: `${(mo.exp / max) * 100}%` }} />
                </div>
                <div className="bar-label">{mo.m}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <div><h3>Gastos por Categoría</h3><p>Distribución este mes</p></div>
            <button className="btn ghost sm">Ver todo</button>
          </div>
          <Donut categories={categories} total="$3,847" />
          <div className="cat-list">
            {categories.map(c => (
              <div key={c.name} className="cat-row">
                <span className="cat-dot" style={{ background: c.color }} />
                <span className="cat-name">{c.name}</span>
                <span className="cat-pct">{c.pct}%</span>
                <span className="num cat-amt">${c.amount}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card insight ghost-card">
          <div className="insight-h">
            <div className="insight-icon"><Icon name="ghost" size={16} /></div>
            <div>
              <div className="insight-title">3 cargos fantasma detectados</div>
              <div className="insight-sub">Suscripciones que parecen sin usar</div>
            </div>
            <span className="delta neg" style={{ marginLeft: 'auto' }}>−$47.97/mes</span>
          </div>
          <div className="ghost-list">
            <GhostRow logo="N" color="#dc2626" name="Newsletter Pro"   amount="$12.99" since="6 meses sin abrir" />
            <GhostRow logo="C" color="#7c3aed" name="CloudSync Plus"   amount="$9.99"  since="No usado en 4 meses" />
            <GhostRow logo="S" color="#0ea5e9" name="StreamFit"        amount="$24.99" since="Última sesión: feb 2026" />
          </div>
          <button className="btn ghost sm" style={{ marginTop: 12 }}>Revisar todas <Icon name="chevron-right" size={12} /></button>
        </div>

        <div className="card insight">
          <div className="insight-h">
            <div className="insight-icon" style={{ background: 'rgba(99,102,241,0.14)', color: 'var(--accent)' }}><Icon name="calendar" size={16} /></div>
            <div>
              <div className="insight-title">Próximos pagos · 7 días</div>
              <div className="insight-sub">Programación inteligente</div>
            </div>
            <span className="num delta warn" style={{ marginLeft: 'auto' }}>$2,184.50</span>
          </div>
          <div className="upcoming-list">
            <UpRow date="28 Abr" name="Hipoteca"      sub="BBVA · Auto-débito"    amount="$1,420"  tag="Programado" tagKind="ok" />
            <UpRow date="29 Abr" name="Tarjeta Oro"   sub="Banamex · Mín. $480"  amount="$640"    tag="Optimizar"  tagKind="warn" />
            <UpRow date="01 May" name="Internet + Luz" sub="Telmex · CFE"         amount="$124.50" tag="Programado" tagKind="ok" />
          </div>
        </div>
      </div>
    </>
  )
}

function KPI({ icon, label, value, delta, tone = 'pos', tint }) {
  return (
    <div className="card kpi">
      <div className="kpi-h">
        <div className="kpi-icon" style={{ background: `color-mix(in oklab, ${tint} 18%, transparent)`, color: tint }}>
          <Icon name={icon} size={16} />
        </div>
        <Sparkline points="0,6 5,5 10,7 15,4 20,5 25,3 30,4" color={tint} small />
      </div>
      <div className="num num-lg" style={{ marginTop: 14 }}>{value}</div>
      <div className="kpi-foot">
        <span className="kpi-label">{label}</span>
        <span className={`delta ${tone === 'warn' ? 'warn' : tone === 'neg' ? 'neg' : ''}`}>{delta}</span>
      </div>
    </div>
  )
}

function Sparkline({ points, color, small }) {
  return (
    <svg width={small ? 56 : 72} height={small ? 22 : 28} viewBox="0 0 30 10" fill="none" preserveAspectRatio="none">
      <polyline points={points} stroke={color} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Donut({ categories, total }) {
  const r = 58, c = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="donut-wrap">
      <svg width="180" height="180" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--bg-3)" strokeWidth="14" />
        {categories.map((cat, i) => {
          const len = (cat.pct / 100) * c
          const dash = `${len} ${c - len}`
          const dashOffset = -offset
          offset += len
          return <circle key={i} cx="80" cy="80" r={r} fill="none" stroke={cat.color} strokeWidth="14" strokeDasharray={dash} strokeDashoffset={dashOffset} strokeLinecap="butt" transform="rotate(-90 80 80)" />
        })}
      </svg>
      <div className="donut-center"><div className="num num-lg">{total}</div><div className="donut-sub">Total</div></div>
    </div>
  )
}

function GhostRow({ logo, color, name, amount, since }) {
  return (
    <div className="ghost-row">
      <div className="ghost-logo" style={{ background: color }}>{logo}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ghost-name">{name}</div>
        <div className="ghost-since">{since}</div>
      </div>
      <div className="num ghost-amt">{amount}</div>
      <button className="btn ghost sm">Cancelar</button>
    </div>
  )
}

function UpRow({ date, name, sub, amount, tag, tagKind }) {
  return (
    <div className="up-row">
      <div className="up-date">{date}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="up-name">{name}</div>
        <div className="up-sub">{sub}</div>
      </div>
      <div className="num up-amt">{amount}</div>
      <span className={`chip ${tagKind === 'warn' ? 'warn-chip' : 'ok-chip'}`}>{tag}</span>
    </div>
  )
}
