SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS SPRING_SESSION (
 PRIMARY_ID CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 SESSION_ID CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 CREATION_TIME BIGINT NOT NULL,
 LAST_ACCESS_TIME BIGINT NOT NULL,
 MAX_INACTIVE_INTERVAL INT NOT NULL,
 EXPIRY_TIME BIGINT NOT NULL,
 PRINCIPAL_NAME VARCHAR(100),
 PRIMARY KEY(PRIMARY_ID), UNIQUE KEY SPRING_SESSION_IX1(SESSION_ID),
 KEY SPRING_SESSION_IX2(EXPIRY_TIME), KEY SPRING_SESSION_IX3(PRINCIPAL_NAME)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS SPRING_SESSION_ATTRIBUTES (
 SESSION_PRIMARY_ID CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 ATTRIBUTE_NAME VARCHAR(200) NOT NULL,
 ATTRIBUTE_BYTES LONGBLOB NOT NULL,
 PRIMARY KEY(SESSION_PRIMARY_ID,ATTRIBUTE_NAME),
 CONSTRAINT fk_session_attributes FOREIGN KEY(SESSION_PRIMARY_ID) REFERENCES SPRING_SESSION(PRIMARY_ID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE accounting_bank_accounts
 ADD COLUMN IF NOT EXISTS last_sync_at DATETIME(6) NULL,
 ADD COLUMN IF NOT EXISTS last_sync_error VARCHAR(500) NULL;

ALTER TABLE accounting_card_transactions
 ADD COLUMN IF NOT EXISTS removed_at DATETIME(6) NULL,
 ADD COLUMN IF NOT EXISTS removed_reason VARCHAR(30) NULL,
 ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;

-- User-requested import undo requires history; no background import batch system.
CREATE TABLE IF NOT EXISTS accounting_card_uploads (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 filename VARCHAR(255) NOT NULL,
 issuer VARCHAR(20) NOT NULL,
 file_hash CHAR(64) NULL,
 legacy_baseline BOOLEAN NOT NULL DEFAULT FALSE,
 row_count INT NOT NULL,
 inserted_count INT NOT NULL DEFAULT 0,
 updated_count INT NOT NULL DEFAULT 0,
 unchanged_count INT NOT NULL DEFAULT 0,
 status ENUM('APPLIED','ROLLED_BACK') NOT NULL DEFAULT 'APPLIED',
 uploaded_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 rolled_back_at DATETIME(6) NULL,
 CONSTRAINT fk_card_upload_user FOREIGN KEY(uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS accounting_card_upload_changes (
 upload_id BIGINT UNSIGNED NOT NULL,
 transaction_id BIGINT UNSIGNED NOT NULL,
 before_value JSON NULL,
 expected_revision BIGINT NOT NULL,
 PRIMARY KEY(upload_id,transaction_id),
 CONSTRAINT fk_card_change_upload FOREIGN KEY(upload_id) REFERENCES accounting_card_uploads(id),
 CONSTRAINT fk_card_change_transaction FOREIGN KEY(transaction_id) REFERENCES accounting_card_transactions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Existing uploads have only their latest source values. Expose recoverable
-- file removal, never pretend that a historical before-value can be restored.
INSERT INTO accounting_card_uploads(filename,issuer,legacy_baseline,row_count,inserted_count,uploaded_by,created_at)
SELECT t.source_filename,c.issuer,TRUE,COUNT(*),COUNT(*),MIN(t.imported_by),MIN(t.first_imported_at)
FROM accounting_card_transactions t JOIN accounting_cards c ON c.id=t.card_id
WHERE t.revision=0
 AND NOT EXISTS(SELECT 1 FROM accounting_card_upload_changes ch WHERE ch.transaction_id=t.id)
 AND NOT EXISTS(SELECT 1 FROM accounting_card_uploads u WHERE BINARY u.filename=BINARY t.source_filename AND u.issuer=c.issuer AND u.legacy_baseline=TRUE)
GROUP BY t.source_filename,c.issuer;
INSERT IGNORE INTO accounting_card_upload_changes(upload_id,transaction_id,before_value,expected_revision)
SELECT u.id,t.id,NULL,0 FROM accounting_card_transactions t
JOIN accounting_cards c ON c.id=t.card_id
JOIN accounting_card_uploads u ON BINARY u.filename=BINARY t.source_filename AND u.issuer=c.issuer AND u.legacy_baseline=TRUE
WHERE t.revision=0 AND NOT EXISTS(SELECT 1 FROM accounting_card_upload_changes ch WHERE ch.transaction_id=t.id);
INSERT IGNORE INTO schema_migrations(version) VALUES('015_sessions_sync_history');
