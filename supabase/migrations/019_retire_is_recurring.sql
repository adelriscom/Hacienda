-- 019 · Retire transactions.is_recurring
--
-- A transaction is part of a recurring series because it is linked to an
-- obligation. `is_recurring` was the pre-018 spelling of the same idea — a
-- boolean with no identity behind it, which is why renaming a description used
-- to split a series in two.
--
-- Nothing writes the column any more. This removes it so there is one answer to
-- "is this recurring", not two that can disagree.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- RUN THIS ONLY AFTER EVERY SERIES HAS BEEN ADOPTED.
--
-- Either run scripts/db/backfill-obligations.mjs --apply, or use "Adopt all" on
-- the Recurring screen. The guard below refuses to drop the column while any
-- flagged transaction is still unlinked, because dropping it then would hide
-- those series with no way to find them again.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Run in: Supabase Dashboard → SQL Editor

DO $$
DECLARE
  orphaned integer;
  sample   text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'transactions' AND column_name = 'is_recurring'
  ) THEN
    RAISE NOTICE 'is_recurring is already gone — nothing to do.';
    RETURN;
  END IF;

  SELECT count(*),
         string_agg(DISTINCT description, ', ' ORDER BY description)
    INTO orphaned, sample
    FROM transactions
   WHERE is_recurring = true
     AND obligation_id IS NULL
     AND status NOT IN ('ghost', 'duplicate');

  IF orphaned > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop is_recurring: % transaction(s) are still flagged but not linked to an obligation (%). Adopt them first — Recurring screen → Adopt all, or scripts/db/backfill-obligations.mjs --apply.',
      orphaned, left(sample, 200);
  END IF;

  EXECUTE 'DROP INDEX IF EXISTS idx_txn_recurring';
  EXECUTE 'ALTER TABLE transactions DROP COLUMN is_recurring';
  RAISE NOTICE 'is_recurring dropped. Recurring series now live in scheduled_payments.';
END $$;
