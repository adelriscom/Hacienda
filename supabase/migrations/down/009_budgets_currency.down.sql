-- DOWN 009 · Remove multi-currency budgets
-- WARNING: drops exchange_rates and all its data.
DROP TABLE IF EXISTS exchange_rates;
ALTER TABLE budgets DROP COLUMN IF EXISTS currency;
