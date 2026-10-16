-- Realistic recurring data for exercising scripts/db/backfill-obligations.mjs.
-- Dates are relative to 2026-10-15 so each series lands on a distinct outcome.
\set ALEX    '22c6bd16-4eaa-41de-a893-509022adffd2'
\set MARCELA '2c6ee829-1cd5-46bf-b81b-8b7020621ca7'

INSERT INTO accounts (id, user_id, name, type, currency, balance) VALUES
  ('a0000000-0000-4000-8000-000000000001', :'ALEX',    'Scotia Chequing', 'checking', 'CAD', 0),
  ('a0000000-0000-4000-8000-000000000002', :'MARCELA', 'Bancolombia',     'checking', 'COP', 0);

INSERT INTO categories (id, user_id, name, color, icon) VALUES
  ('c0000000-0000-4000-8000-000000000001', :'ALEX', 'Housing', '#6366f1', 'home');

-- Fixed monthly, three payments, still active.
INSERT INTO transactions (user_id, account_id, category_id, occurred_at, description, amount, type, person, is_recurring) VALUES
  (:'ALEX', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', '2026-08-10T12:00Z', 'Mortgage', -2000, 'expense', 'Alexander', true),
  (:'ALEX', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', '2026-09-10T12:00Z', 'Mortgage', -2000, 'expense', 'Alexander', true),
  (:'ALEX', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', '2026-10-10T12:00Z', 'Mortgage', -2000, 'expense', 'Alexander', true);

-- Genuinely variable: hydro swings well beyond the 10% band.
INSERT INTO transactions (user_id, account_id, occurred_at, description, amount, type, person, is_recurring) VALUES
  (:'ALEX', 'a0000000-0000-4000-8000-000000000001', '2026-08-05T12:00Z', 'Hydro', -90,  'expense', 'Shared', true),
  (:'ALEX', 'a0000000-0000-4000-8000-000000000001', '2026-09-05T12:00Z', 'Hydro', -140, 'expense', 'Shared', true),
  (:'ALEX', 'a0000000-0000-4000-8000-000000000001', '2026-10-05T12:00Z', 'Hydro', -205, 'expense', 'Shared', true);

-- Cancelled in April: no payment for many cycles, must come back as ended.
INSERT INTO transactions (user_id, account_id, occurred_at, description, amount, type, person, is_recurring) VALUES
  (:'ALEX', 'a0000000-0000-4000-8000-000000000001', '2026-02-20T12:00Z', 'Old Gym', -45, 'expense', 'Alexander', true),
  (:'ALEX', 'a0000000-0000-4000-8000-000000000001', '2026-03-20T12:00Z', 'Old Gym', -45, 'expense', 'Alexander', true),
  (:'ALEX', 'a0000000-0000-4000-8000-000000000001', '2026-04-20T12:00Z', 'Old Gym', -45, 'expense', 'Alexander', true);

-- Weekly cadence, so the frequency mapping is exercised beyond monthly.
INSERT INTO transactions (user_id, account_id, occurred_at, description, amount, type, person, is_recurring) VALUES
  (:'ALEX', 'a0000000-0000-4000-8000-000000000001', '2026-09-28T12:00Z', 'Groceries', -150, 'expense', 'Shared', true),
  (:'ALEX', 'a0000000-0000-4000-8000-000000000001', '2026-10-05T12:00Z', 'Groceries', -150, 'expense', 'Shared', true),
  (:'ALEX', 'a0000000-0000-4000-8000-000000000001', '2026-10-12T12:00Z', 'Groceries', -150, 'expense', 'Shared', true);

-- Recurring income.
INSERT INTO transactions (user_id, account_id, occurred_at, description, amount, type, person, is_recurring) VALUES
  (:'ALEX', 'a0000000-0000-4000-8000-000000000001', '2026-08-30T12:00Z', 'Salary', 5000, 'income', 'Alexander', true),
  (:'ALEX', 'a0000000-0000-4000-8000-000000000001', '2026-09-30T12:00Z', 'Salary', 5000, 'income', 'Alexander', true);

-- Marcela's own series, same description as nobody else's — but it proves the
-- backfill keeps owners apart and carries COP accounts through.
INSERT INTO transactions (user_id, account_id, occurred_at, description, amount, type, person, is_recurring) VALUES
  (:'MARCELA', 'a0000000-0000-4000-8000-000000000002', '2026-08-20T12:00Z', 'Celular', -400000, 'expense', 'Marcela', true),
  (:'MARCELA', 'a0000000-0000-4000-8000-000000000002', '2026-09-20T12:00Z', 'Celular', -400000, 'expense', 'Marcela', true);

-- Both members pay their own "Internet": two series, never merged.
INSERT INTO transactions (user_id, account_id, occurred_at, description, amount, type, person, is_recurring) VALUES
  (:'ALEX',    'a0000000-0000-4000-8000-000000000001', '2026-09-12T12:00Z', 'Internet', -80, 'expense', 'Alexander', true),
  (:'ALEX',    'a0000000-0000-4000-8000-000000000001', '2026-10-12T12:00Z', 'Internet', -80, 'expense', 'Alexander', true),
  (:'MARCELA', 'a0000000-0000-4000-8000-000000000002', '2026-09-15T12:00Z', 'Internet', -60, 'expense', 'Marcela',   true),
  (:'MARCELA', 'a0000000-0000-4000-8000-000000000002', '2026-10-15T12:00Z', 'Internet', -60, 'expense', 'Marcela',   true);

-- Not recurring, and a ghost that happens to be flagged: neither may be touched.
INSERT INTO transactions (user_id, account_id, occurred_at, description, amount, type, is_recurring, status) VALUES
  (:'ALEX', 'a0000000-0000-4000-8000-000000000001', '2026-10-01T12:00Z', 'Coffee',      -6,  'expense', false, 'match'),
  (:'ALEX', 'a0000000-0000-4000-8000-000000000001', '2026-10-02T12:00Z', 'Ghost charge', -99, 'expense', true,  'ghost');
