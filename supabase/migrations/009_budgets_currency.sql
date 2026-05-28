-- 009 · Multi-currency budgets
-- Adds a currency column to budgets and an exchange_rates table for monthly COP→CAD rates.
-- Run in: Supabase Dashboard → SQL Editor

-- ── 1. Add currency to budgets (default CAD so existing rows are unaffected) ──
ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'CAD'
    CHECK (currency IN ('CAD', 'COP'));

-- ── 2. Exchange rates table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exchange_rates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users on delete cascade not null,
  month      date not null,            -- first day of month, e.g. '2026-05-01'
  cop_to_cad numeric(14, 8) not null,  -- e.g. 0.00032 means 1 COP = 0.00032 CAD (≈ 3125 COP/CAD)
  created_at timestamptz not null default now(),
  unique (user_id, month)
);

ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner" ON exchange_rates
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
