SET NAMES utf8mb4;
SET time_zone = '+09:00';

ALTER TABLE repair_requests
    DROP COLUMN manufacture_country,
    DROP COLUMN manufacture_date,
    DROP COLUMN manufacturer;

INSERT IGNORE INTO schema_migrations(version) VALUES('003_remove_manufacturing_fields');
