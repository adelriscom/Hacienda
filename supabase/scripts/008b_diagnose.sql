-- Diagnostic queries — run each block separately to understand the data state

-- 1. How are transactions split across users right now?
SELECT user_id, count(*) AS tx_count
FROM transactions
GROUP BY user_id;

-- 2. What accounts exist and who owns them?
SELECT id, name, user_id
FROM accounts
ORDER BY user_id, name;

-- 3. How many transactions have a null account_id?
SELECT count(*) AS no_account
FROM transactions
WHERE account_id IS NULL;

-- 4. Sample of transactions still under Alexander (first 10)
SELECT t.description, t.amount, a.name AS account, t.user_id
FROM transactions t
LEFT JOIN accounts a ON a.id = t.account_id
WHERE t.user_id = '22c6bd16-4eaa-41de-a893-509022adffd2'
ORDER BY t.occurred_at DESC
LIMIT 10;
