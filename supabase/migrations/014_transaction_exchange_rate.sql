-- 014 · Per-transaction exchange rate
-- Stores the exact FX rate used at transaction time for foreign-currency accounts.
-- Nullable: existing transactions fall back to the monthly rate in exchange_rates table.
-- Run in: Supabase Dashboard → SQL Editor

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC;
