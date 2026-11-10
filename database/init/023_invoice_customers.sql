SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS accounting_invoice_customers (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 business_no VARCHAR(10) NOT NULL,
 tax_reg_id VARCHAR(4) NOT NULL DEFAULT '',
 name VARCHAR(200) NOT NULL,
 party_json JSON NOT NULL,
 version INT NOT NULL DEFAULT 0,
 updated_by BIGINT UNSIGNED NOT NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uk_invoice_customer(business_no,tax_reg_id),
 CONSTRAINT fk_invoice_customer_user FOREIGN KEY(updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO schema_migrations(version) VALUES('023_invoice_customers');
