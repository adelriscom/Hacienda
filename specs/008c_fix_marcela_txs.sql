-- Step 2 of 008 re-run: now that accounts are correctly owned by Marcela,
-- reassign any of Alexander's transactions that point to Marcela's accounts.

-- Preview how many rows will move (run this first):
SELECT count(*)
FROM transactions t
JOIN accounts a ON a.id = t.account_id
WHERE t.user_id = '22c6bd16-4eaa-41de-a893-509022adffd2'
  AND a.user_id = '2c6ee829-1cd5-46bf-b81b-8b7020621ca7';

-- Then run the fix:
UPDATE transactions
SET user_id = '2c6ee829-1cd5-46bf-b81b-8b7020621ca7'
WHERE user_id = '22c6bd16-4eaa-41de-a893-509022adffd2'
  AND account_id IN (
    SELECT id FROM accounts
    WHERE user_id = '2c6ee829-1cd5-46bf-b81b-8b7020621ca7'
  );

-- Verify final split:
SELECT user_id, count(*) AS tx_count FROM transactions GROUP BY user_id;
