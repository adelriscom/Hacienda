-- DOWN 015 · Remove auto-categorization trigger
DROP TRIGGER IF EXISTS trg_auto_categorize ON transactions;
DROP FUNCTION IF EXISTS auto_categorize_transaction();
