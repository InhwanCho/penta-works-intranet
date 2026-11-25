ALTER TABLE accounting_tax_invoices ADD COLUMN IF NOT EXISTS deleted_at DATETIME(6) NULL;
INSERT IGNORE INTO schema_migrations(version) VALUES('036_invoice_archive');
