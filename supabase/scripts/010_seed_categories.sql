-- 010 · Optimized category structure — migrate existing data
--
-- WHAT THIS DOES:
--   1. Saves a (transaction → new category name) snapshot BEFORE touching anything
--   2. Updates categories RLS to household-sharing (both users see the same list)
--   3. Deletes all old categories  →  transactions.category_id becomes NULL
--                                 →  budgets rows are deleted (ON DELETE CASCADE)
--                                 →  scheduled_payments.category_id becomes NULL
--   4. Inserts 12 new clean categories under Alexander's user_id
--   5. Re-assigns every transaction to its new category using the snapshot
--
-- OLD → NEW mapping
--   Household            → Housing
--   Car                  → Transportation
--   Food                 → Groceries
--   Pets                 → Pets
--   Entertainment        → Entertainment
--   Extra_expenses       → Extra / One-time
--   Investment_accounts  → Investments & Savings
--   Personal_Marcela     → Personal — Marcela
--   Colombia_Marcela     → Colombia — Marcela
--   Taxes_Legal_Marcela  → Taxes & Legal
--   Personal_Alexander   → Personal — Alexander
--   Colombia_Alexander   → Colombia — Alexander
--   Taxes_Legal_Alexander→ Taxes & Legal
--   Income               → (NULL — income needs no category)
--
-- Run in: Supabase Dashboard → SQL Editor

DO $$
DECLARE
  alex uuid := '22c6bd16-4eaa-41de-a893-509022adffd2';
  v_remapped   integer;
  v_uncatted   integer;
BEGIN

  -- ── 0. Snapshot: record what new category each transaction should get ───────
  --    Do this BEFORE any deletions so we have the full picture.
  DROP TABLE IF EXISTS _tx_remap;
  CREATE TEMP TABLE _tx_remap AS
  SELECT
    t.id AS tx_id,
    CASE oc.name
      WHEN 'Household'             THEN 'Housing'
      WHEN 'Car'                   THEN 'Transportation'
      WHEN 'Food'                  THEN 'Groceries'
      WHEN 'Pets'                  THEN 'Pets'
      WHEN 'Entertainment'         THEN 'Entertainment'
      WHEN 'Extra_expenses'        THEN 'Extra / One-time'
      WHEN 'Investment_accounts'   THEN 'Investments & Savings'
      WHEN 'Personal_Marcela'      THEN 'Personal — Marcela'
      WHEN 'Colombia_Marcela'      THEN 'Colombia — Marcela'
      WHEN 'Taxes_Legal_Marcela'   THEN 'Taxes & Legal'
      WHEN 'Personal_Alexander'    THEN 'Personal — Alexander'
      WHEN 'Colombia_Alexander'    THEN 'Colombia — Alexander'
      WHEN 'Taxes_Legal_Alexander' THEN 'Taxes & Legal'
      ELSE NULL  -- Income and anything unknown → stays NULL
    END AS new_cat_name
  FROM transactions t
  JOIN categories oc ON oc.id = t.category_id
  WHERE t.category_id IS NOT NULL;

  RAISE NOTICE 'Snapshot: % transactions with a category', (SELECT COUNT(*) FROM _tx_remap);

  -- ── 1. Update categories RLS to household-sharing ───────────────────────────
  DROP POLICY IF EXISTS "owner"              ON categories;
  DROP POLICY IF EXISTS "categories_select"  ON categories;
  DROP POLICY IF EXISTS "categories_insert"  ON categories;
  DROP POLICY IF EXISTS "categories_update"  ON categories;
  DROP POLICY IF EXISTS "categories_delete"  ON categories;

  CREATE POLICY "categories_select" ON categories FOR SELECT USING (
    user_id = auth.uid()
    OR (
      get_my_household_id() IS NOT NULL
      AND user_id IN (
        SELECT user_id FROM household_members
        WHERE household_id = get_my_household_id()
      )
    )
  );
  CREATE POLICY "categories_insert" ON categories FOR INSERT WITH CHECK (user_id = auth.uid());
  CREATE POLICY "categories_update" ON categories FOR UPDATE USING (user_id = auth.uid());
  CREATE POLICY "categories_delete" ON categories FOR DELETE USING (user_id = auth.uid());

  -- ── 2. Delete all old categories ─────────────────────────────────────────────
  --    transactions.category_id  → NULL  (ON DELETE SET NULL)
  --    budgets rows              → gone  (ON DELETE CASCADE)
  --    scheduled_payments.cat_id → NULL  (ON DELETE SET NULL)
  DELETE FROM categories;

  -- ── 3. Insert 12 new clean categories ────────────────────────────────────────
  INSERT INTO categories (user_id, name, color, icon) VALUES
    (alex, 'Housing',               '#3b82f6', 'wallet'),
    (alex, 'Transportation',        '#f97316', 'card'),
    (alex, 'Groceries',             '#22c55e', 'cash'),
    (alex, 'Pets',                  '#f59e0b', 'sparkle'),
    (alex, 'Personal — Marcela',    '#a855f7', 'sparkle'),
    (alex, 'Personal — Alexander',  '#6366f1', 'sparkle'),
    (alex, 'Colombia — Marcela',    '#ef4444', 'doc'),
    (alex, 'Colombia — Alexander',  '#f43f5e', 'doc'),
    (alex, 'Investments & Savings', '#14b8a6', 'btc'),
    (alex, 'Entertainment',         '#ec4899', 'sparkle'),
    (alex, 'Taxes & Legal',         '#6b7280', 'doc'),
    (alex, 'Extra / One-time',      '#64748b', 'more');

  -- ── 4. Re-assign transactions using the snapshot ──────────────────────────────
  UPDATE transactions AS t
  SET category_id = nc.id
  FROM _tx_remap AS r
  JOIN categories AS nc ON nc.name = r.new_cat_name AND nc.user_id = alex
  WHERE t.id = r.tx_id
    AND r.new_cat_name IS NOT NULL;

  GET DIAGNOSTICS v_remapped = ROW_COUNT;

  SELECT COUNT(*) INTO v_uncatted
  FROM transactions WHERE category_id IS NULL;

  RAISE NOTICE 'Re-assigned: % transactions', v_remapped;
  RAISE NOTICE 'Still uncategorized: % transactions (Income rows + previously uncategorized)', v_uncatted;

  DROP TABLE _tx_remap;

END $$;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT name, color FROM categories ORDER BY name;

SELECT
  COALESCE(c.name, '(uncategorized)') AS category,
  COUNT(*) AS tx_count
FROM transactions t
LEFT JOIN categories c ON c.id = t.category_id
GROUP BY c.name
ORDER BY tx_count DESC;
