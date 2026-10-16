-- DOWN 020 · Remove the balance anchor
--
-- Writes the derived balance back into the column before dropping the anchor,
-- so the figure the app has been showing is the figure that remains. Dropping
-- opening_balance without this would silently revert every account to whatever
-- it was last anchored at.
--
-- Safe to re-run.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'accounts' AND column_name = 'opening_balance') THEN
    UPDATE accounts a
       SET balance = round(
             a.opening_balance + COALESCE((
               SELECT sum(t.amount)
                 FROM transactions t
                WHERE t.account_id = a.id
                  AND t.status NOT IN ('ghost', 'duplicate')
             ), 0), 2);
  END IF;
END $$;

DROP INDEX IF EXISTS idx_txn_account_amount;

ALTER TABLE accounts DROP COLUMN IF EXISTS opening_balance;

COMMENT ON COLUMN accounts.balance IS NULL;
