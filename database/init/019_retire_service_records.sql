SET NAMES utf8mb4;
SET time_zone = '+09:00';

-- Retire hospital/equipment, workshop repairs and work logs.
-- Keep empty legacy tables for older controller/query compatibility.
-- deploy.sh backs up the database before applying this migration.
START TRANSACTION;

-- Accounting counterparties remain usable independently of hospital records.
UPDATE accounting_counterparties SET hospital_id=NULL WHERE hospital_id IS NOT NULL;
DELETE FROM notifications WHERE target_type IN ('HOSPITAL','REPAIR','WORK_LOG','WORKSHOP_REPAIR');
DELETE FROM file_links WHERE target_type IN ('HOSPITAL','REPAIR','WORK_LOG','WORKSHOP_REPAIR');
DELETE FROM work_log_files;
DELETE FROM work_logs;
DELETE FROM workshop_repair_files;
DELETE FROM workshop_repair_photos;
DELETE FROM workshop_repair_units;
DELETE FROM workshop_repairs;
DELETE FROM service_schedules;
DELETE FROM service_repair_components;
-- Photos, PM/ACR fields, comments and status history cascade from repairs.
DELETE FROM repair_requests;
-- Equipment/components, hospital memos and preparation items cascade here.
DELETE FROM service_hospitals;

INSERT IGNORE INTO schema_migrations(version) VALUES('019_retire_service_records');
COMMIT;
