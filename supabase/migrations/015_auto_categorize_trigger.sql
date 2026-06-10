-- 015 · Auto-categorization trigger
-- Runs on every INSERT into transactions.
-- Assigns category_id based on description keywords when category_id is NULL.
-- Works for any user — looks up their own categories by name.
-- Run in: Supabase Dashboard → SQL Editor

CREATE OR REPLACE FUNCTION auto_categorize_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_uid     uuid := NEW.user_id;
  cat_name  text := NULL;
BEGIN
  -- Skip if already categorized or if it's a transfer
  IF NEW.category_id IS NOT NULL OR NEW.type = 'transfer' THEN
    RETURN NEW;
  END IF;

  -- Match description to a category name (first match wins, order = priority)
  cat_name := CASE

    WHEN NEW.description ILIKE '%Mutual Fund%'
      OR NEW.description ILIKE '%Contribution RBC%'
      OR NEW.description ILIKE '%Income Reinvested RBC%'
      OR NEW.description =     'Contribution'
      OR NEW.description ILIKE '%RRSP%'
      OR NEW.description ILIKE '%TFSA%'
      OR NEW.description ILIKE '%COLPENSIONES%'
      OR NEW.description ILIKE '%Propulsar%'
      OR NEW.description ILIKE '%SPECIAL DEPOSIT%'
      OR NEW.description ILIKE '%WealthSimple%'
      THEN 'Investments & Savings'

    WHEN NEW.description ILIKE '%ABONO INTERESES%'
      OR NEW.description ILIKE '%TRANSF INTERNACIONAL RECIBIDA%'
      OR NEW.description ILIKE '%TRANSFERENCIA CTA SUC VIRTUAL%'
      OR NEW.description ILIKE '%AJUSTE INTERES AHORROS%'
      OR NEW.description ILIKE '%ABONO TRANSFER%'
      OR NEW.description ILIKE '%CUOTA DE MANEJO MENSUAL%'
      OR NEW.description ILIKE '%SEGURO DE VIDA OBLIGATORIO%'
      OR NEW.description ILIKE '%Rendimientos Financieros%'
      OR NEW.description ILIKE '%Pago Credito Nro%'
      OR NEW.description ILIKE '%REINTEGRO INTERES CORRIENTE%'
      OR NEW.description ILIKE '%GRACIAS POR SU PAGO%'
      OR NEW.description ILIKE '%PAGO PSE%'
      OR NEW.description ILIKE '%COMISION TRASLADO OTROS%'
      OR NEW.description ILIKE '%IVA COMIS TRASLADO%'
      OR NEW.description ILIKE '%TRASLADO VIRTUAL OTROS BANCOS%'
      OR NEW.description ILIKE '%TRANSFERENCIA Z%'
      OR NEW.description ILIKE '%Transferencia BANCOLOMBIA%'
      OR NEW.description ILIKE '%Transferencia NEQUI%'
      OR NEW.description ILIKE '%Gravamen a los Movimientos%'
      OR NEW.description ILIKE '%GMF%'
      THEN 'Colombia — Marcela'

    WHEN NEW.description ILIKE '%UBER%'
      OR NEW.description ILIKE '%PARKING%'
      OR NEW.description ILIKE '%AUTOPAC%'
      OR NEW.description ILIKE '%Auto Insurance MPI%'
      OR NEW.description ILIKE '%TRANSIT%'
      OR NEW.description ILIKE '%GO TRAIN%'
      OR NEW.description ILIKE '%VIA RAIL%'
      OR NEW.description ILIKE '%PRESTO%'
      OR NEW.description ILIKE '%PETRO-CANADA%'
      OR NEW.description ILIKE '%PETRO CANADA%'
      OR NEW.description ILIKE '%ESSO%'
      OR NEW.description ILIKE '%SHELL%'
      THEN 'Transportation'

    WHEN NEW.description ILIKE '%Northview%'
      OR NEW.description ILIKE '%HYDRO%'
      OR NEW.description ILIKE '%ENBRIDGE%'
      OR NEW.description ILIKE '%RENT%'
      OR NEW.description ILIKE '%MORTGAGE%'
      OR NEW.description ILIKE '%ROGERS%'
      OR NEW.description ILIKE '%BELL MOBILITY%'
      OR NEW.description ILIKE '%BELL MOBI%'
      OR NEW.description ILIKE '%TELUS%'
      OR NEW.description ILIKE '%Monthly fee%'
      OR NEW.description ILIKE '%Monthly Fee Rebate%'
      OR NEW.description ILIKE '%SERVICE CHARGE%'
      THEN 'Housing'

    WHEN NEW.description ILIKE '%YOUTUBE%'
      OR NEW.description ILIKE '%Netflix%'
      OR NEW.description ILIKE '%SPOTIFY%'
      OR NEW.description ILIKE '%DISNEY%'
      OR NEW.description ILIKE '%AMAZON PRIME%'
      OR NEW.description ILIKE '%CHAPTERS%'
      OR NEW.description ILIKE '%INDIGO%'
      OR NEW.description ILIKE '%LCBO%'
      OR NEW.description ILIKE '%BEER STORE%'
      OR NEW.description ILIKE '%CINEMA%'
      OR NEW.description ILIKE '%THEATRE%'
      OR NEW.description ILIKE '%STELLA%'
      THEN 'Entertainment'

    WHEN NEW.description ILIKE '%KOODO%'
      OR NEW.description ILIKE '%A1 NUTRITION%'
      OR NEW.description ILIKE '%MANULIFE%'
      OR NEW.description ILIKE '%Health%Dental%'
      THEN 'Personal — Alexander'

    WHEN NEW.description ILIKE '%PURCHASE INTEREST%'
      OR NEW.description ILIKE '%CASH INTEREST%'
      OR NEW.description ILIKE '%INTEREST REVERSAL%'
      OR NEW.description ILIKE '%Personal Loan%'
      OR NEW.description ILIKE '%CONSUMER LOANS%'
      THEN 'Taxes & Legal'

    WHEN NEW.description ILIKE '%CANCER HALL%'
      OR NEW.description ILIKE '%CANCER%CHARITY%'
      OR NEW.description ILIKE '%DONATION%'
      THEN 'Extra / One-time'

    ELSE NULL
  END;

  -- Look up the category id for this user
  IF cat_name IS NOT NULL THEN
    SELECT id INTO NEW.category_id
    FROM categories
    WHERE user_id = v_uid AND name = cat_name
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger if exists, then recreate
DROP TRIGGER IF EXISTS trg_auto_categorize ON transactions;

CREATE TRIGGER trg_auto_categorize
  BEFORE INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION auto_categorize_transaction();
