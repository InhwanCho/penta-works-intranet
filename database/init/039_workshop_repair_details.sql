ALTER TABLE workshop_repairs
    ADD COLUMN IF NOT EXISTS description_text LONGTEXT NULL AFTER description_markdown,
    ADD COLUMN IF NOT EXISTS hospital_name VARCHAR(200) NULL AFTER equipment_name;

INSERT IGNORE INTO schema_migrations(version) VALUES('039_workshop_repair_details');
