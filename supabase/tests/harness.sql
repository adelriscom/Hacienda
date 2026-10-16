-- Throwaway harness: the Supabase-provided pieces that 001 assumes exist, so the
-- real migrations can be applied verbatim against a plain Postgres cluster.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

-- Stand-in for Supabase's auth.uid(); the session sets it so policies can be
-- exercised with a real value.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid;
$$;

DO $$ BEGIN
  CREATE ROLE authenticated;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Migration 007 seeds the Delrisco-Falla household against two real user ids.
-- Creating them here lets every migration apply in order, unmodified.
INSERT INTO auth.users (id) VALUES
  ('22c6bd16-4eaa-41de-a893-509022adffd2'),
  ('2c6ee829-1cd5-46bf-b81b-8b7020621ca7')
ON CONFLICT DO NOTHING;
