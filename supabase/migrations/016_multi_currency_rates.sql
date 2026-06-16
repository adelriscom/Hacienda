-- 016 · Generalize exchange rates to any currency
-- Base currency is CAD. Each row stores one currency's rate to base for a month:
--   amount_in_base = amount * rate_to_base
-- Replaces the COP-only single `cop_to_cad` column.
-- Run in: Supabase Dashboard → SQL Editor

-- ── 1. New generic columns ──────────────────────────────────────────────────
ALTER TABLE exchange_rates
  ADD COLUMN IF NOT EXISTS currency_code text,
  ADD COLUMN IF NOT EXISTS rate_to_base  numeric(20, 10);

-- ── 2. Backfill existing rows (they were all COP → CAD) ──────────────────────
UPDATE exchange_rates
   SET currency_code = 'COP',
       rate_to_base  = cop_to_cad
 WHERE currency_code IS NULL;

-- ── 3. Legacy column becomes optional (new currencies won't populate it) ─────
ALTER TABLE exchange_rates ALTER COLUMN cop_to_cad DROP NOT NULL;

-- ── 4. Enforce the new columns ──────────────────────────────────────────────
ALTER TABLE exchange_rates ALTER COLUMN currency_code SET NOT NULL;
ALTER TABLE exchange_rates ALTER COLUMN rate_to_base  SET NOT NULL;

-- ── 5. Swap uniqueness (user, month) → (user, month, currency) ───────────────
-- Drop the old (user_id, month) unique constraint regardless of its name.
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
    FROM pg_constraint
   WHERE conrelid = 'exchange_rates'::regclass
     AND contype = 'u'
     AND pg_get_constraintdef(oid) ILIKE '%(user_id, month)%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE exchange_rates DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE exchange_rates
  ADD CONSTRAINT exchange_rates_user_month_currency_key
  UNIQUE (user_id, month, currency_code);

-- ── 6. Relax budgets.currency to any ISO-4217-style code ─────────────────────
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
    FROM pg_constraint
   WHERE conrelid = 'budgets'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%currency%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE budgets DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE budgets
  ADD CONSTRAINT budgets_currency_check CHECK (currency ~ '^[A-Z]{3}$');
