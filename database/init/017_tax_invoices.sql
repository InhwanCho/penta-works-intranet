SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS accounting_invoice_issuer (
 id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
 profile_json JSON NOT NULL,
 version INT NOT NULL DEFAULT 0,
 updated_by BIGINT UNSIGNED NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 CONSTRAINT fk_invoice_issuer_user FOREIGN KEY(updated_by) REFERENCES users(id),
 CONSTRAINT chk_invoice_issuer_singleton CHECK(id=1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO accounting_invoice_issuer(id,profile_json)
VALUES(1,JSON_OBJECT('corpNum','6758700483','corpName','주식회사 펜타웍스','ceoName','조재영, 신명준','addr','인천광역시 남동구 호구포로74번길 78, 남동공단 163B-5L(고잔동)','bizType','제조업','bizClass','전기장비','contactName','조재영','email','jycho@pentaworks.net','tel','01038998786','hp','01038998786','taxRegId',''));

CREATE TABLE IF NOT EXISTS accounting_tax_invoices (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 mgt_key VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 write_date DATE NOT NULL,
 customer_name VARCHAR(200) NOT NULL,
 customer_business_no VARCHAR(10) NOT NULL DEFAULT '',
 issuer_json JSON NOT NULL,
 document_json JSON NOT NULL,
 supply_amount DECIMAL(18,0) NOT NULL,
 tax_amount DECIMAL(18,0) NOT NULL,
 total_amount DECIMAL(18,0) NOT NULL,
 status ENUM('DRAFT','SENDING','ISSUED','FAILED','UNKNOWN') NOT NULL DEFAULT 'DRAFT',
 environment VARCHAR(20) NULL,
 remote_state VARCHAR(30) NULL,
 nts_state VARCHAR(30) NULL,
 nts_key VARCHAR(50) NULL,
 error_message VARCHAR(500) NULL,
 version INT NOT NULL DEFAULT 0,
 created_by BIGINT UNSIGNED NOT NULL,
 updated_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uk_tax_request(request_key),
 UNIQUE KEY uk_tax_mgt(mgt_key),
 KEY idx_tax_date(write_date,id),
 CONSTRAINT fk_tax_creator FOREIGN KEY(created_by) REFERENCES users(id),
 CONSTRAINT fk_tax_updater FOREIGN KEY(updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO schema_migrations(version) VALUES('017_tax_invoices');
