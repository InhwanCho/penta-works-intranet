SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS accounting_card_cash_details (
 card_transaction_id BIGINT UNSIGNED PRIMARY KEY,
 billing_month DATE NULL,
 payment_date DATE NULL,
 account_id BIGINT UNSIGNED NULL,
 certainty ENUM('ESTIMATED','CONFIRMED') NOT NULL DEFAULT 'ESTIMATED',
 memo VARCHAR(2000) NOT NULL DEFAULT '',
 version INT NOT NULL DEFAULT 0,
 CONSTRAINT fk_card_cash_transaction FOREIGN KEY(card_transaction_id) REFERENCES accounting_card_transactions(id),
 CONSTRAINT fk_card_cash_account FOREIGN KEY(account_id) REFERENCES accounting_bank_accounts(id),
 CONSTRAINT chk_card_cash_month CHECK(billing_month IS NULL OR DAYOFMONTH(billing_month)=1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO schema_migrations(version) VALUES('024_card_cash_details');
