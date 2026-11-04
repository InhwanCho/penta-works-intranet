SET NAMES utf8mb4;
ALTER TABLE accounting_bank_transactions ADD COLUMN IF NOT EXISTS transfer_fee DECIMAL(18,2) NOT NULL DEFAULT 0;
-- Plans extend the existing ledger; settlements use its shared allocation limits.
CREATE TABLE IF NOT EXISTS accounting_cash_plans (
 ledger_entry_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 original_date DATE NOT NULL,
 original_amount DECIMAL(18,2) NOT NULL,
 counterparty_name VARCHAR(200) NOT NULL DEFAULT '',
 category_name VARCHAR(100) NOT NULL DEFAULT '',
 certainty ENUM('CONFIRMED','ESTIMATED') NOT NULL DEFAULT 'ESTIMATED',
 card_issuer ENUM('BC','HANA') NULL,
 billing_month DATE NULL,
 CONSTRAINT fk_cash_plan_entry FOREIGN KEY(ledger_entry_id) REFERENCES accounting_ledger_entries(id),
 CONSTRAINT chk_cash_plan_amount CHECK(original_amount > 0),
 CONSTRAINT chk_cash_plan_bill CHECK((card_issuer IS NULL AND billing_month IS NULL) OR (card_issuer IS NOT NULL AND billing_month IS NOT NULL AND DAYOFMONTH(billing_month)=1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO schema_migrations(version) VALUES('022_cash_planning');
