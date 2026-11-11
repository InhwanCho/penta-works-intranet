ALTER TABLE accounting_bank_transactions
  ADD COLUMN IF NOT EXISTS user_memo VARCHAR(1000) NOT NULL DEFAULT '';
INSERT IGNORE INTO schema_migrations(version) VALUES ('026_bank_transaction_memo');
