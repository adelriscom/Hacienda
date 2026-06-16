-- DOWN 016 · Revert exchange_rates to COP-only single-rate
-- WARNING: drops every non-COP rate row.

-- 1. Drop non-COP currencies
DELETE FROM exchange_rates WHERE currency_code <> 'COP';

-- 2. Restore cop_to_cad from rate_to_base for the remaining COP rows
UPDATE exchange_rates
   SET cop_to_cad = rate_to_base
 WHERE currency_code = 'COP' AND cop_to_cad IS NULL;

-- 3. Swap uniqueness back to (user, month)
ALTER TABLE exchange_rates DROP CONSTRAINT IF EXISTS exchange_rates_user_month_currency_key;
ALTER TABLE exchange_rates ADD  CONSTRAINT exchange_rates_user_id_month_key UNIQUE (user_id, month);

-- 4. Restore cop_to_cad NOT NULL and drop the generic columns
ALTER TABLE exchange_rates ALTER COLUMN cop_to_cad SET NOT NULL;
ALTER TABLE exchange_rates DROP COLUMN IF EXISTS rate_to_base;
ALTER TABLE exchange_rates DROP COLUMN IF EXISTS currency_code;

-- 5. Restore the CAD/COP-only budgets check
ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_currency_check;
ALTER TABLE budgets ADD  CONSTRAINT budgets_currency_check CHECK (currency IN ('CAD', 'COP'));
