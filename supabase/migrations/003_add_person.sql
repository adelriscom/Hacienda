-- Add person column to transactions
-- Run in Supabase SQL Editor

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS person text
    CHECK (person IN ('Alexander', 'Marcela', 'Shared'));
