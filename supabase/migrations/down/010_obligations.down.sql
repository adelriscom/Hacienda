-- DOWN 010 · Remove obligation/payment fields from accounts
ALTER TABLE accounts
  DROP COLUMN IF EXISTS monthly_payment,
  DROP COLUMN IF EXISTS original_amount,
  DROP COLUMN IF EXISTS payment_due_day;
