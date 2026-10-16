-- Behavioural checks for 020. The migration's central promise is that it
-- changes no visible number: the derived balance on day one must equal the
-- typed one, account by account.
\set ALEX '22c6bd16-4eaa-41de-a893-509022adffd2'

-- The runner applies every migration before the suites, so 020 has already run.
-- Start from a clean slate to exercise the back-computation properly.
DELETE FROM transactions WHERE description LIKE 'bal-test%';
DELETE FROM accounts     WHERE name LIKE 'bal-test%';

INSERT INTO accounts (id, user_id, name, type, currency, balance, opening_balance) VALUES
  ('b0000000-0000-4000-8000-000000000001', :'ALEX', 'bal-test chequing', 'checking', 'CAD', 4750, 0),
  ('b0000000-0000-4000-8000-000000000002', :'ALEX', 'bal-test card',     'credit',   'CAD', -1200, 0),
  ('b0000000-0000-4000-8000-000000000003', :'ALEX', 'bal-test empty',    'savings',  'CAD', 250, 0);

INSERT INTO transactions (user_id, account_id, occurred_at, description, amount, type, status) VALUES
  (:'ALEX', 'b0000000-0000-4000-8000-000000000001', now(), 'bal-test rent',   -1200, 'expense', 'match'),
  (:'ALEX', 'b0000000-0000-4000-8000-000000000001', now(), 'bal-test pay',     3000, 'income',  'match'),
  (:'ALEX', 'b0000000-0000-4000-8000-000000000001', now(), 'bal-test flagged',  -50, 'expense', 'review'),
  (:'ALEX', 'b0000000-0000-4000-8000-000000000001', now(), 'bal-test ghost',   -500, 'expense', 'ghost'),
  (:'ALEX', 'b0000000-0000-4000-8000-000000000001', now(), 'bal-test dupe',    -500, 'expense', 'duplicate'),
  (:'ALEX', 'b0000000-0000-4000-8000-000000000002', now(), 'bal-test swipe',   -340, 'expense', 'match'),
  (:'ALEX', 'b0000000-0000-4000-8000-000000000002', now(), 'bal-test payment',  500, 'income',  'match');

-- Re-run the migration's back-computation over these rows.
UPDATE accounts a
   SET opening_balance = round(
         a.balance - COALESCE((
           SELECT sum(t.amount) FROM transactions t
            WHERE t.account_id = a.id AND t.status NOT IN ('ghost', 'duplicate')), 0), 2)
 WHERE a.name LIKE 'bal-test%';

-- ── 1. The derived balance equals the typed one, account by account ─────────
DO $$
DECLARE r record; derived numeric;
BEGIN
  FOR r IN SELECT * FROM accounts WHERE name LIKE 'bal-test%' LOOP
    SELECT r.opening_balance + COALESCE((
             SELECT sum(t.amount) FROM transactions t
              WHERE t.account_id = r.id AND t.status NOT IN ('ghost','duplicate')), 0)
      INTO derived;
    IF derived <> r.balance THEN
      RAISE EXCEPTION 'FAIL 1: % derives % but was typed as %', r.name, derived, r.balance;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS 1 · day one derives exactly what was typed';
END $$;

-- ── 2. Ghosts and duplicates are kept out of the anchor ─────────────────────
DO $$
DECLARE opening numeric;
BEGIN
  SELECT opening_balance INTO opening FROM accounts
   WHERE id = 'b0000000-0000-4000-8000-000000000001';
  -- 4750 typed, real movement is -1200 + 3000 - 50 = 1750, so the anchor is 3000.
  -- Counting the 1,000 of ghost+duplicate would have made it 4000.
  IF opening <> 3000 THEN
    RAISE EXCEPTION 'FAIL 2: anchor is %, expected 3000 (ghost/duplicate leaked in?)', opening;
  END IF;
  RAISE NOTICE 'PASS 2 · ghost and duplicate rows stay out of the anchor';
END $$;

-- ── 3. An account with no transactions anchors at its stated balance ────────
DO $$
DECLARE opening numeric;
BEGIN
  SELECT opening_balance INTO opening FROM accounts
   WHERE id = 'b0000000-0000-4000-8000-000000000003';
  IF opening <> 250 THEN RAISE EXCEPTION 'FAIL 3: anchor is %, expected 250', opening; END IF;
  RAISE NOTICE 'PASS 3 · an untouched account anchors at its stated balance';
END $$;

-- ── 4. A new transaction moves the balance, which is the whole point ────────
DO $$
DECLARE before_bal numeric; after_bal numeric; opening numeric;
BEGIN
  SELECT opening_balance INTO opening FROM accounts
   WHERE id = 'b0000000-0000-4000-8000-000000000001';
  SELECT opening + COALESCE(sum(t.amount), 0) INTO before_bal FROM transactions t
   WHERE t.account_id = 'b0000000-0000-4000-8000-000000000001'
     AND t.status NOT IN ('ghost','duplicate');

  INSERT INTO transactions (user_id, account_id, occurred_at, description, amount, type, status)
  VALUES ('22c6bd16-4eaa-41de-a893-509022adffd2', 'b0000000-0000-4000-8000-000000000001',
          now(), 'bal-test new', -200, 'expense', 'match');

  SELECT opening + COALESCE(sum(t.amount), 0) INTO after_bal FROM transactions t
   WHERE t.account_id = 'b0000000-0000-4000-8000-000000000001'
     AND t.status NOT IN ('ghost','duplicate');

  IF after_bal <> before_bal - 200 THEN
    RAISE EXCEPTION 'FAIL 4: balance went % -> %, expected a 200 drop', before_bal, after_bal;
  END IF;
  RAISE NOTICE 'PASS 4 · importing a transaction moves the balance';
END $$;

-- ── 5. Re-anchoring absorbs a gap without touching a transaction ────────────
DO $$
DECLARE movement numeric; new_opening numeric; derived numeric; txn_sum_before numeric;
BEGIN
  SELECT COALESCE(sum(t.amount), 0) INTO movement FROM transactions t
   WHERE t.account_id = 'b0000000-0000-4000-8000-000000000001'
     AND t.status NOT IN ('ghost','duplicate');
  txn_sum_before := movement;

  -- The bank says 2,900; our history is short by whatever the difference is.
  new_opening := round(2900 - movement, 2);
  UPDATE accounts SET opening_balance = new_opening
   WHERE id = 'b0000000-0000-4000-8000-000000000001';

  SELECT new_opening + COALESCE(sum(t.amount), 0) INTO derived FROM transactions t
   WHERE t.account_id = 'b0000000-0000-4000-8000-000000000001'
     AND t.status NOT IN ('ghost','duplicate');
  IF derived <> 2900 THEN
    RAISE EXCEPTION 'FAIL 5a: after re-anchoring the balance is %, expected 2900', derived;
  END IF;

  SELECT COALESCE(sum(t.amount), 0) INTO movement FROM transactions t
   WHERE t.account_id = 'b0000000-0000-4000-8000-000000000001'
     AND t.status NOT IN ('ghost','duplicate');
  IF movement <> txn_sum_before THEN
    RAISE EXCEPTION 'FAIL 5b: re-anchoring changed the transactions';
  END IF;

  RAISE NOTICE 'PASS 5 · re-anchoring moves the anchor and nothing else';
END $$;

-- ── 6. The down migration leaves the figure the app was showing ─────────────
DO $$
DECLARE derived numeric; restored numeric;
BEGIN
  SELECT a.opening_balance + COALESCE((
           SELECT sum(t.amount) FROM transactions t
            WHERE t.account_id = a.id AND t.status NOT IN ('ghost','duplicate')), 0)
    INTO derived
    FROM accounts a WHERE a.id = 'b0000000-0000-4000-8000-000000000001';

  -- What down/020 does before dropping the column.
  UPDATE accounts a
     SET balance = round(a.opening_balance + COALESCE((
           SELECT sum(t.amount) FROM transactions t
            WHERE t.account_id = a.id AND t.status NOT IN ('ghost','duplicate')), 0), 2)
   WHERE a.id = 'b0000000-0000-4000-8000-000000000001';

  SELECT balance INTO restored FROM accounts
   WHERE id = 'b0000000-0000-4000-8000-000000000001';
  IF restored <> derived THEN
    RAISE EXCEPTION 'FAIL 6: rollback stored % but the app was showing %', restored, derived;
  END IF;
  RAISE NOTICE 'PASS 6 · rollback keeps the balance the app was showing';
END $$;

DELETE FROM transactions WHERE description LIKE 'bal-test%';
DELETE FROM accounts     WHERE name LIKE 'bal-test%';
