-- Migration 013: Subcategories
-- Adds parent_id FK to categories so categories can be nested one level deep.
-- Rule: only leaf categories (no children) are selectable on transactions/budgets.

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES categories(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS categories_parent_id_idx ON categories(parent_id);
