-- Hacienda · Seed Data — Real categories and accounts for Alexander & Marcela
-- Run in Supabase SQL Editor after 001_schema.sql
-- Automatically uses the first registered user (alexander.delrisco@yahoo.com)

DO $$
DECLARE
  v_uid uuid := (SELECT id FROM auth.users ORDER BY created_at LIMIT 1);
BEGIN

-- ─── Categories ───────────────────────────────────────────────────────────────

INSERT INTO categories (user_id, name, color, icon) VALUES
  -- Shared household
  (v_uid, 'Household',            '#6366f1', 'wallet'),
  (v_uid, 'Car',                  '#0ea5e9', 'card'),
  (v_uid, 'Food',                 '#10b981', 'cash'),
  (v_uid, 'Pets',                 '#f59e0b', 'sparkle'),
  (v_uid, 'Entertainment',        '#a855f7', 'sparkle'),
  (v_uid, 'Extra_expenses',       '#ef4444', 'more'),
  (v_uid, 'Investment_accounts',  '#f97316', 'btc'),
  -- Marcela
  (v_uid, 'Personal_Marcela',     '#ec4899', 'sparkle'),
  (v_uid, 'Colombia_Marcela',     '#14b8a6', 'doc'),
  (v_uid, 'Taxes_Legal_Marcela',  '#64748b', 'doc'),
  -- Alexander
  (v_uid, 'Personal_Alexander',   '#8b5cf6', 'sparkle'),
  (v_uid, 'Colombia_Alexander',   '#06b6d4', 'doc'),
  (v_uid, 'Taxes_Legal_Alexander','#475569', 'doc'),
  -- Income
  (v_uid, 'Income',               '#22c55e', 'income')
ON CONFLICT DO NOTHING;

-- ─── Accounts — Alexander ─────────────────────────────────────────────────────

INSERT INTO accounts (user_id, name, type, currency, balance, credit_limit) VALUES
  -- Chequing & savings (CAD)
  (v_uid, 'RBC Chequing',          'checking',   'CAD',   742.78,    NULL),
  (v_uid, 'RBC TSFA',              'savings',    'CAD',   863.63,    NULL),
  (v_uid, 'RBC RRSP',              'savings',    'CAD',  1056.20,    NULL),
  -- Credit cards (CAD)
  (v_uid, 'RBC Visa Low Rate',     'credit',     'CAD', -6921.62,  6921.62),
  (v_uid, 'RBC TC',                'credit',     'CAD', -6500.00,  6500.00),
  (v_uid, 'CIBC COSTCO',           'credit',     'CAD',     0.00,  5000.00),
  -- Other
  (v_uid, 'CSB Savings',           'savings',    'CAD',     0.00,    NULL),
  (v_uid, 'CSB Checking',          'checking',   'CAD',     0.00,    NULL),
  (v_uid, 'Propulsar Alexander',   'investment', 'CAD',   150.00,    NULL),
  (v_uid, 'Cash CAD',              'cash',       'CAD',     0.00,    NULL)
ON CONFLICT DO NOTHING;

-- ─── Accounts — Marcela ───────────────────────────────────────────────────────

INSERT INTO accounts (user_id, name, type, currency, balance, credit_limit) VALUES
  -- Credit cards (CAD)
  (v_uid, 'Scotiabank TC',                 'credit',   'CAD',  -2063.11,  8000.00),
  -- Colombian accounts (COP)
  (v_uid, 'Davivienda Casa Colombia',      'checking', 'COP',  172635793.83, NULL),
  (v_uid, 'Davivienda Consumo',            'checking', 'COP',   15878982.73, NULL),
  (v_uid, 'Davivienda AFC',                'savings',  'COP',      44969.46, NULL),
  (v_uid, 'Davivienda Ahorros',            'savings',  'COP',          0.12, NULL),
  (v_uid, 'Bancolombia Ahorros',           'savings',  'COP',          0.00, NULL),
  (v_uid, 'Banco Occidente',               'checking', 'COP',          0.00, NULL),
  (v_uid, 'Colpensiones',                  'investment','COP',          0.00, NULL),
  (v_uid, 'Propulsar Marcela',             'investment','COP',          0.00, NULL),
  -- Savings CAD
  (v_uid, 'Cuentas de Ahorro Marcela',     'savings',  'CAD',        593.04, NULL),
  (v_uid, 'Cash COP',                      'cash',     'COP',          0.00, NULL)
ON CONFLICT DO NOTHING;

END $$;
