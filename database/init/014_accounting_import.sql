SET NAMES utf8mb4;
SET time_zone = '+09:00';
-- A stable import mapping avoids duplicate cards during simultaneous uploads.
-- Existing manually registered cards keep NULL until explicitly matched.
ALTER TABLE accounting_cards
 ADD COLUMN IF NOT EXISTS import_identity CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uk_ac_card_import_identity ON accounting_cards(import_identity);
INSERT IGNORE INTO schema_migrations(version) VALUES('014_accounting_import');
