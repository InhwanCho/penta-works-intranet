SET NAMES utf8mb4;
SET time_zone = '+09:00';

CREATE TABLE IF NOT EXISTS service_equipment (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    hospital_id BIGINT UNSIGNED NOT NULL,
    source_system VARCHAR(30) NULL,
    source_id VARCHAR(160) NULL,
    equipment_type VARCHAR(50) NOT NULL DEFAULT 'MRI',
    manufacturer VARCHAR(100) NULL,
    model VARCHAR(200) NULL,
    serial_number VARCHAR(100) NULL,
    magnetic_field_tesla VARCHAR(20) NULL,
    software_version VARCHAR(100) NULL,
    installed_at DATE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_service_equipment_hospital FOREIGN KEY (hospital_id) REFERENCES service_hospitals (id) ON DELETE CASCADE,
    UNIQUE KEY uk_service_equipment_source (source_system, source_id),
    KEY idx_service_equipment_hospital_status (hospital_id, status, deleted_at),
    KEY idx_service_equipment_serial (serial_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_equipment_components (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    equipment_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(200) NOT NULL,
    component_type VARCHAR(100) NULL,
    part_number VARCHAR(100) NULL,
    serial_number VARCHAR(100) NULL,
    installed_at DATE NULL,
    replaced_at DATE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    notes LONGTEXT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_service_component_equipment FOREIGN KEY (equipment_id) REFERENCES service_equipment (id) ON DELETE CASCADE,
    KEY idx_service_component_equipment_status (equipment_id, status, deleted_at),
    KEY idx_service_component_serial (serial_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 기존 systems_json 배열을 장비 행으로 한 번 이관한다.
INSERT INTO service_equipment (
    hospital_id, source_system, source_id, manufacturer, model, serial_number,
    magnetic_field_tesla, software_version, installed_at
)
SELECT
    h.id,
    COALESCE(h.source_system, 'intranet'),
    CONCAT(COALESCE(h.source_id, CAST(h.id AS CHAR)), ':system:', equipment.item_number),
    NULLIF(equipment.vendor, ''),
    NULLIF(equipment.model, ''),
    NULLIF(equipment.serial_number, ''),
    NULLIF(equipment.tesla, ''),
    NULLIF(equipment.software_version, ''),
    STR_TO_DATE(NULLIF(equipment.install_date, ''), '%Y-%m-%d')
FROM service_hospitals h
JOIN JSON_TABLE(
    COALESCE(h.systems_json, JSON_ARRAY()),
    '$[*]' COLUMNS (
        item_number FOR ORDINALITY,
        vendor VARCHAR(100) PATH '$.vendor' NULL ON EMPTY,
        model VARCHAR(200) PATH '$.model' NULL ON EMPTY,
        serial_number VARCHAR(100) PATH '$.serial' NULL ON EMPTY,
        tesla VARCHAR(20) PATH '$.tesla' NULL ON EMPTY,
        software_version VARCHAR(100) PATH '$.swVersion' NULL ON EMPTY,
        install_date VARCHAR(20) PATH '$.installDate' NULL ON EMPTY
    )
) equipment
WHERE h.deleted_at IS NULL
ON DUPLICATE KEY UPDATE
    hospital_id=VALUES(hospital_id),
    manufacturer=VALUES(manufacturer),
    model=VALUES(model),
    serial_number=VALUES(serial_number),
    magnetic_field_tesla=VALUES(magnetic_field_tesla),
    software_version=VALUES(software_version),
    installed_at=VALUES(installed_at),
    deleted_at=NULL;

INSERT IGNORE INTO schema_migrations(version) VALUES('005_service_equipment');
