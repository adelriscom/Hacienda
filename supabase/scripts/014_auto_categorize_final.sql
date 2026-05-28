-- 014 · Auto-categorization — final pass
-- Run in: Supabase Dashboard → SQL Editor

DO $$
DECLARE
  alex uuid := '22c6bd16-4eaa-41de-a893-509022adffd2';
  v_housing           uuid;
  v_transportation    uuid;
  v_groceries         uuid;
  v_pets              uuid;
  v_personal_marcela  uuid;
  v_personal_alex     uuid;
  v_colombia_marcela  uuid;
  v_colombia_alex     uuid;
  v_investments       uuid;
  v_entertainment     uuid;
  v_taxes             uuid;
  v_extra             uuid;
BEGIN
  SELECT id INTO v_housing           FROM categories WHERE name = 'Housing'               AND user_id = alex;
  SELECT id INTO v_transportation    FROM categories WHERE name = 'Transportation'        AND user_id = alex;
  SELECT id INTO v_groceries         FROM categories WHERE name = 'Groceries'             AND user_id = alex;
  SELECT id INTO v_pets              FROM categories WHERE name = 'Pets'                  AND user_id = alex;
  SELECT id INTO v_personal_marcela  FROM categories WHERE name = 'Personal — Marcela'   AND user_id = alex;
  SELECT id INTO v_personal_alex     FROM categories WHERE name = 'Personal — Alexander'  AND user_id = alex;
  SELECT id INTO v_colombia_marcela  FROM categories WHERE name = 'Colombia — Marcela'   AND user_id = alex;
  SELECT id INTO v_colombia_alex     FROM categories WHERE name = 'Colombia — Alexander'  AND user_id = alex;
  SELECT id INTO v_entertainment     FROM categories WHERE name = 'Entertainment'         AND user_id = alex;
  SELECT id INTO v_taxes             FROM categories WHERE name = 'Taxes & Legal'         AND user_id = alex;
  SELECT id INTO v_extra             FROM categories WHERE name = 'Extra / One-time'      AND user_id = alex;

  -- ── Pets ────────────────────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_pets
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%Pet Smart%'        -- "Pet Smart  - Sasha''s food"
    OR description ILIKE '%Lamb para Sasha%'  -- pet food
  );

  -- ── Groceries ───────────────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_groceries
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%food cotsco%'      -- "food cotsco Proteina..."
    OR description ILIKE '%COSTCO BUSINESS%'
    OR description = 'Milk'
    OR description ILIKE '%REAL CDN. SUPER%'  -- different format from pass 1
  );

  -- ── Transportation ──────────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_transportation
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%PAY BY PHONE%'     -- parking payment app
    OR description ILIKE '%CITY OF WINNIPE%'  -- city parking/permits
    OR description ILIKE 'Gas %'              -- "Gas " with trailing space
    OR description ILIKE '% Fuels%'
  );

  -- ── Entertainment ──────────────────────────────────────────────────────────
  -- Restaurants, cafes, bars, events, activities
  UPDATE transactions SET category_id = v_entertainment
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%BAR BURRITO%'
    OR description ILIKE '%BEAURIVAGE%'
    OR description ILIKE '%SANTA LUCIA PIZZA%'
    OR description ILIKE '%A-OK CAFE%'
    OR description ILIKE '%JAMES AVENUE PU%'  -- James Avenue Pumping Station (restaurant)
    OR description ILIKE '%THE NOOK DINER%'
    OR description ILIKE '%cocteles%'
    OR description ILIKE '%THERMEA%'          -- spa village (includes restaurant/bar)
    OR description ILIKE '%SKYR%'             -- Forks Market food vendor
    OR description ILIKE '%Movie%'
    OR description ILIKE '%Ice Cream%'
    OR description ILIKE '%PIZZA PIZZA%'
    OR description ILIKE '%OLYMPIA DINER%'
    OR description ILIKE '%EVENTBRITE%'
    OR description ILIKE '%KERNELS%'          -- popcorn
    OR description ILIKE '%CAFE NUL%'
    OR description ILIKE '%HONU POKE%'
    OR description ILIKE '%CAFE con%'
    OR description ILIKE '%Cafe con%'
    OR description ILIKE '%PURDYS%'           -- chocolate shop
    OR description ILIKE '%REAL ESCAPE%'      -- escape room
    OR description ILIKE '%DISHAKE%'          -- subscription/entertainment service
    OR description ILIKE '%GOOGLE%SEVICE%'    -- Google Play/services
    OR description ILIKE '%GOOGLE * SE%'
  );

  -- ── Personal — Marcela ──────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_personal_marcela
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%BATH BODY%'        -- Bath & Body Works
    OR description ILIKE '%BATH & BODY%'
    OR description ILIKE '%Manicure%'
    OR description ILIKE '%Pedicure%'
    OR description ILIKE '%Suplementos%'      -- "Suplementos Resveratrol y Menosense"
    OR description ILIKE '%Menosense%'
    OR description ILIKE '%JUST COZY%'        -- clothing/lifestyle
  );

  -- ── Personal — Alexander ────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_personal_alex
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%UNDER ARMOUR%'     -- clothing
    OR description ILIKE '%Gym%'
    OR description ILIKE '%POPEYE%SUPPLE%'    -- nutrition supplement store
    OR description ILIKE '%CANVA%'
    OR description ILIKE '%Upwork%'
    OR description ILIKE '%FYIDOCTORS%'       -- optometrist chain
    OR description ILIKE '%WORLD EDUCATION%'  -- professional development
  );

  -- ── Colombia — Marcela ──────────────────────────────────────────────────────
  -- e-Transfers to Colombian contacts + Colombian services
  UPDATE transactions SET category_id = v_colombia_marcela
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%Katerine Suarez%'
    OR description ILIKE '%Milena Perdomo%'
    OR description ILIKE '%OCHOA SOTO%'
    OR description ILIKE '%One-time contact Xiomara%'
    OR description ILIKE '%One-time contact Julieta%'
    OR description ILIKE '%One-time contact karina%'
    OR description ILIKE '%Loans y ayuda familia Colombia%'
    OR description ILIKE '%CIA SURAMERICANA%'  -- Colombian insurance company
  );

  -- ── Colombia — Alexander ────────────────────────────────────────────────────
  -- Remitly = money transfer service Alexander uses to send money to Colombia
  UPDATE transactions SET category_id = v_colombia_alex
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%Remitly%'
  );

  -- ── Taxes & Legal ──────────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_taxes
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%Loan Car%'          -- car loan payment
  );

  -- ── Extra / One-time ────────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_extra
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%Camping%'
    OR description ILIKE '%regalo%'            -- "regalo Jairo" (gift)
    OR description ILIKE '%Chocolates for%'
    OR description ILIKE '%CANADIAN TIRE%'
    OR description ILIKE '%Marcela Falla%'     -- e-transfers to Marcela (household)
    OR description ILIKE '%One-time contact Ashley%'
    OR description ILIKE '%One-time contact%'  -- unnamed contacts
    OR description ILIKE '%PREP SOLUTIONS%'
  );

  RAISE NOTICE 'Final pass complete.';
  RAISE NOTICE 'Remaining uncategorized: %', (SELECT COUNT(*) FROM transactions WHERE category_id IS NULL);

END $$;

-- Full final breakdown
SELECT
  COALESCE(c.name, '(uncategorized)') AS category,
  COUNT(*) AS tx_count
FROM transactions t
LEFT JOIN categories c ON c.id = t.category_id
GROUP BY c.name
ORDER BY tx_count DESC;
