-- 018 · Declared obligations — make scheduled_payments usable as real records
--
-- Until now a recurring series existed only as a GROUP BY over transactions
-- sharing a description. That left two problems nothing could patch: a bill you
-- have never paid cannot be scheduled, and renaming one transaction silently
-- splits a series in two.
--
-- scheduled_payments has been in the schema since 001 and read by nothing. This
-- migration makes it fit for the job: a stable id, a fixed projection anchor, a
-- household-visible RLS policy, and a link from the transactions that settle it.
--
-- No data is written and no transaction is touched. Run in: Supabase Dashboard → SQL Editor

-- ── 1. Frequency vocabulary ──────────────────────────────────────────────────
-- The app's detectFrequency() also produces semi-monthly and quarterly. Without
-- this the CHECK would reject them, or callers would coerce them to monthly and
-- quietly schedule the wrong dates.
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
    FROM pg_constraint
   WHERE conrelid = 'scheduled_payments'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%frequency%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE scheduled_payments DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE scheduled_payments
  ADD CONSTRAINT scheduled_payments_frequency_check
  CHECK (frequency IN ('once','weekly','biweekly','semimonthly','monthly','quarterly','yearly'));

-- ── 2. Projection columns ────────────────────────────────────────────────────
-- anchor_date is the first due date and never moves. Occurrences are projected
-- from it, which is what keeps the payment period independent of payment
-- status: an unpaid October bill stays filed under October.
--
-- next_date was the opposite idea — a cursor advanced as payments landed. It
-- stays for backward compatibility but is no longer the source of truth, so it
-- loses its NOT NULL.
ALTER TABLE scheduled_payments
  ADD COLUMN IF NOT EXISTS anchor_date date,
  ADD COLUMN IF NOT EXISTS ends_on     date,
  -- Mirrors transactions.person for the Shared label. Deliberately without the
  -- hardcoded name CHECK that migration 003 put on transactions.person — that
  -- list breaks for any household other than the one it was written for.
  ADD COLUMN IF NOT EXISTS person      text,
  -- Hydro is never the same twice. On a variable obligation the amount is an
  -- estimate and any payment inside the cycle settles it, instead of leaving a
  -- phantom balance every month the bill lands low.
  ADD COLUMN IF NOT EXISTS is_variable boolean NOT NULL DEFAULT false;

UPDATE scheduled_payments SET anchor_date = next_date WHERE anchor_date IS NULL;

ALTER TABLE scheduled_payments ALTER COLUMN anchor_date SET NOT NULL;
ALTER TABLE scheduled_payments ALTER COLUMN next_date   DROP NOT NULL;

COMMENT ON COLUMN scheduled_payments.anchor_date IS
  'First due date. Fixed — occurrences are projected from it.';
COMMENT ON COLUMN scheduled_payments.next_date IS
  'Deprecated. Superseded by anchor_date; occurrences are derived, not stored.';
COMMENT ON COLUMN scheduled_payments.ends_on IS
  'Last due date, for a series that has ended. Stops projection without hiding history.';
COMMENT ON COLUMN scheduled_payments.is_variable IS
  'Amount is an estimate; any payment within the cycle settles the occurrence.';

-- ── 3. The link ──────────────────────────────────────────────────────────────
-- ON DELETE SET NULL: deleting a rule must never delete financial history. The
-- transaction survives, unlinked, exactly as it was.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS obligation_id uuid
    REFERENCES scheduled_payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_txn_obligation
  ON transactions (obligation_id)
  WHERE obligation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sched_active
  ON scheduled_payments (user_id, is_active);

-- ── 4. Row Level Security ────────────────────────────────────────────────────
-- 001 left this own-only, so in Family mode a member could not see another's
-- obligations and the Dashboard would show nothing. Same shape as transactions,
-- accounts and savings_goals: household members read each other, writes stay
-- own-only. Hardened per the Supabase guidance used in 017 — explicit
-- TO authenticated, WITH CHECK on UPDATE so a row's owner can't be reassigned,
-- and (select auth.uid()) so the auth call is evaluated once per query.

DROP POLICY IF EXISTS "owner"                     ON scheduled_payments;
DROP POLICY IF EXISTS "scheduled_payments_select" ON scheduled_payments;
DROP POLICY IF EXISTS "scheduled_payments_insert" ON scheduled_payments;
DROP POLICY IF EXISTS "scheduled_payments_update" ON scheduled_payments;
DROP POLICY IF EXISTS "scheduled_payments_delete" ON scheduled_payments;

CREATE POLICY "scheduled_payments_select"
  ON scheduled_payments FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR user_id IN (
      SELECT hm2.user_id
      FROM   household_members hm1
      JOIN   household_members hm2 ON hm1.household_id = hm2.household_id
      WHERE  hm1.user_id = (select auth.uid())
    )
  );

CREATE POLICY "scheduled_payments_insert"
  ON scheduled_payments FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "scheduled_payments_update"
  ON scheduled_payments FOR UPDATE
  TO authenticated
  USING      (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "scheduled_payments_delete"
  ON scheduled_payments FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON scheduled_payments TO authenticated;
