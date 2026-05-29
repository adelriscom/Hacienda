-- Migration 012: Tax deductible flag on categories
-- Adds is_tax_deductible and tax_line to categories so users can flag
-- categories for T1 tax filing (medical, donations, home office, childcare, etc.)

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS is_tax_deductible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_line          text;
