import Icon from '../components/Icon'
import Topbar from '../components/Topbar'

export default function ReviewShared() {
  return (
    <>
      <Topbar greet="Por revisar" date="5 elementos pendientes · 2 personas" action="Marcar todo revisado" />

      <div className="review-grid">
        <div className="card">
          <div className="card-h">
            <div><h3>Cola de revisión</h3><p>Ambigüedades preservadas hasta resolver</p></div>
            <div className="tabs">
              <button className="tab active">Todos · 5</button>
              <button className="tab">Crítico · 1</button>
              <button className="tab">Sugerido · 4</button>
            </div>
          </div>
          <ReviewItem severity="high" title="Cargo $640 sin clasificar"      desc="Pago a Tarjeta Oro · 20 abr"           sugg="Posible liquidación de saldo, no gasto del mes."    who="AM" />
          <ReviewItem severity="med"  title="Posible duplicado"              desc="Mercado Central — $84.50 — 24 abr · 14:32" sugg="Coincide con cargo manual del mismo día."       who="MV" />
          <ReviewItem severity="med"  title="Transferencia sin destino"      desc="$500 desde BBVA · 21 abr"              sugg="Vincular con obligación 'Ahorro mensual'."          who="AM" />
          <ReviewItem severity="low"  title="Categoría poco frecuente"       desc="Farmacia San Pablo — $28.10"           sugg="Anteriormente clasificado como 'Salud'."            who="—" />
          <ReviewItem severity="low"  title="Cargo recurrente nuevo"         desc="StreamFit — $24.99"                    sugg="¿Crear recurrencia o marcar como fantasma?"         who="MV" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card shared-card">
            <div className="card-h">
              <div><h3>Finanzas compartidas</h3><p>Hogar Martínez · 2 personas</p></div>
              <Icon name="users" size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <div className="couple-row">
              <div className="couple">
                <div className="couple-avatar" style={{ background: 'linear-gradient(135deg,#f59e0b,#ec4899)' }}>AM</div>
                <div className="couple-name">Alejandro</div>
                <div className="couple-pct">62%</div>
                <div className="num couple-amt">$2,384</div>
              </div>
              <div className="couple-bar">
                <div style={{ width: '62%', background: 'linear-gradient(90deg,#f59e0b,#ec4899)' }} />
                <div style={{ width: '38%', background: 'linear-gradient(90deg,#6366f1,#38bdf8)' }} />
              </div>
              <div className="couple">
                <div className="couple-avatar" style={{ background: 'linear-gradient(135deg,#6366f1,#38bdf8)' }}>MV</div>
                <div className="couple-name">María</div>
                <div className="couple-pct">38%</div>
                <div className="num couple-amt">$1,463</div>
              </div>
            </div>
            <div className="settle-card">
              <div>
                <div className="settle-label">Saldo entre ustedes</div>
                <div className="settle-line">
                  <span className="couple-mini" style={{ background: 'linear-gradient(135deg,#6366f1,#38bdf8)' }}>MV</span>
                  <Icon name="chevron-right" size={12} style={{ color: 'var(--ink-3)' }} />
                  <span className="couple-mini" style={{ background: 'linear-gradient(135deg,#f59e0b,#ec4899)' }}>AM</span>
                  <span className="num settle-amt">$240.50</span>
                </div>
                <div className="settle-sub">María debe a Alejandro · gastos compartidos abr</div>
              </div>
              <button className="btn primary sm">Liquidar</button>
            </div>
          </div>

          <div className="card">
            <div className="card-h"><div><h3>Compartido este mes</h3><p>Gastos divididos automáticamente</p></div></div>
            <SharedRow name="Hipoteca"     who="AM" amount="$1,420" split="50 / 50" />
            <SharedRow name="Mercado"      who="MV" amount="$340"   split="60 / 40" />
            <SharedRow name="Servicios"    who="AM" amount="$184"   split="50 / 50" />
            <SharedRow name="Restaurantes" who="MV" amount="$210"   split="50 / 50" />
          </div>
        </div>
      </div>
    </>
  )
}

function ReviewItem({ severity, title, desc, sugg, who }) {
  const map = { high: 'var(--neg)', med: 'var(--warn)', low: 'var(--ink-3)' }
  return (
    <div className="review-row">
      <div className="review-sev" style={{ background: map[severity] }} />
      <div className="review-body">
        <div className="review-h">
          <div className="review-title">{title}</div>
          <span className={`chip ${severity === 'high' ? 'tag-warn' : severity === 'med' ? 'warn-chip' : ''}`}>
            {severity === 'high' ? 'Crítico' : severity === 'med' ? 'Atención' : 'Sugerido'}
          </span>
        </div>
        <div className="review-desc">{desc}</div>
        <div className="review-sugg"><Icon name="lightbulb" size={11} /> {sugg}</div>
      </div>
      <div className="review-actions">
        <button className="btn sm">Resolver</button>
        <button className="btn ghost sm">Posponer</button>
        {who !== '—' && <div className="review-who">{who}</div>}
      </div>
    </div>
  )
}

function SharedRow({ name, who, amount, split }) {
  return (
    <div className="shared-row">
      <div className="shared-name">{name}</div>
      <div className="shared-who">Pagó {who}</div>
      <div className="shared-split">{split}</div>
      <div className="num shared-amt">{amount}</div>
    </div>
  )
}
