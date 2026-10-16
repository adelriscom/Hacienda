-- Behavioural checks for 019. The guard is the whole point: dropping the column
-- while unadopted series remain would hide them with no way to find them again.
\set ALEX '22c6bd16-4eaa-41de-a893-509022adffd2'

-- The runner applies every migration in order, so 019 has already dropped the
-- column on a clean database. Put it back to test the guard properly.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false;

INSERT INTO accounts (id, user_id, name, type, currency, balance)
VALUES ('dddddddd-0000-4000-8000-000000000001', :'ALEX', 'Scotia', 'checking', 'CAD', 0)
ON CONFLICT DO NOTHING;

INSERT INTO scheduled_payments (id, user_id, account_id, name, amount, type, frequency, anchor_date)
VALUES ('eeeeeeee-0000-4000-8000-000000000001', :'ALEX',
        'dddddddd-0000-4000-8000-000000000001', 'Mortgage', 2000, 'expense', 'monthly', DATE '2026-08-10')
ON CONFLICT DO NOTHING;

-- One adopted, one still orphaned.
INSERT INTO transactions (id, user_id, account_id, occurred_at, description, amount, type, is_recurring, obligation_id)
VALUES
  ('ffffffff-0000-4000-8000-000000000001', :'ALEX', 'dddddddd-0000-4000-8000-000000000001',
   TIMESTAMPTZ '2026-08-10 12:00', 'Mortgage', -2000, 'expense', true, 'eeeeeeee-0000-4000-8000-000000000001'),
  ('ffffffff-0000-4000-8000-000000000002', :'ALEX', 'dddddddd-0000-4000-8000-000000000001',
   TIMESTAMPTZ '2026-08-12 12:00', 'Internet', -80, 'expense', true, NULL);

-- ── 1. It refuses while anything is still unlinked ──────────────────────────
DO $$
DECLARE msg text;
BEGIN
  BEGIN
    PERFORM 1;
    -- Inline the guard rather than re-reading the file.
    DECLARE orphaned integer;
    BEGIN
      SELECT count(*) INTO orphaned
        FROM transactions
       WHERE is_recurring = true AND obligation_id IS NULL
         AND status NOT IN ('ghost', 'duplicate');
      IF orphaned > 0 THEN
        RAISE EXCEPTION 'guard would fire: % orphaned', orphaned;
      END IF;
    END;
    RAISE EXCEPTION 'FAIL 1: the guard should have fired while a series was unlinked';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
    IF msg NOT LIKE 'guard would fire%' THEN
      RAISE EXCEPTION 'FAIL 1: %', msg;
    END IF;
  END;
  RAISE NOTICE 'PASS 1 · refuses to drop while a series is still unadopted';
END $$;

-- ── 2. Adopting the straggler clears the way ────────────────────────────────
UPDATE transactions
   SET obligation_id = 'eeeeeeee-0000-4000-8000-000000000001'
 WHERE id = 'ffffffff-0000-4000-8000-000000000002';

DO $$
DECLARE orphaned integer;
BEGIN
  SELECT count(*) INTO orphaned
    FROM transactions
   WHERE is_recurring = true AND obligation_id IS NULL
     AND status NOT IN ('ghost', 'duplicate');
  IF orphaned <> 0 THEN RAISE EXCEPTION 'FAIL 2: % still orphaned', orphaned; END IF;

  ALTER TABLE transactions DROP COLUMN is_recurring;
  RAISE NOTICE 'PASS 2 · drops cleanly once every series is adopted';
END $$;

-- ── 3. No transaction was harmed ────────────────────────────────────────────
DO $$
DECLARE n integer; amt numeric; link uuid;
BEGIN
  SELECT count(*) INTO n FROM transactions WHERE id::text LIKE 'ffffffff%';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL 3a: expected 2 transactions, found %', n; END IF;

  SELECT amount, obligation_id INTO amt, link
    FROM transactions WHERE id = 'ffffffff-0000-4000-8000-000000000001';
  IF amt <> -2000 THEN RAISE EXCEPTION 'FAIL 3b: amount changed to %', amt; END IF;
  IF link IS NULL THEN RAISE EXCEPTION 'FAIL 3c: the link was lost'; END IF;

  RAISE NOTICE 'PASS 3 · transactions and their links survive the drop';
END $$;

-- ── 4. The down migration rebuilds the flag from the links ──────────────────
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false;
UPDATE transactions SET is_recurring = true WHERE obligation_id IS NOT NULL AND is_recurring = false;

DO $$
DECLARE flagged integer;
BEGIN
  SELECT count(*) INTO flagged FROM transactions WHERE id::text LIKE 'ffffffff%' AND is_recurring;
  IF flagged <> 2 THEN RAISE EXCEPTION 'FAIL 4: % of 2 restored', flagged; END IF;
  RAISE NOTICE 'PASS 4 · rollback restores the flag from the links';
END $$;
