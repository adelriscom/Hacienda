-- 015 · Linked transfer pairs
-- Adds transfer_group_id to link the outgoing and incoming legs of a transfer.
-- Safe to re-run.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS transfer_group_id uuid;

CREATE INDEX IF NOT EXISTS idx_txn_transfer_group
  ON transactions (transfer_group_id)
  WHERE transfer_group_id IS NOT NULL;
