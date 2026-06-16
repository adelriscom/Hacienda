-- DOWN 007 / 007b · Tear down household sharing, restore single-user RLS
-- WARNING: drops households + household_members (and their data) and reverts
-- transactions/accounts to owner-only access. Run 011 down FIRST if applied
-- (household_invites references households).

-- 1. Drop household-aware policies
DROP POLICY IF EXISTS "transactions_select" ON transactions;
DROP POLICY IF EXISTS "transactions_insert" ON transactions;
DROP POLICY IF EXISTS "transactions_update" ON transactions;
DROP POLICY IF EXISTS "transactions_delete" ON transactions;
DROP POLICY IF EXISTS "accounts_select" ON accounts;
DROP POLICY IF EXISTS "accounts_insert" ON accounts;
DROP POLICY IF EXISTS "accounts_update" ON accounts;
DROP POLICY IF EXISTS "accounts_delete" ON accounts;

-- 2. Restore the original single-owner policies (from 001_schema.sql)
CREATE POLICY "owner" ON transactions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner" ON accounts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. Drop helper function and household tables
DROP FUNCTION IF EXISTS get_my_household_id();
DROP TABLE IF EXISTS household_members;
DROP TABLE IF EXISTS households;
