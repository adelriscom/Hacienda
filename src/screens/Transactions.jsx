import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Icon from '../components/Icon'
import Topbar from '../components/Topbar'
import NewTransactionModal from '../components/NewTransactionModal'
import ImportModal from '../components/ImportModal'
import { useTransactions } from '../hooks/useTransactions'

export default function Transactions() {
  const { transactions, loading, addTransaction, addTransactions } = useTransactions()
  const [showNew, setShowNew]       = useState(false)
  const [showImport, setShowImport] = useState(false)
  const { t } = useTranslation()

  const FILTERS = [
    t('transactions.filters.all'),
    t('transactions.filters.income'),
    t('transactions.filters.expenses'),
    t('transactions.filters.transfers'),
    t('transactions.filters.creditCard'),
    t('transactions.filters.review'),
  ]

  const ghost   = transactions.filter(tx => tx.status === 'ghost').length
  const review  = transactions.filter(tx => tx.status === 'review').length
  const matched = transactions.filter(tx => tx.status === 'match').length
  const total   = transactions.length

  return (
    <>
      <Topbar greet={t('transactions.title')}
        date={t('transactions.subtitle', { month: 'April 2026', total, review })}>
        <button className="btn ghost sm" onClick={() => setShowImport(true)}>
          <Icon name="upload" size={12} /> {t('transactions.importBtn')}
        </button>
        <button className="btn primary sm" onClick={() => setShowNew(true)}>
          <Icon name="plus" size={12} /> {t('transactions.newBtn')}
        </button>
      </Topbar>

      <div className="card filters-bar">
        <div className="filter-tabs">
          {FILTERS.map((f, i) => (
            <button key={f} className={`tab ${i === 0 ? 'active' : ''}`}>
              {f}
              {i === 5 && <span className="filter-dot" />}
            </button>
          ))}
        </div>
        <div className="filter-spacer" />
        <button className="btn ghost sm"><Icon name="filter" size={12} /> {t('transactions.filterBtns.category')}</button>
        <button className="btn ghost sm"><Icon name="account" size={12} /> {t('transactions.filterBtns.account')}</button>
        <button className="btn ghost sm"><Icon name="calendar" size={12} /> April 2026</button>
      </div>

      <div className="coverage-strip">
        <CoverageItem label={t('transactions.coverage.reconciled')}
          bar={total ? matched/total*100 : 0} color="var(--pos)"
          num={<><span className="num">{matched}</span> <span>/ {total}</span></>} />
        <CoverageItem label={t('transactions.coverage.review')}
          bar={total ? review/total*100 : 0} color="var(--warn)"
          num={<><span className="num warn-text">{review}</span> <span>{t('transactions.coverage.pending')}</span></>} />
        <CoverageItem label={t('transactions.coverage.ghost')}
          bar={total ? ghost/total*100 : 0} color="var(--accent-2)"
          num={<><span className="num" style={{ color:'var(--accent-2)' }}>{ghost}</span> <span>{t('transactions.coverage.detected')}</span></>} />
      </div>

      <div className="card tx-card">
        <div className="tx-header">
          <span className="tx-col-d">{t('transactions.columns.date')}</span>
          <span className="tx-col-name">{t('transactions.columns.description')}</span>
          <span className="tx-col-cat">{t('transactions.columns.category')}</span>
          <span className="tx-col-acct">{t('transactions.columns.account')}</span>
          <span className="tx-col-tag">{t('transactions.columns.status')}</span>
          <span className="tx-col-amt">{t('transactions.columns.amount')}</span>
          <span className="tx-col-act"></span>
        </div>
        {loading
          ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>{t('transactions.loading')}</div>
          : transactions.length === 0
            ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>{t('transactions.empty')}</div>
            : transactions.map(tx => <TxRow key={tx.id} t={tx} />)
        }
      </div>

      {showNew && (
        <NewTransactionModal onClose={() => setShowNew(false)} onSave={addTransaction} />
      )}
      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onSave={addTransactions} />
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

function TxRow({ t: tx }) {
  const { t } = useTranslation()
  const isGhost  = tx.status === 'ghost'
  const isReview = tx.status === 'review'
  const d = new Date(tx.occurred_at)
  const dateStr = d.toLocaleDateString('en-CA', { day: 'numeric', month: 'short' })
  const timeStr = d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })

  return (
    <div className={`tx-row ${isGhost ? 'ghost-row-tx' : ''} ${isReview ? 'review-row-tx' : ''}`}>
      <div className="tx-col-d">
        <div className="tx-date">{dateStr}</div>
        <div className="tx-time">{timeStr}</div>
      </div>
      <div className="tx-col-name">
        <div className="tx-merchant">{tx.description}</div>
      </div>
      <div className="tx-col-cat">
        {tx.category && (
          <span className="cat-pill">
            <span className="cat-dot" style={{ background: tx.category.color }} />
            {tx.category.name}
          </span>
        )}
      </div>
      <div className="tx-col-acct">{tx.account?.name}</div>
      <div className="tx-col-tag">
        {tx.tag && (
          <span className={`chip tag-${tx.tag.kind}`}>
            {tx.tag.kind === 'ghost'  && <Icon name="ghost"  size={10} />}
            {tx.tag.kind === 'warn'   && <Icon name="review" size={10} />}
            {tx.tag.kind === 'ok'     && <Icon name="check"  size={10} />}
            {tx.tag.kind === 'income' && <Icon name="income" size={10} />}
            {t('transactions.tags.' + tx.tag.key)}
          </span>
        )}
      </div>
      <div className="tx-col-amt num" style={{ color: tx.amount > 0 ? 'var(--pos)' : 'var(--ink-0)' }}>
        {tx.amount > 0 ? '+' : '−'}${Math.abs(tx.amount).toFixed(2)}
      </div>
      <div className="tx-col-act">
        <button className="icon-btn sm-btn"><Icon name="more" size={14} /></button>
      </div>
    </div>
  )
}
