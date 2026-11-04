SET NAMES utf8mb4;
SET time_zone = '+09:00';
-- Destructive, forward-only cleanup. deploy.sh verifies the MREyes reader and backs up first.
-- MariaDB DDL commits implicitly; every statement is safe to resume after interruption.
DELETE FROM notifications WHERE target_type IN ('MEETING','SCHEDULE','HOSPITAL','REPAIR','WORK_LOG','WORKSHOP_REPAIR');
-- Remove retired-only file contents from API access; shared/manual/accounting files survive.
UPDATE files f SET deleted_at=COALESCE(f.deleted_at,CURRENT_TIMESTAMP(6))
WHERE EXISTS (SELECT 1 FROM file_links l WHERE l.file_id=f.id AND l.target_type IN ('MEETING','SCHEDULE','HOSPITAL','REPAIR','WORK_LOG','WORKSHOP_REPAIR'))
AND NOT EXISTS (SELECT 1 FROM file_links l WHERE l.file_id=f.id AND l.target_type NOT IN ('MEETING','SCHEDULE','HOSPITAL','REPAIR','WORK_LOG','WORKSHOP_REPAIR'))
AND NOT EXISTS (SELECT 1 FROM manual_versions v WHERE v.file_id=f.id)
AND NOT EXISTS (SELECT 1 FROM accounting_documents d WHERE d.file_id=f.id);
DELETE FROM file_links WHERE target_type IN ('MEETING','SCHEDULE','HOSPITAL','REPAIR','WORK_LOG','WORKSHOP_REPAIR');
ALTER TABLE accounting_counterparties DROP FOREIGN KEY IF EXISTS fk_ac_party_hospital;
ALTER TABLE accounting_counterparties DROP COLUMN IF EXISTS hospital_id;
-- Unused manual category structure and unpopulated checksum column.
ALTER TABLE manuals DROP FOREIGN KEY IF EXISTS fk_manuals_category;
ALTER TABLE manuals DROP COLUMN IF EXISTS category_id;
DROP TABLE IF EXISTS manual_categories;
ALTER TABLE files DROP COLUMN IF EXISTS checksum_sha256;
DROP TABLE IF EXISTS meeting_participants;
DROP TABLE IF EXISTS meetings;
DROP TABLE IF EXISTS schedules;
DROP TABLE IF EXISTS work_log_files;
DROP TABLE IF EXISTS work_logs;
DROP TABLE IF EXISTS workshop_repair_files;
DROP TABLE IF EXISTS workshop_repair_photos;
DROP TABLE IF EXISTS workshop_repair_units;
DROP TABLE IF EXISTS workshop_repairs;
DROP TABLE IF EXISTS service_repair_components;
DROP TABLE IF EXISTS service_schedules;
DROP TABLE IF EXISTS service_photos;
DROP TABLE IF EXISTS service_pm_item_fields;
DROP TABLE IF EXISTS service_pm_items;
DROP TABLE IF EXISTS service_pm_inspections;
DROP TABLE IF EXISTS service_acr_fields;
DROP TABLE IF EXISTS service_acr_pulse_values;
DROP TABLE IF EXISTS service_acr_inspections;
DROP TABLE IF EXISTS repair_comments;
DROP TABLE IF EXISTS repair_status_history;
DROP TABLE IF EXISTS repair_requests;
DROP TABLE IF EXISTS service_prep_items;
DROP TABLE IF EXISTS service_hospital_contacts;
DROP TABLE IF EXISTS service_hospital_memos;
DROP TABLE IF EXISTS service_equipment_components;
DROP TABLE IF EXISTS service_equipment;
DROP TABLE IF EXISTS service_hospitals;
INSERT IGNORE INTO schema_migrations(version) VALUES('020_remove_retired_tables');
