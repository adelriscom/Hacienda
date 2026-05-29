-- 011 · Household invite flow
-- Adds household_invites table + RPC functions for creating/joining households via 8-char codes.
-- Run in: Supabase Dashboard → SQL Editor

-- ── 1. household_invites table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS household_invites (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        references households(id) on delete cascade not null,
  code         text        not null unique,
  created_by   uuid        references auth.users(id) on delete cascade not null,
  expires_at   timestamptz not null default now() + interval '7 days',
  used_by      uuid        references auth.users(id) on delete set null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);

ALTER TABLE household_invites ENABLE ROW LEVEL SECURITY;

-- Household members can read/write their own household's invites
CREATE POLICY "invite_household_member" ON household_invites
  FOR ALL
  USING    (household_id = get_my_household_id())
  WITH CHECK (household_id = get_my_household_id());

GRANT SELECT, INSERT, UPDATE ON household_invites TO authenticated;

-- ── 2. create_household_invite() — generate / refresh invite code ─────────────

CREATE OR REPLACE FUNCTION create_household_invite()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id uuid;
  v_code         text := '';
  v_chars        text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i              int;
BEGIN
  v_household_id := get_my_household_id();
  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Not a member of any household';
  END IF;

  -- Expire any active unused codes for this household first
  UPDATE household_invites
  SET expires_at = now()
  WHERE household_id = v_household_id
    AND used_by IS NULL
    AND expires_at > now();

  -- Generate an 8-char code from unambiguous characters
  FOR i IN 1..8 LOOP
    v_code := v_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
  END LOOP;

  INSERT INTO household_invites (household_id, code, created_by)
  VALUES (v_household_id, v_code, auth.uid());

  RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION create_household_invite() TO authenticated;

-- ── 3. join_household_by_code() — redeem an invite code ──────────────────────

CREATE OR REPLACE FUNCTION join_household_by_code(
  invite_code text,
  member_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite household_invites%ROWTYPE;
  v_name   text;
BEGIN
  SELECT * INTO v_invite
  FROM household_invites
  WHERE code       = upper(trim(invite_code))
    AND used_by    IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or expired invite code');
  END IF;

  IF EXISTS (
    SELECT 1 FROM household_members
    WHERE household_id = v_invite.household_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('error', 'You are already a member of this household');
  END IF;

  v_name := coalesce(
    nullif(trim(member_name), ''),
    split_part((SELECT email FROM auth.users WHERE id = auth.uid()), '@', 1)
  );

  INSERT INTO household_members (household_id, user_id, display_name, role)
  VALUES (v_invite.household_id, auth.uid(), v_name, 'member');

  UPDATE household_invites
  SET used_by = auth.uid(), used_at = now()
  WHERE id = v_invite.id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION join_household_by_code(text, text) TO authenticated;

-- ── 4. create_my_household() — bootstrap a new household ─────────────────────

CREATE OR REPLACE FUNCTION create_my_household(
  household_name text,
  display_name   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id uuid;
  v_name         text;
BEGIN
  IF get_my_household_id() IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'You are already in a household');
  END IF;

  v_name := coalesce(
    nullif(trim(display_name), ''),
    split_part((SELECT email FROM auth.users WHERE id = auth.uid()), '@', 1)
  );

  INSERT INTO households (name) VALUES (trim(household_name)) RETURNING id INTO v_household_id;

  INSERT INTO household_members (household_id, user_id, display_name, role)
  VALUES (v_household_id, auth.uid(), v_name, 'owner');

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION create_my_household(text, text) TO authenticated;
