ALTER TABLE accounting_card_transactions
 ADD COLUMN IF NOT EXISTS alternate_event_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 ADD COLUMN IF NOT EXISTS statement_principal DECIMAL(18,2) NULL,
 ADD UNIQUE INDEX IF NOT EXISTS uk_card_alternate_event(card_id,alternate_event_key);
INSERT IGNORE INTO schema_migrations(version) VALUES('035_card_statement_match');
