-- 010 · Financial obligations — payment tracking fields on accounts
-- Adds monthly_payment, original_amount, and payment_due_day to accounts
-- so credit cards and loans can be tracked in the Obligations screen.
-- Run in: Supabase Dashboard → SQL Editor

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS monthly_payment  numeric(14, 2),
  ADD COLUMN IF NOT EXISTS original_amount  numeric(14, 2),
  ADD COLUMN IF NOT EXISTS payment_due_day  integer CHECK (payment_due_day BETWEEN 1 AND 31);
