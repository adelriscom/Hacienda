-- DOWN 008 · Remove annual interest rate from accounts
ALTER TABLE accounts DROP COLUMN IF EXISTS interest_rate;
