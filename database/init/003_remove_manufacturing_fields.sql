SET NAMES utf8mb4;
SET time_zone = '+09:00';

ALTER TABLE repair_requests
    DROP COLUMN IF EXISTS manufacture_country,
    DROP COLUMN IF EXISTS manufacture_date,
    DROP COLUMN IF EXISTS manufacturer;

INSERT IGNORE INTO schema_migrations(version) VALUES('003_remove_manufacturing_fields');
