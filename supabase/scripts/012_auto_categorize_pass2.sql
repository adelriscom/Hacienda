-- 012 · Keyword auto-categorization — pass 2
-- Second pass for patterns missed in 011. Safe to re-run (only touches NULL category_id).
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
  SELECT id INTO v_investments       FROM categories WHERE name = 'Investments & Savings' AND user_id = alex;
  SELECT id INTO v_entertainment     FROM categories WHERE name = 'Entertainment'         AND user_id = alex;
  SELECT id INTO v_taxes             FROM categories WHERE name = 'Taxes & Legal'         AND user_id = alex;
  SELECT id INTO v_extra             FROM categories WHERE name = 'Extra / One-time'      AND user_id = alex;

  -- ── Groceries ───────────────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_groceries
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%SAFEWAY%'
    OR description ILIKE '%REAL CDN SUPER%'
    OR description ILIKE '%REAL CANADIAN%'
    OR description ILIKE '%SUPERSTORE%'
    OR description ILIKE '%COSTCO WHOLESAL%'
    OR description ILIKE '%A1 MINI MARKET%'
    OR description ILIKE '%Groceries%'
    OR description ILIKE '%tomates%'
    OR description ILIKE '%lechuga%'
    OR description ILIKE '%LOBLAWS%'
    OR description ILIKE '%NO FRILLS%'
    OR description ILIKE '%FOOD BASICS%'
    OR description ILIKE '%METRO%'
    OR description ILIKE '%IGA%'
    OR description ILIKE '%SOBEYS%'
    OR description ILIKE '%FRESHCO%'
  );

  -- ── Transportation ──────────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_transportation
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%COSTCO GAS%'
    OR description ILIKE '%IMPARK%'
    OR description ILIKE '%CHAMOIS CAR%'   -- car wash
    OR description =     'Gas'
    OR description ILIKE '%CAR WASH%'
  );

  -- ── Housing ─────────────────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_housing
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%SHAW%HOME%'
    OR description ILIKE '%SHAW%CABLE%'
    OR description ILIKE '%000000126674%'  -- Shaw @ Home bill reference
    OR description ILIKE '%Laundry%'
  );

  -- ── Entertainment ──────────────────────────────────────────────────────────
  -- Restaurants, bars, coffee, venues, streaming
  UPDATE transactions SET category_id = v_entertainment
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%LANDMARK%'          -- movie theatre
    OR description ILIKE '%THE WSO%'           -- Winnipeg Symphony Orchestra
    OR description ILIKE '%CANADA LIFE CEN%'   -- Canada Life Centre (arena/concerts)
    OR description ILIKE '%THOM BARGEN%'       -- coffee shop / bar
    OR description ILIKE '%TIM HORTONS%'
    OR description ILIKE '%PIZZA HOTLINE%'
    OR description ILIKE '%PRAIRIE INK%'       -- restaurant
    OR description ILIKE '%LeCroissant%'
    OR description ILIKE '%Nuburger%'
    OR description ILIKE '%HIRISE FOOD%'
    OR description ILIKE '%STARBUCKS%'
    OR description ILIKE '%MCDONALD%'
    OR description ILIKE '%SUBWAY%'
    OR description ILIKE '%SWISS CHALET%'
    OR description ILIKE '%APPLE.COM/BILL%'    -- Apple subscriptions (TV+, Music, iCloud)
    OR description ILIKE '%MICROSOFT%'         -- Microsoft 365 subscription
  );

  -- ── Pets ────────────────────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_pets
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%PETSMART%'
    OR description ILIKE '%PET VALU%'
    OR description ILIKE '%VETERINAR%'
    OR description ILIKE '%ANIMAL HOSPITAL%'
  );

  -- ── Personal — Alexander ────────────────────────────────────────────────────
  -- Personal care, massages, subscriptions not covered above
  UPDATE transactions SET category_id = v_personal_alex
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%OMNIA MANUA%'       -- spa/massage
    OR description ILIKE '%DEEP ROOTS MASS%'   -- massage
    OR description ILIKE '%SHOPPERS DRUG%'
    OR description ILIKE '%shampoo%'
    OR description ILIKE '%crema%'
    OR description ILIKE '%aseo%'              -- "Cosas de aseo" = hygiene products
    OR description ILIKE '%dollarama%'
  );

  -- ── Colombia — Marcela ──────────────────────────────────────────────────────
  -- Transfers to Colombia, Colombian bank fees
  UPDATE transactions SET category_id = v_colombia_marcela
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%TRANSF A %'         -- transfer to named person (Colombian)
    OR description ILIKE '%MANEJO TARJETA DEB%'
    OR description ILIKE '%CIBC-DISATF%'       -- CIBC Direct International Transfer
  );

  -- ── Taxes & Legal ──────────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_taxes
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%OVERLIMIT FEE%'
    OR description ILIKE '%Annual fee%'
    OR description ILIKE '%NSF%'
    OR description ILIKE '%RETURNED ITEM%'
  );

  -- ── Extra / One-time ────────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_extra
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%Gift%'
    OR description ILIKE '%Vicky%'
    OR description ILIKE '%RAEI CONVENIENC%'
  );

  RAISE NOTICE 'Pass 2 complete.';
  RAISE NOTICE 'Still uncategorized: %', (SELECT COUNT(*) FROM transactions WHERE category_id IS NULL);

END $$;

-- Final breakdown
SELECT
  COALESCE(c.name, '(uncategorized)') AS category,
  COUNT(*) AS tx_count
FROM transactions t
LEFT JOIN categories c ON c.id = t.category_id
GROUP BY c.name
ORDER BY tx_count DESC;

-- Remaining uncategorized expenses (the ones that still need manual review)
SELECT description, COUNT(*) AS cnt
FROM transactions
WHERE category_id IS NULL AND type = 'expense'
GROUP BY description
ORDER BY cnt DESC
LIMIT 40;
