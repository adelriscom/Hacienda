import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import Icon from '../components/Icon'
import Topbar from '../components/Topbar'
import NewTransactionModal from '../components/NewTransactionModal'
import ImportModal from '../components/ImportModal'
import { useTransactions } from '../hooks/useTransactions'

function fmtMonth(ym) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function nowMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const selStyle = (active) => ({
  height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid',
  borderColor: active ? 'var(--accent)' : 'var(--border)',
  background: active ? 'rgba(99,102,241,.1)' : 'var(--bg-2)',
  color: active ? 'var(--accent)' : 'var(--ink-2)',
  fontSize: 12, cursor: 'pointer',
})

export default function Transactions({ type }) {
  const { transactions, loading, addTransaction, addTransactions, updateTransaction, deleteTransaction } = useTransactions()
  const [showNew, setShowNew]         = useState(false)
  const [showImport, setShowImport]   = useState(false)
  const [editingTx, setEditingTx]     = useState(null)
  const [activeFilter, setActiveFilter] = useState(type || 'all')
  const [activePerson, setActivePerson] = useState('all')
  const [filterMonth, setFilterMonth]   = useState(nowMonth)
  const [filterCat, setFilterCat]       = useState('')
  const [filterAcct, setFilterAcct]     = useState('')
  const { t }    = useTranslation()
  const location = useLocation()

  useEffect(() => { setActiveFilter(type || 'all') }, [type])

  // Handle navigation from global search: open edit modal for the selected transaction
  useEffect(() => {
    const { openTxId, month } = location.state || {}
    if (!openTxId || !transactions.length) return
    if (month) setFilterMonth(month)
    const tx = transactions.find(t => t.id === openTxId)
    if (tx) {
      setEditingTx(tx)
      window.history.replaceState({}, '') // clear state so refresh doesn't re-open
    }
  }, [location.state, transactions])

  const FILTER_DEFS = [
    { key: 'all',      label: t('transactions.filters.all'),       test: () => true },
    { key: 'income',   label: t('transactions.filters.income'),    test: tx => tx.type === 'income' },
    { key: 'expense',  label: t('transactions.filters.expenses'),  test: tx => tx.type === 'expense' },
    { key: 'transfer', label: t('transactions.filters.transfers'), test: tx => tx.type === 'transfer' },
    { key: 'review',   label: t('transactions.filters.review'),    test: tx => tx.status === 'review' },
  ]

  const PERSONS = ['all', 'Alexander', 'Marcela', 'Shared']

  const uniqueCats = useMemo(() => {
    const seen = new Map()
    transactions.forEach(tx => {
      if (tx.category && tx.category_id && !seen.has(tx.category_id))
        seen.set(tx.category_id, { id: tx.category_id, name: tx.category.name })
    })
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [transactions])

  const uniqueAccts = useMemo(() => {
    const seen = new Map()
    transactions.forEach(tx => {
      if (tx.account && tx.account_id && !seen.has(tx.account_id))
        seen.set(tx.account_id, { id: tx.account_id, name: tx.account.name })
    })
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [transactions])

  const activeDef = FILTER_DEFS.find(f => f.key === activeFilter) || FILTER_DEFS[0]
  const filtered = transactions
    .filter(tx => tx.occurred_at.startsWith(filterMonth))
    .filter(activeDef.test)
    .filter(tx => activePerson === 'all' || tx.person === activePerson)
    .filter(tx => !filterCat  || tx.category_id === filterCat)
    .filter(tx => !filterAcct || tx.account_id  === filterAcct)

  const ghost   = filtered.filter(tx => tx.status === 'ghost').length
  const review  = filtered.filter(tx => tx.status === 'review').length
  const matched = filtered.filter(tx => tx.status === 'match').length
  const total   = filtered.length

  const titleMap = { expense: t('transactions.filters.expenses'), income: t('transactions.filters.income') }
  const pageTitle = titleMap[type] || t('transactions.title')

  return (
    <>
      <Topbar greet={pageTitle}
        date={t('transactions.subtitle', { month: fmtMonth(filterMonth), total, review })}>
        <button className="btn ghost sm" onClick={() => setShowImport(true)}>
          <Icon name="upload" size={12} /> {t('transactions.importBtn')}
        </button>
        <button className="btn primary sm" onClick={() => setShowNew(true)}>
          <Icon name="plus" size={12} /> {t('transactions.newBtn')}
        </button>
      </Topbar>

      <div className="card filters-bar" style={{ flexWrap: 'wrap', rowGap: 8 }}>
        <div className="filter-tabs">
          {FILTER_DEFS.map(f => (
            <button key={f.key} className={`tab ${activeFilter === f.key ? 'active' : ''}`}
              onClick={() => setActiveFilter(f.key)}>
              {f.label}
              {f.key === 'review' && review > 0 && <span className="filter-dot" />}
            </button>
          ))}
        </div>
        <div className="filter-spacer" />

        {/* Category filter */}
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={selStyle(!!filterCat)}>
          <option value="">{t('transactions.filterBtns.category')}</option>
          {uniqueCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {/* Account filter */}
        <select value={filterAcct} onChange={e => setFilterAcct(e.target.value)} style={selStyle(!!filterAcct)}>
          <option value="">{t('transactions.filterBtns.account')}</option>
          {uniqueAccts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        {/* Month navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button className="btn ghost sm" style={{ padding: '0 8px' }}
            onClick={() => setFilterMonth(m => shiftMonth(m, -1))}>←</button>
          <span style={{ fontSize: 12, color: 'var(--ink-2)', padding: '0 6px', minWidth: 90, textAlign: 'center' }}>
            {fmtMonth(filterMonth)}
          </span>
          <button className="btn ghost sm" style={{ padding: '0 8px' }}
            onClick={() => setFilterMonth(m => shiftMonth(m, 1))}>→</button>
        </div>

        {/* Person filter */}
        <div style={{ width: '100%', display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--ink-3)', marginRight: 4 }}>{t('newTx.person')}:</span>
          {PERSONS.map(p => (
            <button key={p}
              className={`tab ${activePerson === p ? 'active' : ''}`}
              style={{ fontSize: 11, padding: '3px 10px' }}
              onClick={() => setActivePerson(p)}>
              {p === 'all' ? t('transactions.filters.all') : p === 'Shared' ? t('person.shared') : p}
            </button>
          ))}
        </div>
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
          : filtered.length === 0
            ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>{t('transactions.empty')}</div>
            : filtered.map(tx => <TxRow key={tx.id} t={tx} onEdit={setEditingTx} />)
        }
      </div>

      {showNew && (
        <NewTransactionModal onClose={() => setShowNew(false)} onSave={addTransaction} />
      )}
      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onSave={addTransactions} />
      )}
      {editingTx && (
        <NewTransactionModal
          transaction={editingTx}
          onClose={() => setEditingTx(null)}
          onUpdate={updateTransaction}
          onDelete={deleteTransaction}
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

function TxRow({ t: tx, onEdit }) {
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
        <button className="icon-btn sm-btn" onClick={() => onEdit(tx)}><Icon name="more" size={14} /></button>
      </div>
    </div>
  )
}
