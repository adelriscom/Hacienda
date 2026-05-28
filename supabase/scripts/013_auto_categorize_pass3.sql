-- 013 · Keyword auto-categorization — pass 3 (final)
-- Run in: Supabase Dashboard → SQL Editor

DO $$
DECLARE
  alex uuid := '22c6bd16-4eaa-41de-a893-509022adffd2';
  v_housing           uuid;
  v_transportation    uuid;
  v_groceries         uuid;
  v_pets              uuid;
  v_personal_alex     uuid;
  v_colombia_marcela  uuid;
  v_entertainment     uuid;
  v_taxes             uuid;
  v_extra             uuid;
BEGIN
  SELECT id INTO v_housing           FROM categories WHERE name = 'Housing'               AND user_id = alex;
  SELECT id INTO v_transportation    FROM categories WHERE name = 'Transportation'        AND user_id = alex;
  SELECT id INTO v_groceries         FROM categories WHERE name = 'Groceries'             AND user_id = alex;
  SELECT id INTO v_pets              FROM categories WHERE name = 'Pets'                  AND user_id = alex;
  SELECT id INTO v_personal_alex     FROM categories WHERE name = 'Personal — Alexander'  AND user_id = alex;
  SELECT id INTO v_colombia_marcela  FROM categories WHERE name = 'Colombia — Marcela'   AND user_id = alex;
  SELECT id INTO v_entertainment     FROM categories WHERE name = 'Entertainment'         AND user_id = alex;
  SELECT id INTO v_taxes             FROM categories WHERE name = 'Taxes & Legal'         AND user_id = alex;
  SELECT id INTO v_extra             FROM categories WHERE name = 'Extra / One-time'      AND user_id = alex;

  -- ── Pets ────────────────────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_pets
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%URBAN TAILS%'      -- pet store Winnipeg
    OR description ILIKE '%Grooming Sasha%'   -- pet grooming
    OR description ILIKE '%GLOBAL PET%'
  );

  -- ── Personal — Alexander ────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_personal_alex
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%HUNTER AND GUNN%'  -- barber Winnipeg
    OR description ILIKE '%HORIZON EYE CARE%' -- optometrist
    OR description ILIKE '%chiropractic%'
    OR description ILIKE '%OPENAI%'           -- ChatGPT subscription
    OR description ILIKE '%CHATGPT%'
    OR description ILIKE '%SIANY CRUZ%'       -- personal service
    OR description ILIKE '%Bath towel%'       -- manually entered personal purchase
    OR description ILIKE '%medias para mi%'
  );

  -- ── Colombia — Marcela ──────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_colombia_marcela
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%Cuota casa Colombia%' -- Colombia house payment
    OR description ILIKE '%Galguerias%'           -- Colombian snack/convenience purchase
    OR description ILIKE '%ANELGAMBOA%'           -- Colombian merchant/contact
  );

  -- ── Groceries ───────────────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_groceries
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%RED RIVER CO-OP%'
    OR description ILIKE '%LATIN GROCE%'      -- Latin grocery store
    OR description ILIKE '%WALMART%'
    OR description ILIKE '%FOODFARE%'         -- grocery/convenience chain Winnipeg
  );

  -- ── Transportation ──────────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_transportation
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%204 FUELS%'        -- fuel station
    OR description ILIKE '%PORTAGE PLACE P%'  -- Portage Place Parking
  );

  -- ── Housing ─────────────────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_housing
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%COINAMATIC%'       -- coin laundry machines (building laundry)
  );

  -- ── Entertainment ──────────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_entertainment
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%TASTE OF MEDITE%'  -- Mediterranean restaurant
    OR description ILIKE '%MB LIQUOR MART%'
    OR description ILIKE '%LIQUOR MART%'
  );

  -- ── Taxes & Legal ──────────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_taxes
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%MALOWAY%ELIAS%'    -- professional services (legal/accounting)
  );

  -- ── Extra / One-time ────────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_extra
  WHERE category_id IS NULL AND type = 'expense' AND (
       description ILIKE '%STAPLES%'
  );

  RAISE NOTICE 'Pass 3 complete.';
  RAISE NOTICE 'Remaining uncategorized: %', (SELECT COUNT(*) FROM transactions WHERE category_id IS NULL);

END $$;

-- Final full breakdown
SELECT
  COALESCE(c.name, '(uncategorized)') AS category,
  COUNT(*) AS tx_count
FROM transactions t
LEFT JOIN categories c ON c.id = t.category_id
GROUP BY c.name
ORDER BY tx_count DESC;
