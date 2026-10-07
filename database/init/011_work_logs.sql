SET NAMES utf8mb4;
SET time_zone = '+09:00';

-- 사내 업무일지. 이동 원본은 사진/첨부/원본 필드 보존을 위해 유지한다.
CREATE TABLE IF NOT EXISTS work_logs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 title VARCHAR(200) NOT NULL,
 content_markdown LONGTEXT NOT NULL,
 work_date DATE NOT NULL,
 category VARCHAR(30) NOT NULL DEFAULT 'OTHER',
 author_id BIGINT UNSIGNED NOT NULL,
 source_repair_id BIGINT UNSIGNED NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 deleted_at DATETIME(6) NULL,
 UNIQUE KEY uk_work_logs_source(source_repair_id),
 CONSTRAINT fk_work_logs_author FOREIGN KEY(author_id) REFERENCES users(id),
 CONSTRAINT fk_work_logs_source FOREIGN KEY(source_repair_id) REFERENCES repair_requests(id),
 KEY idx_work_logs_date(work_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS work_log_files (
 work_log_id BIGINT UNSIGNED NOT NULL,
 file_id BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY(work_log_id,file_id),
 FOREIGN KEY(work_log_id) REFERENCES work_logs(id),
 FOREIGN KEY(file_id) REFERENCES files(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations(version) VALUES('011_work_logs');
