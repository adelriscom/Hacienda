-- Fix: recursive RLS on household_members caused all household queries to return null.
-- Solution: SECURITY DEFINER function that bypasses RLS for the household_id lookup.

-- ── 1. Helper function ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_my_household_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT household_id FROM household_members WHERE user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_my_household_id() TO authenticated;

-- ── 2. Fix household_members policy (was recursively querying itself) ────────

DROP POLICY IF EXISTS "Members read household roster" ON household_members;
CREATE POLICY "Members read household roster"
  ON household_members FOR SELECT
  USING (household_id = get_my_household_id());

-- ── 3. Fix households policy (was querying household_members which was blocked) ─

DROP POLICY IF EXISTS "Members read own household" ON households;
CREATE POLICY "Members read own household"
  ON households FOR SELECT
  USING (id = get_my_household_id());

-- ── 4. Fix transactions SELECT ───────────────────────────────────────────────

DROP POLICY IF EXISTS "transactions_select" ON transactions;
CREATE POLICY "transactions_select"
  ON transactions FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      get_my_household_id() IS NOT NULL
      AND user_id IN (
        SELECT user_id FROM household_members
        WHERE household_id = get_my_household_id()
      )
    )
  );

-- ── 5. Fix accounts SELECT ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "accounts_select" ON accounts;
CREATE POLICY "accounts_select"
  ON accounts FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      get_my_household_id() IS NOT NULL
      AND user_id IN (
        SELECT user_id FROM household_members
        WHERE household_id = get_my_household_id()
      )
    )
  );
