-- DOWN 019 · Restore transactions.is_recurring
--
-- Brings the column back and rebuilds it from the links, which are the truth:
-- a transaction attached to an obligation is recurring. Series that were never
-- adopted cannot be recovered — they stopped existing as a concept the moment
-- the column went, which is exactly why 019 refuses to run until every one of
-- them has been adopted.
--
-- Safe to re-run.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false;

UPDATE transactions
   SET is_recurring = true
 WHERE obligation_id IS NOT NULL
   AND is_recurring = false;
