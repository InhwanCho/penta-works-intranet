ALTER TABLE accounting_tax_invoices ADD COLUMN IF NOT EXISTS issued_at DATETIME NULL;
INSERT IGNORE INTO schema_migrations(version) VALUES('031_invoice_issue_time');
