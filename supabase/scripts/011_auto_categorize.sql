-- 011 · Keyword-based auto-categorization
-- Assigns categories to uncategorized transactions based on description patterns.
-- Safe to re-run — only touches rows WHERE category_id IS NULL.
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
  SELECT id INTO v_investments       FROM categories WHERE name = 'Investments & Savings' AND user_id = alex;
  SELECT id INTO v_entertainment     FROM categories WHERE name = 'Entertainment'         AND user_id = alex;
  SELECT id INTO v_taxes             FROM categories WHERE name = 'Taxes & Legal'         AND user_id = alex;
  SELECT id INTO v_extra             FROM categories WHERE name = 'Extra / One-time'      AND user_id = alex;

  -- ── Investments & Savings ───────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_investments
  WHERE category_id IS NULL AND (
       description ILIKE '%Mutual Fund%'
    OR description ILIKE '%Contribution RBC%'
    OR description ILIKE '%Income Reinvested RBC%'
    OR description =     'Contribution'
    OR description ILIKE '%RRSP%'
    OR description ILIKE '%TFSA%'
    OR description ILIKE '%COLPENSIONES%'
    OR description ILIKE '%Propulsar%'
    OR description ILIKE '%SPECIAL DEPOSIT%'
  );

  -- ── Colombia — Marcela ──────────────────────────────────────────────────────
  -- Colombian bank operations: PSE payments, Davivienda/Bancolombia transfers,
  -- account fees, financial tax (GMF), interest credits, Nequi
  UPDATE transactions SET category_id = v_colombia_marcela
  WHERE category_id IS NULL AND (
       description ILIKE '%ABONO INTERESES%'
    OR description ILIKE '%TRANSF INTERNACIONAL RECIBIDA%'
    OR description ILIKE '%TRANSFERENCIA CTA SUC VIRTUAL%'
    OR description ILIKE '%AJUSTE INTERES AHORROS%'
    OR description ILIKE '%ABONO TRANSFER%'
    OR description ILIKE '%CUOTA DE MANEJO MENSUAL%'
    OR description ILIKE '%SEGURO DE VIDA OBLIGATORIO%'
    OR description ILIKE '%Rendimientos Financieros%'
    OR description ILIKE '%Pago Credito Nro%'
    OR description ILIKE '%REINTEGRO INTERES CORRIENTE%'
    OR description ILIKE '%GRACIAS POR SU PAGO%'
    OR description ILIKE '%PAGO PSE%'
    OR description ILIKE '%COMISION TRASLADO OTROS%'
    OR description ILIKE '%IVA COMIS TRASLADO%'
    OR description ILIKE '%TRASLADO VIRTUAL OTROS BANCOS%'
    OR description ILIKE '%TRANSFERENCIA Z%'
    OR description ILIKE '%Transferencia BANCOLOMBIA%'
    OR description ILIKE '%Transferencia NEQUI%'
    OR description ILIKE '%Gravamen a los Movimientos%'
    OR description ILIKE '%GMF%'
  );

  -- ── Transportation ──────────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_transportation
  WHERE category_id IS NULL AND (
       description ILIKE '%UBER%'
    OR description ILIKE '%PARKING%'
    OR description ILIKE '%AUTOPAC%'
    OR description ILIKE '%Auto Insurance MPI%'
    OR description ILIKE '%TRANSIT%'
    OR description ILIKE '%GO TRAIN%'
    OR description ILIKE '%VIA RAIL%'
    OR description ILIKE '%PRESTO%'
    OR description ILIKE '%PETRO-CANADA%'
    OR description ILIKE '%PETRO CANADA%'
    OR description ILIKE '%ESSO%'
    OR description ILIKE '%SHELL%'
  );

  -- ── Housing ─────────────────────────────────────────────────────────────────
  -- Rent, utilities, phone/internet, bank account fees
  UPDATE transactions SET category_id = v_housing
  WHERE category_id IS NULL AND (
       description ILIKE '%Northview%'
    OR description ILIKE '%HYDRO%'
    OR description ILIKE '%ENBRIDGE%'
    OR description ILIKE '%RENT%'
    OR description ILIKE '%MORTGAGE%'
    OR description ILIKE '%ROGERS%'
    OR description ILIKE '%BELL MOBILITY%'
    OR description ILIKE '%BELL MOBI%'
    OR description ILIKE '%TELUS%'
    OR description ILIKE '%Monthly fee%'
    OR description ILIKE '%Monthly Fee Rebate%'
    OR description ILIKE '%SERVICE CHARGE%'
  );

  -- ── Entertainment ──────────────────────────────────────────────────────────
  UPDATE transactions SET category_id = v_entertainment
  WHERE category_id IS NULL AND (
       description ILIKE '%YOUTUBE%'
    OR description ILIKE '%Netflix%'
    OR description ILIKE '%SPOTIFY%'
    OR description ILIKE '%DISNEY%'
    OR description ILIKE '%AMAZON PRIME%'
    OR description ILIKE '%CHAPTERS%'
    OR description ILIKE '%INDIGO%'
    OR description ILIKE '%LCBO%'
    OR description ILIKE '%BEER STORE%'
    OR description ILIKE '%CINEMA%'
    OR description ILIKE '%THEATRE%'
    OR description ILIKE '%STELLA%'
  );

  -- ── Personal — Alexander ────────────────────────────────────────────────────
  -- Phone, health insurance, personal spending in Canada
  UPDATE transactions SET category_id = v_personal_alex
  WHERE category_id IS NULL AND (
       description ILIKE '%KOODO%'
    OR description ILIKE '%A1 NUTRITION%'
    OR description ILIKE '%MANULIFE%'
    OR description ILIKE '%Health%Dental%'
  );

  -- ── Taxes & Legal ──────────────────────────────────────────────────────────
  -- Credit card interest, loan payments
  UPDATE transactions SET category_id = v_taxes
  WHERE category_id IS NULL AND (
       description ILIKE '%PURCHASE INTEREST%'
    OR description ILIKE '%CASH INTEREST%'
    OR description ILIKE '%INTEREST REVERSAL%'
    OR description ILIKE '%Personal Loan%'
    OR description ILIKE '%CONSUMER LOANS%'
  );

  -- ── Extra / One-time ────────────────────────────────────────────────────────
  -- Charity donations, one-off items
  UPDATE transactions SET category_id = v_extra
  WHERE category_id IS NULL AND (
       description ILIKE '%CANCER HALL%'
    OR description ILIKE '%CANCER%CHARITY%'
    OR description ILIKE '%DONATION%'
  );

  RAISE NOTICE 'Auto-categorization complete.';
  RAISE NOTICE 'Still uncategorized: %', (SELECT COUNT(*) FROM transactions WHERE category_id IS NULL);

END $$;

-- Results breakdown
SELECT
  COALESCE(c.name, '(uncategorized)') AS category,
  COUNT(*) AS tx_count
FROM transactions t
LEFT JOIN categories c ON c.id = t.category_id
GROUP BY c.name
ORDER BY tx_count DESC;
