-- DOWN 003 · Remove person column from transactions
-- WARNING: drops the per-transaction owner tag (Alexander/Marcela/Shared).
ALTER TABLE transactions DROP COLUMN IF EXISTS person;
