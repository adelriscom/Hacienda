-- DOWN 014 · Remove per-transaction exchange rate
ALTER TABLE transactions DROP COLUMN IF EXISTS exchange_rate;
