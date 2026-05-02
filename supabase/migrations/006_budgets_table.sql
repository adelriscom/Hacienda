-- Run this in Supabase SQL editor

CREATE TABLE IF NOT EXISTS budgets (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category_id UUID    REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
  month       VARCHAR(7) NOT NULL,   -- format: 'YYYY-MM', e.g. '2026-04'
  amount      NUMERIC NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, category_id, month)
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own budgets"
  ON budgets FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON budgets TO authenticated;
