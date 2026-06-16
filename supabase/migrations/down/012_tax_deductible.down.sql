-- DOWN 012 · Remove tax-deductible flags from categories
ALTER TABLE categories
  DROP COLUMN IF EXISTS is_tax_deductible,
  DROP COLUMN IF EXISTS tax_line;
