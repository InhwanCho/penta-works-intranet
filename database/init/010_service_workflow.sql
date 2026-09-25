SET NAMES utf8mb4;
SET time_zone = '+09:00';

ALTER TABLE repair_requests
    MODIFY COLUMN status ENUM('RECEIVED','IN_PROGRESS','REVISIT','COMPLETED') NOT NULL DEFAULT 'RECEIVED',
    ADD COLUMN IF NOT EXISTS acr_kind VARCHAR(30) NULL AFTER service_type;

ALTER TABLE service_hospitals
    MODIFY COLUMN pm_interval_months INT UNSIGNED NOT NULL DEFAULT 2;

ALTER TABLE repair_status_history
    MODIFY COLUMN previous_status ENUM('RECEIVED','IN_PROGRESS','REVISIT','COMPLETED') NULL,
    MODIFY COLUMN new_status ENUM('RECEIVED','IN_PROGRESS','REVISIT','COMPLETED') NOT NULL;

ALTER TABLE service_photos
    ADD COLUMN IF NOT EXISTS thumbnail_data MEDIUMBLOB NULL AFTER image_data,
    ADD COLUMN IF NOT EXISTS thumbnail_width_px INT UNSIGNED NULL AFTER thumbnail_data,
    ADD COLUMN IF NOT EXISTS thumbnail_height_px INT UNSIGNED NULL AFTER thumbnail_width_px;

ALTER TABLE service_schedules
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'PLANNED' AFTER note,
    ADD COLUMN IF NOT EXISTS repair_id BIGINT UNSIGNED NULL AFTER status,
    ADD COLUMN IF NOT EXISTS completed_at DATETIME(6) NULL AFTER repair_id;

-- 배포 중 재시도해도 이미 생성된 외래키 때문에 마이그레이션이 멈추지 않게 한다.
SET @service_schedule_repair_fk_exists = (
    SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'service_schedules'
      AND CONSTRAINT_NAME = 'fk_service_schedule_repair'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @service_schedule_repair_fk_sql = IF(
    @service_schedule_repair_fk_exists = 0,
    'ALTER TABLE service_schedules ADD CONSTRAINT fk_service_schedule_repair FOREIGN KEY (repair_id) REFERENCES repair_requests (id) ON DELETE SET NULL',
    'SELECT 1'
);
PREPARE service_schedule_repair_fk_stmt FROM @service_schedule_repair_fk_sql;
EXECUTE service_schedule_repair_fk_stmt;
DEALLOCATE PREPARE service_schedule_repair_fk_stmt;

CREATE TABLE IF NOT EXISTS service_hospital_memos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    hospital_id BIGINT UNSIGNED NOT NULL,
    memo_text TEXT NOT NULL,
    sort_order INT UNSIGNED NOT NULL DEFAULT 0,
    created_by BIGINT UNSIGNED NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_service_memo_hospital FOREIGN KEY (hospital_id) REFERENCES service_hospitals (id) ON DELETE CASCADE,
    CONSTRAINT fk_service_memo_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
    KEY idx_service_memo_hospital (hospital_id, deleted_at, sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_repair_components (
    repair_id BIGINT UNSIGNED NOT NULL,
    component_id BIGINT UNSIGNED NOT NULL,
    action_type VARCHAR(30) NOT NULL DEFAULT 'CHECKED',
    quantity INT UNSIGNED NOT NULL DEFAULT 1,
    note VARCHAR(500) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (repair_id, component_id),
    CONSTRAINT fk_service_repair_component_repair FOREIGN KEY (repair_id) REFERENCES repair_requests (id) ON DELETE CASCADE,
    CONSTRAINT fk_service_repair_component_component FOREIGN KEY (component_id) REFERENCES service_equipment_components (id) ON DELETE RESTRICT,
    KEY idx_service_repair_component_component (component_id, repair_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations(version) VALUES('010_service_workflow');
