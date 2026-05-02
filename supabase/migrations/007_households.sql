-- ── 1. Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS households (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS household_members (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE NOT NULL,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  display_name TEXT NOT NULL,
  role         TEXT DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (household_id, user_id)
);

-- ── 2. RLS on new tables ─────────────────────────────────────────────────────

ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own household"
  ON households FOR SELECT
  USING (id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Members read household roster"
  ON household_members FOR SELECT
  USING (household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  ));

GRANT SELECT ON households        TO authenticated;
GRANT SELECT ON household_members TO authenticated;

-- ── 3. Rebuild transactions RLS (SELECT open to household, writes own-only) ──

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies
            WHERE tablename = 'transactions' AND schemaname = 'public') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON transactions', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "transactions_select"
  ON transactions FOR SELECT
  USING (
    user_id = auth.uid()
    OR user_id IN (
      SELECT hm2.user_id
      FROM   household_members hm1
      JOIN   household_members hm2 ON hm1.household_id = hm2.household_id
      WHERE  hm1.user_id = auth.uid()
    )
  );

CREATE POLICY "transactions_insert"
  ON transactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "transactions_update"
  ON transactions FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "transactions_delete"
  ON transactions FOR DELETE
  USING (user_id = auth.uid());

-- ── 4. Rebuild accounts RLS (same pattern) ───────────────────────────────────

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies
            WHERE tablename = 'accounts' AND schemaname = 'public') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON accounts', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "accounts_select"
  ON accounts FOR SELECT
  USING (
    user_id = auth.uid()
    OR user_id IN (
      SELECT hm2.user_id
      FROM   household_members hm1
      JOIN   household_members hm2 ON hm1.household_id = hm2.household_id
      WHERE  hm1.user_id = auth.uid()
    )
  );

CREATE POLICY "accounts_insert"
  ON accounts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "accounts_update"
  ON accounts FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "accounts_delete"
  ON accounts FOR DELETE
  USING (user_id = auth.uid());

-- ── 5. Seed the Delrisco-Falla household ────────────────────────────────────

WITH h AS (
  INSERT INTO households (name) VALUES ('Delrisco-Falla') RETURNING id
)
INSERT INTO household_members (household_id, user_id, display_name, role)
SELECT h.id, '22c6bd16-4eaa-41de-a893-509022adffd2'::uuid, 'Alexander', 'owner' FROM h
UNION ALL
SELECT h.id, '2c6ee829-1cd5-46bf-b81b-8b7020621ca7'::uuid, 'Marcela',   'member' FROM h;
