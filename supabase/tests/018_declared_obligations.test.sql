-- Behavioural checks for 018. Each raises an exception on failure, so
-- ON_ERROR_STOP makes the whole run fail loudly.
\set ALEX    '22c6bd16-4eaa-41de-a893-509022adffd2'
\set MARCELA '2c6ee829-1cd5-46bf-b81b-8b7020621ca7'

-- ── fixtures ────────────────────────────────────────────────────────────────
INSERT INTO accounts (id, user_id, name, type, currency, balance)
VALUES ('aaaaaaaa-0000-4000-8000-000000000001', :'ALEX', 'Scotia', 'checking', 'CAD', 0);

INSERT INTO scheduled_payments
  (id, user_id, account_id, name, amount, type, frequency, anchor_date, person)
VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', :'ALEX',
   'aaaaaaaa-0000-4000-8000-000000000001', 'Mortgage', 2000, 'expense', 'monthly',
   DATE '2026-08-10', 'Alexander');

INSERT INTO transactions
  (id, user_id, account_id, occurred_at, description, amount, type, obligation_id)
VALUES
  ('cccccccc-0000-4000-8000-000000000001', :'ALEX',
   'aaaaaaaa-0000-4000-8000-000000000001', TIMESTAMPTZ '2026-08-10 12:00',
   'Mortgage', -2000, 'expense', 'bbbbbbbb-0000-4000-8000-000000000001');

-- ── 1. next_date is optional now; anchor_date is not ────────────────────────
DO $$
BEGIN
  BEGIN
    INSERT INTO scheduled_payments (user_id, account_id, name, amount, type, frequency, anchor_date)
    VALUES ('22c6bd16-4eaa-41de-a893-509022adffd2',
            'aaaaaaaa-0000-4000-8000-000000000001', 'No next_date', 10, 'expense', 'weekly', DATE '2026-01-01');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL 1a: next_date should be optional — %', SQLERRM;
  END;

  BEGIN
    INSERT INTO scheduled_payments (user_id, account_id, name, amount, type, frequency)
    VALUES ('22c6bd16-4eaa-41de-a893-509022adffd2',
            'aaaaaaaa-0000-4000-8000-000000000001', 'No anchor', 10, 'expense', 'weekly');
    RAISE EXCEPTION 'FAIL 1b: anchor_date should be required';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS 1 · anchor_date required, next_date optional';
END $$;

-- ── 2. The widened frequency vocabulary ─────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['semimonthly','quarterly'] LOOP
    BEGIN
      INSERT INTO scheduled_payments (user_id, account_id, name, amount, type, frequency, anchor_date)
      VALUES ('22c6bd16-4eaa-41de-a893-509022adffd2',
              'aaaaaaaa-0000-4000-8000-000000000001', 'Freq '||f, 10, 'expense', f, DATE '2026-01-01');
    EXCEPTION WHEN check_violation THEN
      RAISE EXCEPTION 'FAIL 2: % should be allowed', f;
    END;
  END LOOP;

  BEGIN
    INSERT INTO scheduled_payments (user_id, account_id, name, amount, type, frequency, anchor_date)
    VALUES ('22c6bd16-4eaa-41de-a893-509022adffd2',
            'aaaaaaaa-0000-4000-8000-000000000001', 'Bogus', 10, 'expense', 'fortnightly', DATE '2026-01-01');
    RAISE EXCEPTION 'FAIL 2b: an unknown frequency should be rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS 2 · semimonthly and quarterly accepted, junk rejected';
END $$;

-- ── 3. Deleting an obligation must never delete financial history ───────────
DO $$
DECLARE kept_amount numeric; kept_link uuid; n int;
BEGIN
  DELETE FROM scheduled_payments WHERE id = 'bbbbbbbb-0000-4000-8000-000000000001';

  SELECT count(*) INTO n FROM transactions WHERE id = 'cccccccc-0000-4000-8000-000000000001';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 3a: deleting a rule deleted the transaction'; END IF;

  SELECT amount, obligation_id INTO kept_amount, kept_link
    FROM transactions WHERE id = 'cccccccc-0000-4000-8000-000000000001';
  IF kept_amount <> -2000 THEN RAISE EXCEPTION 'FAIL 3b: amount changed to %', kept_amount; END IF;
  IF kept_link IS NOT NULL THEN RAISE EXCEPTION 'FAIL 3c: link should be NULL, got %', kept_link; END IF;

  RAISE NOTICE 'PASS 3 · rule deleted, transaction and its amount intact, link nulled';
END $$;

-- ── 4. RLS: household reads, own-only writes ────────────────────────────────
-- Re-create the rule under Alexander for the policy checks.
INSERT INTO scheduled_payments
  (id, user_id, account_id, name, amount, type, frequency, anchor_date)
VALUES
  ('bbbbbbbb-0000-4000-8000-000000000002', :'ALEX',
   'aaaaaaaa-0000-4000-8000-000000000001', 'Mortgage', 2000, 'expense', 'monthly', DATE '2026-08-10');

DO $$ BEGIN
  CREATE ROLE rls_tester LOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT authenticated TO rls_tester;
GRANT USAGE ON SCHEMA public, auth TO rls_tester, authenticated;
GRANT SELECT ON household_members TO rls_tester, authenticated;

SET ROLE rls_tester;

-- Marcela is in Alexander's household, so she can read his obligation…
SET test.uid = '2c6ee829-1cd5-46bf-b81b-8b7020621ca7';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM scheduled_payments WHERE name = 'Mortgage';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 4a: household member should see it, saw % rows', n; END IF;

  -- …but not change it.
  UPDATE scheduled_payments SET amount = 1 WHERE name = 'Mortgage';
  IF FOUND THEN RAISE EXCEPTION 'FAIL 4b: a household member must not be able to edit it'; END IF;

  RAISE NOTICE 'PASS 4 · household member reads but cannot write';
END $$;

-- An outsider sees nothing.
SET test.uid = '00000000-0000-4000-8000-00000000dead';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM scheduled_payments;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 5: outsider saw % rows', n; END IF;
  RAISE NOTICE 'PASS 5 · outsider sees nothing';
END $$;

RESET ROLE;
