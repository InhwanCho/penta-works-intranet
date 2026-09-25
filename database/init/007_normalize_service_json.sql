SET NAMES utf8mb4;
SET time_zone = '+09:00';

CREATE TABLE IF NOT EXISTS service_hospital_contacts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    hospital_id BIGINT UNSIGNED NOT NULL,
    sort_order INT UNSIGNED NOT NULL,
    name VARCHAR(100) NULL,
    phone VARCHAR(50) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_service_contact_hospital FOREIGN KEY (hospital_id) REFERENCES service_hospitals (id) ON DELETE CASCADE,
    UNIQUE KEY uk_service_contact_order (hospital_id, sort_order),
    KEY idx_service_contact_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_pm_inspections (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    repair_id BIGINT UNSIGNED NOT NULL,
    checklist_version VARCHAR(30) NOT NULL DEFAULT 'firebase-v1',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_service_pm_repair FOREIGN KEY (repair_id) REFERENCES repair_requests (id) ON DELETE CASCADE,
    UNIQUE KEY uk_service_pm_repair (repair_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_pm_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    inspection_id BIGINT UNSIGNED NOT NULL,
    item_order INT UNSIGNED NOT NULL,
    section_name VARCHAR(200) NULL,
    item_kind VARCHAR(50) NULL,
    item_name VARCHAR(300) NULL,
    purpose TEXT NULL,
    result VARCHAR(100) NULL,
    comment TEXT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_service_pm_item_inspection FOREIGN KEY (inspection_id) REFERENCES service_pm_inspections (id) ON DELETE CASCADE,
    UNIQUE KEY uk_service_pm_item_order (inspection_id, item_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_pm_item_fields (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    item_id BIGINT UNSIGNED NOT NULL,
    field_order INT UNSIGNED NOT NULL,
    label VARCHAR(200) NULL,
    value_text TEXT NULL,
    input_type VARCHAR(50) NULL,
    suffix VARCHAR(50) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_service_pm_field_item FOREIGN KEY (item_id) REFERENCES service_pm_items (id) ON DELETE CASCADE,
    UNIQUE KEY uk_service_pm_field_order (item_id, field_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_acr_inspections (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    repair_id BIGINT UNSIGNED NOT NULL,
    overall_result VARCHAR(100) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_service_acr_repair FOREIGN KEY (repair_id) REFERENCES repair_requests (id) ON DELETE CASCADE,
    UNIQUE KEY uk_service_acr_repair (repair_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_acr_fields (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    inspection_id BIGINT UNSIGNED NOT NULL,
    section_key VARCHAR(50) NOT NULL,
    field_key VARCHAR(100) NOT NULL,
    value_text LONGTEXT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_service_acr_field_inspection FOREIGN KEY (inspection_id) REFERENCES service_acr_inspections (id) ON DELETE CASCADE,
    UNIQUE KEY uk_service_acr_field (inspection_id, section_key, field_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_acr_pulse_values (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    inspection_id BIGINT UNSIGNED NOT NULL,
    sequence_name VARCHAR(100) NOT NULL,
    value_order INT UNSIGNED NOT NULL,
    value_text TEXT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_service_acr_pulse_inspection FOREIGN KEY (inspection_id) REFERENCES service_acr_inspections (id) ON DELETE CASCADE,
    UNIQUE KEY uk_service_acr_pulse_order (inspection_id, sequence_name, value_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO service_hospital_contacts(hospital_id,sort_order,name,phone)
SELECT h.id,contact_row.item_number,NULLIF(contact_row.name,''),NULLIF(contact_row.phone,'')
FROM service_hospitals h
JOIN JSON_TABLE(COALESCE(h.contacts_json,JSON_ARRAY()), '$[*]' COLUMNS(
    item_number FOR ORDINALITY,
    name VARCHAR(100) PATH '$.name' NULL ON EMPTY,
    phone VARCHAR(50) PATH '$.phone' NULL ON EMPTY
)) contact_row
WHERE TRUE
ON DUPLICATE KEY UPDATE name=VALUES(name),phone=VALUES(phone),deleted_at=NULL;

INSERT INTO service_pm_inspections(repair_id)
SELECT r.id FROM repair_requests r
WHERE r.pm_json IS NOT NULL AND JSON_LENGTH(r.pm_json)>0
ON DUPLICATE KEY UPDATE checklist_version=VALUES(checklist_version);

INSERT INTO service_pm_items(inspection_id,item_order,section_name,item_kind,item_name,purpose,result,comment)
SELECT inspection.id,item_row.item_number,NULLIF(item_row.section_name,''),NULLIF(item_row.item_kind,''),
       NULLIF(item_row.item_name,''),NULLIF(item_row.purpose,''),NULLIF(item_row.result,''),NULLIF(item_row.comment,'')
FROM repair_requests r
JOIN service_pm_inspections inspection ON inspection.repair_id=r.id
JOIN JSON_TABLE(r.pm_json, '$[*]' COLUMNS(
    item_number FOR ORDINALITY,
    section_name VARCHAR(200) PATH '$.section' NULL ON EMPTY,
    item_kind VARCHAR(50) PATH '$.kind' NULL ON EMPTY,
    item_name VARCHAR(300) PATH '$.name' NULL ON EMPTY,
    purpose TEXT PATH '$.purpose' NULL ON EMPTY,
    result VARCHAR(100) PATH '$.result' NULL ON EMPTY,
    comment TEXT PATH '$.comment' NULL ON EMPTY
)) item_row
WHERE TRUE
ON DUPLICATE KEY UPDATE section_name=VALUES(section_name),item_kind=VALUES(item_kind),item_name=VALUES(item_name),
    purpose=VALUES(purpose),result=VALUES(result),comment=VALUES(comment);

INSERT INTO service_pm_item_fields(item_id,field_order,label,value_text,input_type,suffix)
SELECT item.id,field_row.field_number,NULLIF(field_row.label,''),NULLIF(field_row.value_text,''),
       NULLIF(field_row.input_type,''),NULLIF(field_row.suffix,'')
FROM repair_requests r
JOIN service_pm_inspections inspection ON inspection.repair_id=r.id
JOIN JSON_TABLE(r.pm_json, '$[*]' COLUMNS(
    item_number FOR ORDINALITY,
    NESTED PATH '$.fields[*]' COLUMNS(
        field_number FOR ORDINALITY,
        label VARCHAR(200) PATH '$.label' NULL ON EMPTY,
        value_text TEXT PATH '$.value' NULL ON EMPTY,
        input_type VARCHAR(50) PATH '$.type' NULL ON EMPTY,
        suffix VARCHAR(50) PATH '$.suffix' NULL ON EMPTY
    )
)) field_row
JOIN service_pm_items item ON item.inspection_id=inspection.id AND item.item_order=field_row.item_number
WHERE field_row.field_number IS NOT NULL
ON DUPLICATE KEY UPDATE label=VALUES(label),value_text=VALUES(value_text),input_type=VALUES(input_type),suffix=VALUES(suffix);

INSERT INTO service_acr_inspections(repair_id,overall_result)
SELECT r.id,NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.acr_full_json,'$.overall')),'')
FROM repair_requests r
WHERE r.acr_full_json IS NOT NULL AND JSON_TYPE(r.acr_full_json)='OBJECT'
ON DUPLICATE KEY UPDATE overall_result=VALUES(overall_result);

INSERT INTO service_acr_fields(inspection_id,section_key,field_key,value_text)
SELECT inspection.id,section_list.section_key,field_list.field_key,
       JSON_UNQUOTE(JSON_EXTRACT(r.acr_full_json,CONCAT('$."',section_list.section_key,'"."',field_list.field_key,'"')))
FROM repair_requests r
JOIN service_acr_inspections inspection ON inspection.repair_id=r.id
JOIN JSON_TABLE(JSON_KEYS(r.acr_full_json), '$[*]' COLUMNS(section_key VARCHAR(50) PATH '$')) section_list
JOIN JSON_TABLE(JSON_KEYS(JSON_EXTRACT(r.acr_full_json,CONCAT('$."',section_list.section_key,'"'))),
    '$[*]' COLUMNS(field_key VARCHAR(100) PATH '$')) field_list
WHERE section_list.section_key NOT IN ('overall','pulse')
ON DUPLICATE KEY UPDATE value_text=VALUES(value_text);

INSERT INTO service_acr_pulse_values(inspection_id,sequence_name,value_order,value_text)
SELECT inspection.id,sequence_list.sequence_name,pulse_value.value_number,NULLIF(pulse_value.value_text,'')
FROM repair_requests r
JOIN service_acr_inspections inspection ON inspection.repair_id=r.id
JOIN JSON_TABLE(JSON_KEYS(JSON_EXTRACT(r.acr_full_json,'$.pulse')),
    '$[*]' COLUMNS(sequence_name VARCHAR(100) PATH '$')) sequence_list
JOIN JSON_TABLE(JSON_EXTRACT(r.acr_full_json,CONCAT('$.pulse."',sequence_list.sequence_name,'"')),
    '$[*]' COLUMNS(value_number FOR ORDINALITY,value_text TEXT PATH '$')) pulse_value
WHERE TRUE
ON DUPLICATE KEY UPDATE value_text=VALUES(value_text);

INSERT IGNORE INTO schema_migrations(version) VALUES('007_normalize_service_json');
