-- Add annual interest rate (% APR) to accounts
-- Used to estimate monthly interest cost (credit) or return (savings/investment)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS interest_rate NUMERIC(5,2) DEFAULT 0;
