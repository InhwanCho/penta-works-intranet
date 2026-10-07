SET NAMES utf8mb4;
SET time_zone = '+09:00';
CREATE TABLE IF NOT EXISTS workshop_repairs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 equipment_name VARCHAR(200) NOT NULL,
 description_markdown LONGTEXT NOT NULL,
 work_date DATE NOT NULL,
 quantity INT UNSIGNED NOT NULL DEFAULT 1,
 status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
 author_id BIGINT UNSIGNED NOT NULL,
 source_repair_id BIGINT UNSIGNED NULL,
 source_system VARCHAR(30) NULL,
 source_id VARCHAR(128) NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 deleted_at DATETIME(6) NULL,
 UNIQUE KEY uk_workshop_repair_source(source_repair_id),
 UNIQUE KEY uk_workshop_external_source(source_system,source_id),
 CONSTRAINT fk_workshop_author FOREIGN KEY(author_id) REFERENCES users(id),
 CONSTRAINT fk_workshop_source FOREIGN KEY(source_repair_id) REFERENCES repair_requests(id),
 KEY idx_workshop_status_date(status,work_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS workshop_repair_units (
 repair_id BIGINT UNSIGNED NOT NULL,
 unit_no INT UNSIGNED NOT NULL,
 serial_number VARCHAR(100) NULL,
 status VARCHAR(30) NOT NULL,
 fault_axis VARCHAR(10) NULL,
 test_result LONGTEXT NULL,
 PRIMARY KEY(repair_id,unit_no),
 CONSTRAINT fk_workshop_unit FOREIGN KEY(repair_id) REFERENCES workshop_repairs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS workshop_repair_files (
 repair_id BIGINT UNSIGNED NOT NULL,
 file_id BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY(repair_id,file_id),
 CONSTRAINT fk_workshop_file_parent FOREIGN KEY(repair_id) REFERENCES workshop_repairs(id),
 CONSTRAINT fk_workshop_file FOREIGN KEY(file_id) REFERENCES files(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS workshop_repair_photos (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 repair_id BIGINT UNSIGNED NOT NULL,
 source_system VARCHAR(30) NULL,
 source_id VARCHAR(128) NULL,
 original_name VARCHAR(255) NULL,
 mime_type VARCHAR(100) NOT NULL,
 image_data LONGBLOB NOT NULL,
 width_px INT UNSIGNED NULL,
 height_px INT UNSIGNED NULL,
 source_created_at DATETIME(6) NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uk_workshop_photo_source(source_system,source_id),
 CONSTRAINT fk_workshop_photo_parent FOREIGN KEY(repair_id) REFERENCES workshop_repairs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO schema_migrations(version) VALUES('012_workshop_repairs');
