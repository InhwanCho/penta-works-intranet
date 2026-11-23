ALTER TABLE accounting_tax_invoices
    MODIFY status ENUM('DRAFT','SENDING','ISSUED','FAILED','UNKNOWN','SCHEDULED') NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN IF NOT EXISTS scheduled_date DATE NULL,
    ADD INDEX IF NOT EXISTS idx_invoice_schedule(status,scheduled_date,id);
INSERT IGNORE INTO schema_migrations(version) VALUES('032_invoice_schedule');
