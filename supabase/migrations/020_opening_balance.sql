-- 020 · Anchor account balances so they stop going stale
--
-- `accounts.balance` has been a number typed by hand and never updated. Nothing
-- recomputes it — no trigger, no client-side reduce — so every figure built on
-- it drifts the moment a statement is imported: net worth on Accounts, a debt's
-- "% paid off" and payoff projection on Obligations, a goal's current saved.
--
-- A balance becomes anchored and accumulated instead:
--
--     balance = opening_balance + Σ (transactions on the account)
--
-- opening_balance is what the account held before its first recorded
-- transaction, and it only moves when someone re-anchors it against a real
-- statement. Everything after that accrues on its own.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- This changes no visible number. opening_balance is back-computed from the
-- balance already stored, so the derived figure on day one equals the typed one
-- exactly, account by account. The improvement only accrues going forward.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Run in: Supabase Dashboard → SQL Editor

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS opening_balance numeric(14, 2);

-- Back-compute: whatever the balance says now, minus everything the
-- transactions already account for. Ghost charges and duplicates are excluded
-- because they are not money that moved — the same rule the app applies.
UPDATE accounts a
   SET opening_balance = round(
         a.balance - COALESCE((
           SELECT sum(t.amount)
             FROM transactions t
            WHERE t.account_id = a.id
              AND t.status NOT IN ('ghost', 'duplicate')
         ), 0), 2)
 WHERE a.opening_balance IS NULL;

-- Every account has an anchor from here on, so the app can tell "no column yet"
-- (derive nothing) from "anchored at zero" (derive normally).
ALTER TABLE accounts ALTER COLUMN opening_balance SET DEFAULT 0;
ALTER TABLE accounts ALTER COLUMN opening_balance SET NOT NULL;

COMMENT ON COLUMN accounts.opening_balance IS
  'What the account held before its first recorded transaction. The balance is '
  'this plus the sum of the account''s transactions; re-anchor it against a '
  'statement rather than editing a balance directly.';
COMMENT ON COLUMN accounts.balance IS
  'Last anchored balance. Superseded by opening_balance + transactions — kept so '
  'drift since the last anchor can be reported.';

-- Summing an account's transactions is now on the read path for Accounts,
-- Goals and Obligations.
CREATE INDEX IF NOT EXISTS idx_txn_account_amount
  ON transactions (account_id)
  WHERE status NOT IN ('ghost', 'duplicate');
