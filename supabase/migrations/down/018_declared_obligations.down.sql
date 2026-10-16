-- DOWN 018 · Revert declared obligations
--
-- Drops only what 018 added. No transaction's money, date, description or
-- category is touched — obligation_id is a link column, so removing it leaves
-- every transaction exactly as it was.
--
-- Note: scheduled_payments rows created by the phase-2 backfill are NOT deleted
-- here. Dropping the link column orphans them harmlessly; delete them explicitly
-- if that is what you want.

-- ── 1. The link ──────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_txn_obligation;
ALTER TABLE transactions DROP COLUMN IF EXISTS obligation_id;

-- ── 2. Projection columns ────────────────────────────────────────────────────
-- next_date regains NOT NULL, so fill any row that has none before restoring it.
-- Guarded on anchor_date still existing, so this file is safe to re-run.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'scheduled_payments' AND column_name = 'anchor_date') THEN
    UPDATE scheduled_payments SET next_date = anchor_date WHERE next_date IS NULL;
  END IF;
END $$;

-- On a re-run anchor_date is already gone, so fall back to created_at. Every row
-- keeps a valid next_date and none is deleted.
UPDATE scheduled_payments SET next_date = created_at::date WHERE next_date IS NULL;

ALTER TABLE scheduled_payments ALTER COLUMN next_date SET NOT NULL;

DROP INDEX IF EXISTS idx_sched_active;

ALTER TABLE scheduled_payments
  DROP COLUMN IF EXISTS anchor_date,
  DROP COLUMN IF EXISTS ends_on,
  DROP COLUMN IF EXISTS person,
  DROP COLUMN IF EXISTS is_variable;

-- ── 3. Frequency vocabulary ──────────────────────────────────────────────────
-- Narrowing the CHECK would fail on any row already using semimonthly or
-- quarterly, so fold those back to their nearest original value first.
UPDATE scheduled_payments SET frequency = 'monthly' WHERE frequency = 'semimonthly';
UPDATE scheduled_payments SET frequency = 'yearly'  WHERE frequency = 'quarterly';

ALTER TABLE scheduled_payments DROP CONSTRAINT IF EXISTS scheduled_payments_frequency_check;
ALTER TABLE scheduled_payments
  ADD CONSTRAINT scheduled_payments_frequency_check
  CHECK (frequency IN ('once','weekly','biweekly','monthly','yearly'));

-- ── 4. Row Level Security ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "scheduled_payments_select" ON scheduled_payments;
DROP POLICY IF EXISTS "scheduled_payments_insert" ON scheduled_payments;
DROP POLICY IF EXISTS "scheduled_payments_update" ON scheduled_payments;
DROP POLICY IF EXISTS "scheduled_payments_delete" ON scheduled_payments;
DROP POLICY IF EXISTS "owner"                     ON scheduled_payments;

CREATE POLICY "owner" ON scheduled_payments
  FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
