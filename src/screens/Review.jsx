import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Icon from '../components/Icon'
import Topbar from '../components/Topbar'
import { useTransactions } from '../hooks/useTransactions'

function nowMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function fmtMonth(ym) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function ReviewScreen() {
  const { transactions, loading, updateTransaction } = useTransactions()
  const { t } = useTranslation()
  const [filterMonth, setFilterMonth] = useState(nowMonth)

  const monthTxs = useMemo(
    () => transactions.filter(tx => tx.occurred_at.startsWith(filterMonth)),
    [transactions, filterMonth]
  )

  const reviewTxs = useMemo(
    () => monthTxs.filter(tx => tx.status === 'review'),
    [monthTxs]
  )

  const personSplit = useMemo(() => {
    const split = { Alexander: 0, Marcela: 0, Shared: 0 }
    monthTxs.filter(t => t.amount < 0).forEach(t => {
      const p = t.person || 'Shared'
      if (p in split) split[p] += Math.abs(t.amount)
    })
    return split
  }, [monthTxs])

  const totalSpent = personSplit.Alexander + personSplit.Marcela + personSplit.Shared
  const pct = (v) => totalSpent ? Math.round(v / totalSpent * 100) : 0
  const fmtAmt = (n) => '$' + n.toLocaleString('en-CA', { maximumFractionDigits: 0 })

  const statMatch = monthTxs.filter(t => t.status === 'match').length
  const statGhost = monthTxs.filter(t => t.status === 'ghost').length

  return (
    <>
      <Topbar greet={t('review.title')}
        date={t('review.subtitle', { count: reviewTxs.length, month: fmtMonth(filterMonth) })}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button className="btn ghost sm" style={{ padding: '0 8px' }}
            onClick={() => setFilterMonth(m => shiftMonth(m, -1))}>←</button>
          <span style={{ fontSize: 12, color: 'var(--ink-2)', padding: '0 6px', minWidth: 90, textAlign: 'center' }}>
            {fmtMonth(filterMonth)}
          </span>
          <button className="btn ghost sm" style={{ padding: '0 8px' }}
            onClick={() => setFilterMonth(m => shiftMonth(m, 1))}>→</button>
        </div>
      </Topbar>

      <div className="review-grid">
        {/* Review queue */}
        <div className="card">
          <div className="card-h">
            <div>
              <h3>{t('review.queue')}</h3>
              <p>{t('review.queueSub')}</p>
            </div>
            <span className={`chip ${reviewTxs.length > 0 ? 'tag-warn' : 'tag-ok'}`}>
              {reviewTxs.length > 0
                ? <><Icon name="review" size={10} /> {reviewTxs.length} {t('review.pending')}</>
                : <><Icon name="check" size={10} /> {t('review.allClear')}</>
              }
            </span>
          </div>

          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>{t('review.loading')}</div>
          ) : reviewTxs.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>{t('review.empty')}</div>
          ) : reviewTxs.map(tx => (
            <ReviewRow key={tx.id} tx={tx}
              onResolve={()  => updateTransaction(tx.id, { status: 'match' })}
              onGhost={()    => updateTransaction(tx.id, { status: 'ghost' })}
              onDuplicate={() => updateTransaction(tx.id, { status: 'duplicate' })}
              t={t} />
          ))}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Person split */}
          <div className="card shared-card">
            <div className="card-h">
              <div><h3>{t('review.splitTitle')}</h3><p>{fmtMonth(filterMonth)}</p></div>
            </div>
            {totalSpent > 0 ? (
              <>
                <div className="couple-row">
                  <div className="couple">
                    <div className="couple-avatar" style={{ background: 'linear-gradient(135deg,#6366f1,#a855f7)' }}>AL</div>
                    <div className="couple-name">Alexander</div>
                    <div className="couple-pct">{pct(personSplit.Alexander)}%</div>
                    <div className="num couple-amt">{fmtAmt(personSplit.Alexander)}</div>
                  </div>
                  <div className="couple-bar">
                    <div style={{ width: `${pct(personSplit.Alexander)}%`, background: 'linear-gradient(90deg,#6366f1,#a855f7)' }} />
                    <div style={{ width: `${pct(personSplit.Marcela)}%`, background: 'linear-gradient(90deg,#ec4899,#f97316)' }} />
                    <div style={{ width: `${pct(personSplit.Shared)}%`, background: 'var(--bg-3)' }} />
                  </div>
                  <div className="couple">
                    <div className="couple-avatar" style={{ background: 'linear-gradient(135deg,#ec4899,#f97316)' }}>MA</div>
                    <div className="couple-name">Marcela</div>
                    <div className="couple-pct">{pct(personSplit.Marcela)}%</div>
                    <div className="num couple-amt">{fmtAmt(personSplit.Marcela)}</div>
                  </div>
                </div>
                {personSplit.Shared > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center', marginTop: 8 }}>
                    + {fmtAmt(personSplit.Shared)} {t('review.shared')}
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
                {t('review.noData')}
              </div>
            )}
          </div>

          {/* Month stats */}
          <div className="card">
            <div className="card-h"><div><h3>{t('review.monthStats')}</h3><p>{fmtMonth(filterMonth)}</p></div></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
              <StatRow label={t('review.statTotal')}  value={monthTxs.length} />
              <StatRow label={t('review.statReview')} value={reviewTxs.length} tone="warn" />
              <StatRow label={t('review.statGhost')}  value={statGhost}        tone="accent" />
              <StatRow label={t('review.statMatch')}  value={statMatch}        tone="pos" />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function ReviewRow({ tx, onResolve, onGhost, onDuplicate, t }) {
  const [confirming, setConfirming] = useState(null)
  const d = new Date(tx.occurred_at)
  const dateStr = d.toLocaleDateString('en-CA', { day: 'numeric', month: 'short' })
  const fmtAmt = n => '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="review-row">
      <div className="review-sev" style={{ background: 'var(--warn)' }} />
      <div className="review-body">
        <div className="review-h">
          <div className="review-title">{tx.description}</div>
          <span className="num" style={{ fontSize: 13, fontWeight: 600, color: tx.amount > 0 ? 'var(--pos)' : 'var(--ink-0)' }}>
            {tx.amount > 0 ? '+' : '−'}{fmtAmt(tx.amount)}
          </span>
        </div>
        <div className="review-desc">
          {dateStr}
          {tx.category && (
            <> · <span className="cat-pill" style={{ fontSize: 11 }}>
              <span className="cat-dot" style={{ background: tx.category.color }} />{tx.category.name}
            </span></>
          )}
          {tx.account && <> · {tx.account.name}</>}
          {tx.person && tx.person !== 'Shared' && <> · {tx.person}</>}
        </div>
      </div>
      <div className="review-actions">
        {confirming === 'ghost' && (
          <button className="btn sm" style={{ color: 'var(--neg)' }}
            onClick={onGhost}>{t('review.confirmGhost')}</button>
        )}
        {confirming === 'dup' && (
          <button className="btn sm" style={{ color: 'var(--neg)' }}
            onClick={onDuplicate}>{t('review.confirmDup')}</button>
        )}
        {!confirming && (
          <>
            <button className="btn primary sm" onClick={onResolve}>{t('review.resolve')}</button>
            <button className="btn ghost sm"   onClick={() => setConfirming('ghost')}>{t('review.ghost')}</button>
            <button className="btn ghost sm"   onClick={() => setConfirming('dup')}>{t('review.dup')}</button>
          </>
        )}
        {confirming && (
          <button className="btn ghost sm" onClick={() => setConfirming(null)}>✕</button>
        )}
      </div>
    </div>
  )
}

function StatRow({ label, value, tone }) {
  const colorMap = { warn: 'var(--warn)', pos: 'var(--pos)', accent: 'var(--accent-2)' }
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
      <span style={{ color: 'var(--ink-2)' }}>{label}</span>
      <span className="num" style={{ color: tone ? colorMap[tone] : 'var(--ink-0)', fontWeight: 600 }}>{value}</span>
    </div>
  )
}
