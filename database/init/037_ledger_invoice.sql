ALTER TABLE accounting_cash_plans ADD COLUMN IF NOT EXISTS invoice_id BIGINT UNSIGNED NULL REFERENCES accounting_tax_invoices(id);
ALTER TABLE accounting_counterparty_ledger ADD COLUMN IF NOT EXISTS invoice_id BIGINT UNSIGNED NULL REFERENCES accounting_tax_invoices(id);
INSERT IGNORE INTO schema_migrations(version) VALUES('037_ledger_invoice');
