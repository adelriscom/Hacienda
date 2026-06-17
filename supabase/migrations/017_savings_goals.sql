-- 017 · Savings goals — track progress toward a target (house, vacation, emergency fund…)
-- A goal can either link to an account (current = account balance) or track a manual
-- current_amount the user updates. monthly_contribution drives the projected-completion date.
-- Run in: Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS savings_goals (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name                 TEXT NOT NULL,
  target_amount        NUMERIC(14, 2) NOT NULL CHECK (target_amount > 0),
  current_amount       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency             TEXT NOT NULL DEFAULT 'CAD',
  target_date          DATE,
  account_id           UUID REFERENCES accounts(id) ON DELETE SET NULL,
  monthly_contribution NUMERIC(14, 2),
  notes                TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first so this migration is safely re-runnable.
DROP POLICY IF EXISTS "savings_goals_select" ON savings_goals;
DROP POLICY IF EXISTS "savings_goals_insert" ON savings_goals;
DROP POLICY IF EXISTS "savings_goals_update" ON savings_goals;
DROP POLICY IF EXISTS "savings_goals_delete" ON savings_goals;

-- Household members can read each other's goals; writes stay own-only.
-- (Same intent as accounts / transactions in migration 007, hardened per the
--  Supabase RLS guidance: explicit TO authenticated, WITH CHECK on UPDATE so a
--  row's user_id can't be reassigned to another user, and (select auth.uid())
--  so the auth call is evaluated once per query instead of per row.)

CREATE POLICY "savings_goals_select"
  ON savings_goals FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR user_id IN (
      SELECT hm2.user_id
      FROM   household_members hm1
      JOIN   household_members hm2 ON hm1.household_id = hm2.household_id
      WHERE  hm1.user_id = (select auth.uid())
    )
  );

CREATE POLICY "savings_goals_insert"
  ON savings_goals FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "savings_goals_update"
  ON savings_goals FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "savings_goals_delete"
  ON savings_goals FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON savings_goals TO authenticated;
