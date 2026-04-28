import { useState } from 'react'
import Icon from '../components/Icon'
import Topbar from '../components/Topbar'
import NewTransactionModal from '../components/NewTransactionModal'
import ImportModal from '../components/ImportModal'
import { useTransactions } from '../hooks/useTransactions'

const FILTERS = ['Todos', 'Ingresos', 'Gastos', 'Transferencias', 'Tarjeta de crédito', 'Por revisar']

export default function Transactions() {
  const { transactions, loading, addTransaction, addTransactions } = useTransactions()
  const [showNew, setShowNew]       = useState(false)
  const [showImport, setShowImport] = useState(false)

  const ghost   = transactions.filter(t => t.status === 'ghost').length
  const review  = transactions.filter(t => t.status === 'review').length
  const matched = transactions.filter(t => t.status === 'match').length
  const total   = transactions.length

  return (
    <>
      <Topbar greet="Transacciones" date={`Abril 2026 · ${total} movimientos · ${review} por revisar`}>
        <button className="btn ghost sm" onClick={() => setShowImport(true)}>
          <Icon name="upload" size={12} /> Importar
        </button>
        <button className="btn primary sm" onClick={() => setShowNew(true)}>
          <Icon name="plus" size={12} /> Nuevo movimiento
        </button>
      </Topbar>

      <div className="card filters-bar">
        <div className="filter-tabs">
          {FILTERS.map((f, i) => (
            <button key={f} className={`tab ${i === 0 ? 'active' : ''}`}>
              {f}
              {f === 'Por revisar' && <span className="filter-dot" />}
            </button>
          ))}
        </div>
        <div className="filter-spacer" />
        <button className="btn ghost sm"><Icon name="filter" size={12} /> Categoría</button>
        <button className="btn ghost sm"><Icon name="account" size={12} /> Cuenta</button>
        <button className="btn ghost sm"><Icon name="calendar" size={12} /> Abril 2026</button>
      </div>

      <div className="coverage-strip">
        <CoverageItem label="Conciliados"     bar={total ? matched/total*100 : 0} color="var(--pos)"      num={<><span className="num">{matched}</span> <span>/ {total}</span></>} />
        <CoverageItem label="Por revisar"     bar={total ? review/total*100  : 0} color="var(--warn)"     num={<><span className="num warn-text">{review}</span> <span>pendientes</span></>} />
        <CoverageItem label="Cargos fantasma" bar={total ? ghost/total*100   : 0} color="var(--accent-2)" num={<><span className="num" style={{ color:'var(--accent-2)' }}>{ghost}</span> <span>detectados</span></>} />
      </div>

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
        {loading
          ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>Cargando…</div>
          : transactions.length === 0
            ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>
                Sin movimientos. Importa un archivo o agrega uno manualmente.
              </div>
            : transactions.map(t => <TxRow key={t.id} t={t} />)
        }
      </div>

      {showNew && (
        <NewTransactionModal
          onClose={() => setShowNew(false)}
          onSave={addTransaction}
        />
      )}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSave={addTransactions}
        />
      )}
    </>
  )
}

function CoverageItem({ label, bar, color, num }) {
  return (
    <div className="coverage-item">
      <div className="coverage-label">{label}</div>
      <div className="coverage-bar"><div style={{ width: `${bar}%`, background: color }} /></div>
      <div className="coverage-num">{num}</div>
    </div>
  )
}

function TxRow({ t }) {
  const isGhost  = t.status === 'ghost'
  const isReview = t.status === 'review'
  const d = new Date(t.occurred_at)
  const dateStr = d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
  const timeStr = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })

  return (
    <div className={`tx-row ${isGhost ? 'ghost-row-tx' : ''} ${isReview ? 'review-row-tx' : ''}`}>
      <div className="tx-col-d">
        <div className="tx-date">{dateStr}</div>
        <div className="tx-time">{timeStr}</div>
      </div>
      <div className="tx-col-name">
        <div className="tx-merchant">{t.description}</div>
      </div>
      <div className="tx-col-cat">
        {t.category && (
          <span className="cat-pill">
            <span className="cat-dot" style={{ background: t.category.color }} />
            {t.category.name}
          </span>
        )}
      </div>
      <div className="tx-col-acct">{t.account?.name}</div>
      <div className="tx-col-tag">
        {t.tag && (
          <span className={`chip tag-${t.tag.kind}`}>
            {t.tag.kind === 'ghost'  && <Icon name="ghost"  size={10} />}
            {t.tag.kind === 'warn'   && <Icon name="review" size={10} />}
            {t.tag.kind === 'ok'     && <Icon name="check"  size={10} />}
            {t.tag.kind === 'income' && <Icon name="income" size={10} />}
            {t.tag.txt}
          </span>
        )}
      </div>
      <div className="tx-col-amt num" style={{ color: t.amount > 0 ? 'var(--pos)' : 'var(--ink-0)' }}>
        {t.amount > 0 ? '+' : '−'}${Math.abs(t.amount).toFixed(2)}
      </div>
      <div className="tx-col-act">
        <button className="icon-btn sm-btn"><Icon name="more" size={14} /></button>
      </div>
    </div>
  )
}
