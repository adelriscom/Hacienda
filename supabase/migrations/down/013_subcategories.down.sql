-- DOWN 013 · Remove subcategories
-- WARNING: child categories (rows with a non-null parent_id) will lose their nesting.
DROP INDEX IF EXISTS categories_parent_id_idx;
ALTER TABLE categories DROP COLUMN IF EXISTS parent_id;
