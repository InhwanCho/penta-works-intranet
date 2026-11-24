ALTER TABLE accounting_card_transactions
    MODIFY approval_no VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    MODIFY approval_amount DECIMAL(18,2) NULL,
    ADD COLUMN IF NOT EXISTS billed_amount DECIMAL(18,2) NULL;
INSERT IGNORE INTO schema_migrations(version) VALUES('033_card_statement');
