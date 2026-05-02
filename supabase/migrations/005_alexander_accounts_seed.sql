-- Alexander's accounts
-- Step 1: get your UUID
--   SELECT id FROM auth.users;
-- Step 2: replace YOUR-UUID-HERE below and run

INSERT INTO accounts (name, currency, type, is_active, user_id) VALUES
  ('CIBC Chequing',    'CAD', 'checking', true, 'YOUR-UUID-HERE'::uuid),
  ('CIBC Credit Card', 'CAD', 'credit',   true, 'YOUR-UUID-HERE'::uuid),
  ('Bancolombia',      'COP', 'checking', true, 'YOUR-UUID-HERE'::uuid);
