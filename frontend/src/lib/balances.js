// Account balances, derived rather than typed.
//
// `accounts.balance` used to be a number entered by hand and never updated, so
// every figure built on it — net worth, a debt's "% paid off", a goal's current
// saved — drifted the moment a statement was imported.
//
// A balance is now anchored and accumulated:
//
//     balance = opening_balance + Σ (transactions on the account)
//
// `opening_balance` is what the account held before the first recorded
// transaction. It only moves when you re-anchor it — telling the app what the
// bank actually says — which is the one honest answer to an incomplete import
// history. Everything after that accrues on its own.

// Ghost charges and duplicates aren't money that moved, so they can't move a
// balance. `review` is real money that merely needs attention.
const EXCLUDED_STATUSES = new Set(['ghost', 'duplicate'])

export const countsTowardBalance = (t) =>
  Boolean(t) && !EXCLUDED_STATUSES.has(t.status)

// Sums transactions per account id. Both legs of a transfer carry their own
// account_id with opposite signs, so a transfer nets to zero across the pair
// without being special-cased.
export function sumByAccount(transactions) {
  const totals = new Map()
  ;(transactions || []).forEach(t => {
    if (!t.account_id || !countsTowardBalance(t)) return
    const prev = totals.get(t.account_id) || { total: 0, count: 0 }
    prev.total += Number(t.amount) || 0
    prev.count += 1
    totals.set(t.account_id, prev)
  })
  return totals
}

// Returns the account with `balance` derived, plus the pieces the UI needs to
// explain where that number came from.
//
// An account with no `opening_balance` is left exactly as it was: the column
// arrives in migration 020, and until then the stored balance is all there is.
// Deriving in that state would add the transactions to a figure that already
// includes them.
export function deriveBalance(account, movement) {
  if (!account || account.opening_balance == null) return account

  const opening = Number(account.opening_balance) || 0
  const { total = 0, count = 0 } = movement || {}

  return {
    ...account,
    balance: opening + total,
    // What the column still holds, so a migration can be sanity-checked and the
    // UI can report drift against the last anchor.
    _storedBalance: Number(account.balance) || 0,
    _opening: opening,
    _movement: total,
    _txnCount: count,
    _derived: true,
  }
}

export function withDerivedBalances(accounts, transactions) {
  const totals = sumByAccount(transactions)
  return (accounts || []).map(a => deriveBalance(a, totals.get(a.id)))
}

// What `opening_balance` must become for the derived balance to equal what the
// bank says. This is the whole re-anchoring mechanism: the user states a truth
// and the anchor absorbs the difference, leaving every transaction untouched.
export function anchorTo(actualBalance, account) {
  const movement = account?._derived ? account._movement : 0
  return Number((Number(actualBalance) - movement).toFixed(2))
}

// How far the derived balance has moved since it was last anchored — the gap a
// user would reconcile against a statement.
export function driftFromStored(account) {
  if (!account?._derived) return null
  return Number((account.balance - account._storedBalance).toFixed(2))
}
