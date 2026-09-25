SET NAMES utf8mb4;
SET time_zone = '+09:00';

ALTER TABLE service_hospitals DROP COLUMN IF EXISTS contacts_json;
ALTER TABLE repair_requests DROP COLUMN IF EXISTS pm_json;
ALTER TABLE repair_requests DROP COLUMN IF EXISTS acr_full_json;

INSERT IGNORE INTO schema_migrations(version) VALUES('008_drop_normalized_json');
