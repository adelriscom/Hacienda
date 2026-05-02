-- Root cause: the account name ILIKE '%marcela%' condition in 008 step 1
-- didn't match, so accounts stayed under Alexander and the transaction
-- JOIN in subsequent steps found nothing.
-- Fix: join on account name directly, bypassing ownership.

-- ── 1. Check current account ownership (run first to diagnose) ───────────────
SELECT id, name, user_id FROM accounts ORDER BY name;

-- ── 2. Reassign accounts whose name contains 'marcela' (any owner) ───────────
UPDATE accounts
SET user_id = '2c6ee829-1cd5-46bf-b81b-8b7020621ca7'
WHERE name ILIKE '%marcela%';

-- ── 3. Reassign Alexander's transactions linked to any 'marcela' account ─────
UPDATE transactions t
SET user_id = '2c6ee829-1cd5-46bf-b81b-8b7020621ca7'
FROM accounts a
WHERE t.account_id = a.id
  AND t.user_id    = '22c6bd16-4eaa-41de-a893-509022adffd2'
  AND a.name ILIKE '%marcela%';

-- ── 4. Verify final split ────────────────────────────────────────────────────
SELECT user_id, count(*) AS tx_count FROM transactions GROUP BY user_id;
