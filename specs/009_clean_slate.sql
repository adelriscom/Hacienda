-- Clean slate: delete all transactions and accounts so each user
-- can reimport their own data while logged into their own session.
-- Categories and budgets are preserved.

DELETE FROM transactions;
DELETE FROM accounts;

-- Verify (should both return 0):
SELECT count(*) AS transactions FROM transactions;
SELECT count(*) AS accounts FROM accounts;
