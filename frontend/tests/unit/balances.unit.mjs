// Unit tests for derived account balances (src/lib/balances.js).
// Pure logic, no Supabase — run with:  node tests/unit/balances.unit.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sumByAccount, deriveBalance, withDerivedBalances, anchorTo,
  driftFromStored, countsTowardBalance,
} from '../../src/lib/balances.js'

const acct = (o = {}) => ({
  id: 'a1', name: 'Scotia', currency: 'CAD', type: 'checking',
  balance: 1000, opening_balance: 1000, ...o,
})
const txn = (o = {}) => ({
  id: 't' + Math.random().toString(36).slice(2, 7),
  account_id: 'a1', amount: -100, status: 'match', ...o,
})

// ── What moves a balance ────────────────────────────────────────────────────

test('a balance is its anchor plus everything that happened on the account', () => {
  const [a] = withDerivedBalances(
    [acct({ opening_balance: 3200 })],
    [txn({ amount: -120 }), txn({ amount: -80 }), txn({ amount: 2000 })])
  assert.equal(a.balance, 5000)
  assert.equal(a._opening, 3200)
  assert.equal(a._movement, 1800)
  assert.equal(a._txnCount, 3)
})

test('ghost charges and duplicates never move a balance', () => {
  assert.equal(countsTowardBalance({ status: 'match' }), true)
  assert.equal(countsTowardBalance({ status: 'review' }), true)   // real, just flagged
  assert.equal(countsTowardBalance({ status: 'ghost' }), false)
  assert.equal(countsTowardBalance({ status: 'duplicate' }), false)

  const [a] = withDerivedBalances([acct({ opening_balance: 1000 })], [
    txn({ amount: -100, status: 'match' }),
    txn({ amount: -500, status: 'ghost' }),
    txn({ amount: -500, status: 'duplicate' }),
    txn({ amount: -50,  status: 'review' }),
  ])
  assert.equal(a.balance, 850)
  assert.equal(a._txnCount, 2)
})

test('a transfer nets to zero across the pair without being special-cased', () => {
  // Both legs carry their own account_id and opposite signs.
  const accounts = [acct({ id: 'chq', opening_balance: 1000 }),
                    acct({ id: 'sav', opening_balance: 500 })]
  const transfer = [
    txn({ account_id: 'chq', amount: -300, type: 'transfer', transfer_group_id: 'g1' }),
    txn({ account_id: 'sav', amount:  300, type: 'transfer', transfer_group_id: 'g1' }),
  ]
  const [chq, sav] = withDerivedBalances(accounts, transfer)
  assert.equal(chq.balance, 700)
  assert.equal(sav.balance, 800)
  assert.equal(chq.balance + sav.balance, 1500)   // household total unchanged
})

test('transactions with no account touch nothing', () => {
  const totals = sumByAccount([txn({ account_id: null, amount: -999 }), txn({ amount: -10 })])
  assert.equal(totals.size, 1)
  assert.equal(totals.get('a1').total, -10)
})

test('an account with no transactions sits at its anchor', () => {
  const [a] = withDerivedBalances([acct({ opening_balance: 250 })], [])
  assert.equal(a.balance, 250)
  assert.equal(a._txnCount, 0)
})

test('a credit card goes further negative as it is used', () => {
  const [card] = withDerivedBalances(
    [acct({ id: 'cc', type: 'credit', opening_balance: -1200 })],
    [txn({ account_id: 'cc', amount: -340 }), txn({ account_id: 'cc', amount: 500 })])
  assert.equal(card.balance, -1040)   // spent 340, paid 500
})

// ── Before the migration lands ──────────────────────────────────────────────

test('without an anchor the stored balance is left exactly as it was', () => {
  // Migration 020 adds opening_balance. Until it runs the column is absent, and
  // deriving would add transactions to a figure that already includes them.
  const stored = { id: 'a1', name: 'Scotia', balance: 4750 }
  const [a] = withDerivedBalances([stored], [txn({ amount: -100 })])
  assert.equal(a.balance, 4750)
  assert.equal(a._derived, undefined)
  assert.deepEqual(a, stored)
})

test('an anchor of zero still derives', () => {
  // 0 is a real anchor; only null/undefined means "no column".
  const [a] = withDerivedBalances([acct({ balance: 0, opening_balance: 0 })],
                                  [txn({ amount: -75 })])
  assert.equal(a.balance, -75)
  assert.equal(a._derived, true)
})

// ── Re-anchoring ────────────────────────────────────────────────────────────

test('re-anchoring makes the derived balance equal what the bank says', () => {
  const [a] = withDerivedBalances([acct({ opening_balance: 3200 })],
                                  [txn({ amount: -120 }), txn({ amount: -80 })])
  assert.equal(a.balance, 3000)

  // The bank says 2,950 — 50 is missing from our history.
  const newOpening = anchorTo(2950, a)
  assert.equal(newOpening, 3150)

  const [after] = withDerivedBalances(
    [acct({ opening_balance: newOpening })],
    [txn({ amount: -120 }), txn({ amount: -80 })])
  assert.equal(after.balance, 2950)
})

test('re-anchoring moves the anchor, never a transaction', () => {
  const transactions = [txn({ id: 'keep-1', amount: -120 }), txn({ id: 'keep-2', amount: -80 })]
  const before = JSON.stringify(transactions)
  const [a] = withDerivedBalances([acct({ opening_balance: 3200 })], transactions)
  anchorTo(999, a)
  assert.equal(JSON.stringify(transactions), before)
})

test('anchoring an account with no movement is just the stated figure', () => {
  const [a] = withDerivedBalances([acct({ opening_balance: 100 })], [])
  assert.equal(anchorTo(4750, a), 4750)
})

test('anchoring rounds to cents rather than carrying float noise', () => {
  const [a] = withDerivedBalances([acct({ opening_balance: 0 })],
                                  [txn({ amount: -0.1 }), txn({ amount: -0.2 })])
  assert.equal(anchorTo(100, a), 100.3)
})

// ── Drift ───────────────────────────────────────────────────────────────────

test('drift is the gap between the derived balance and the last anchor point', () => {
  const [a] = withDerivedBalances([acct({ balance: 1000, opening_balance: 1000 })],
                                  [txn({ amount: -250 })])
  assert.equal(a.balance, 750)
  assert.equal(driftFromStored(a), -250)
})

test('a freshly migrated account shows no drift', () => {
  // Migration 020 back-computes opening_balance so the derived figure matches
  // the stored one exactly on day one.
  const stored = 4750, movement = -862.40
  const [a] = withDerivedBalances(
    [acct({ balance: stored, opening_balance: Number((stored - movement).toFixed(2)) })],
    [txn({ amount: movement })])
  assert.equal(a.balance, stored)
  assert.equal(driftFromStored(a), 0)
})

test('an underived account reports no drift at all', () => {
  assert.equal(driftFromStored({ id: 'a1', balance: 10 }), null)
})
