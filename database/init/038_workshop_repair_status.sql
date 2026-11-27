ALTER TABLE workshop_repairs ALTER COLUMN status SET DEFAULT 'IN_PROGRESS';

START TRANSACTION;
UPDATE workshop_repairs
SET status = 'IN_PROGRESS', updated_at = updated_at
WHERE status = 'RECEIVED';

UPDATE workshop_repair_units
SET status = 'IN_PROGRESS'
WHERE status = 'RECEIVED';

INSERT IGNORE INTO schema_migrations(version) VALUES('038_workshop_repair_status');
COMMIT;
