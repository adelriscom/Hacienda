-- Fix: Marcela's data was imported while logged in as Alexander,
-- so all her accounts and transactions have user_id = Alexander's UUID.
-- This reassigns them to Marcela's UUID based on account name.

-- Alexander : 22c6bd16-4eaa-41de-a893-509022adffd2
-- Marcela   : 2c6ee829-1cd5-46bf-b81b-8b7020621ca7

-- ── 1. Reassign Marcela's accounts ───────────────────────────────────────────

UPDATE accounts
SET user_id = '2c6ee829-1cd5-46bf-b81b-8b7020621ca7'
WHERE user_id = '22c6bd16-4eaa-41de-a893-509022adffd2'
  AND name ILIKE '%marcela%';

-- ── 2. Reassign transactions that belong to Marcela's accounts ───────────────
-- (runs after step 1 so the IN subquery finds the freshly-reassigned accounts)

UPDATE transactions
SET user_id = '2c6ee829-1cd5-46bf-b81b-8b7020621ca7'
WHERE user_id = '22c6bd16-4eaa-41de-a893-509022adffd2'
  AND account_id IN (
    SELECT id FROM accounts
    WHERE user_id = '2c6ee829-1cd5-46bf-b81b-8b7020621ca7'
  );

-- ── 3. Safety check — run these SELECTs to verify the split ─────────────────

-- Should show only Alexander's accounts
-- SELECT name FROM accounts WHERE user_id = '22c6bd16-4eaa-41de-a893-509022adffd2' ORDER BY name;

-- Should show only Marcela's accounts
-- SELECT name FROM accounts WHERE user_id = '2c6ee829-1cd5-46bf-b81b-8b7020621ca7' ORDER BY name;

-- Should show counts per user after the split
-- SELECT user_id, count(*) FROM transactions GROUP BY user_id;
