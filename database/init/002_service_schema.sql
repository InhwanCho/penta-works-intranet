SET NAMES utf8mb4;
SET time_zone = '+09:00';

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) NOT NULL,
    applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Firebase pentaservice 데이터를 받을 병원/장비 기준정보.
-- source_id에는 Firestore 문서 ID를 그대로 보존한다.
CREATE TABLE service_hospitals (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    source_system VARCHAR(30) NULL,
    source_id VARCHAR(128) NULL,
    code VARCHAR(50) NULL,
    name VARCHAR(200) NOT NULL,
    region VARCHAR(100) NULL,
    address VARCHAR(500) NULL,
    notes LONGTEXT NULL,
    pm_interval_months INT UNSIGNED NOT NULL DEFAULT 6,
    pm_override DATE NULL,
    acr_full_override DATE NULL,
    acr_doc_override DATE NULL,
    contacts_json JSON NULL,
    systems_json JSON NULL,
    source_created_at DATETIME(6) NULL,
    source_updated_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_service_hospitals_source (source_system, source_id),
    KEY idx_service_hospitals_name (name),
    KEY idx_service_hospitals_region (region)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE repair_requests
    ADD COLUMN hospital_id BIGINT UNSIGNED NULL AFTER id,
    ADD COLUMN source_system VARCHAR(30) NULL AFTER hospital_id,
    ADD COLUMN source_id VARCHAR(128) NULL AFTER source_system,
    ADD COLUMN source_payload JSON NULL AFTER source_id,
    ADD COLUMN service_title VARCHAR(200) NULL AFTER service_type,
    ADD COLUMN engineer_name VARCHAR(100) NULL AFTER service_title,
    ADD COLUMN symptom LONGTEXT NULL AFTER engineer_name,
    ADD COLUMN follow_up LONGTEXT NULL AFTER remarks,
    ADD COLUMN he_level VARCHAR(50) NULL AFTER follow_up,
    ADD COLUMN counts_as_pm BOOLEAN NOT NULL DEFAULT FALSE AFTER he_level,
    ADD COLUMN coldhead_position VARCHAR(100) NULL AFTER counts_as_pm,
    ADD COLUMN coldhead_serial VARCHAR(100) NULL AFTER coldhead_position,
    ADD COLUMN coldhead_in_date DATE NULL AFTER coldhead_serial,
    ADD COLUMN pm_json JSON NULL AFTER coldhead_in_date,
    ADD COLUMN acr_full_json JSON NULL AFTER pm_json,
    ADD COLUMN source_deleted_at DATETIME(6) NULL AFTER acr_full_json,
    ADD CONSTRAINT fk_repair_requests_hospital FOREIGN KEY (hospital_id) REFERENCES service_hospitals (id) ON DELETE SET NULL,
    ADD UNIQUE KEY uk_repair_requests_source (source_system, source_id),
    ADD KEY idx_repair_requests_hospital_work (hospital_id, work_date),
    ADD KEY idx_repair_requests_service_type (service_type);

CREATE TABLE service_photos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    repair_id BIGINT UNSIGNED NOT NULL,
    source_system VARCHAR(30) NULL,
    source_id VARCHAR(128) NULL,
    original_name VARCHAR(255) NULL,
    mime_type VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
    image_data LONGBLOB NOT NULL,
    width_px INT UNSIGNED NULL,
    height_px INT UNSIGNED NULL,
    source_created_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_service_photos_repair FOREIGN KEY (repair_id) REFERENCES repair_requests (id) ON DELETE CASCADE,
    UNIQUE KEY uk_service_photos_source (source_system, source_id),
    KEY idx_service_photos_repair (repair_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_prep_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    hospital_id BIGINT UNSIGNED NOT NULL,
    source_system VARCHAR(30) NULL,
    source_id VARCHAR(128) NULL,
    text VARCHAR(500) NOT NULL,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    done_at DATETIME(6) NULL,
    source_created_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_service_prep_hospital FOREIGN KEY (hospital_id) REFERENCES service_hospitals (id) ON DELETE CASCADE,
    UNIQUE KEY uk_service_prep_source (source_system, source_id),
    KEY idx_service_prep_hospital_done (hospital_id, done, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_schedules (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    hospital_id BIGINT UNSIGNED NOT NULL,
    source_system VARCHAR(30) NULL,
    source_id VARCHAR(128) NULL,
    scheduled_date DATE NOT NULL,
    service_type VARCHAR(50) NOT NULL DEFAULT 'ETC',
    note VARCHAR(1000) NULL,
    created_by BIGINT UNSIGNED NULL,
    source_created_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_service_schedules_hospital FOREIGN KEY (hospital_id) REFERENCES service_hospitals (id) ON DELETE CASCADE,
    CONSTRAINT fk_service_schedules_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
    UNIQUE KEY uk_service_schedules_source (source_system, source_id),
    KEY idx_service_schedules_date (scheduled_date, service_type),
    KEY idx_service_schedules_hospital_date (hospital_id, scheduled_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations(version) VALUES('002_service_schema');
