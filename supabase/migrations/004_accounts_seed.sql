-- Hacienda · Seed Marcela's accounts
-- Run in Supabase SQL Editor while logged in (auth.uid() must resolve to your user)

INSERT INTO accounts (name, type, currency, balance, is_active, user_id)
SELECT name, type, currency, 0, true, auth.uid()
FROM (VALUES
  -- Credits & Loans (COP)
  ('Davivienda Leasing - Casa Colombia', 'credit',     'COP'),
  ('Davivienda Consumo',                 'credit',     'COP'),
  ('TC Scotia Colpensiones',             'credit',     'COP'),

  -- Credits & Loans (CAD)
  ('TC Scotiabank',                      'credit',     'CAD'),
  ('TC Scotia Cuota Tarjeta de Credito', 'credit',     'CAD'),
  ('TC Scotia Insurance Cancer',         'credit',     'CAD'),
  ('TC Scotia Saldo de Tickets',         'credit',     'CAD'),
  ('TC Scotia - Seguro de Casa',         'credit',     'CAD'),

  -- Savings & Investment (CAD)
  ('TC RBC',                             'credit',     'CAD'),
  ('RBC TC Visa Low Rate',               'credit',     'CAD'),
  ('Cuentas de Ahorro (RBC)',            'savings',    'CAD'),
  ('RBC Ahorros Chequing',               'checking',   'CAD'),
  ('RBC Ahorros RRSP',                   'investment', 'CAD'),
  ('RBC Ahorros TSFA',                   'investment', 'CAD'),

  -- Savings & Investment (COP)
  ('Davivienda AFC',                     'savings',    'COP'),
  ('Davivienda Ahorros',                 'savings',    'COP'),
  ('Bancolombia Ahorros',                'savings',    'COP')
) AS t(name, type, currency);
