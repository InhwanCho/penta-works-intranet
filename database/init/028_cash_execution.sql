SET NAMES utf8mb4;
ALTER TABLE accounting_cash_plans
 ADD COLUMN IF NOT EXISTS execution_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN IF NOT EXISTS execution_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN IF NOT EXISTS match_keywords VARCHAR(500) NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS match_days INT NOT NULL DEFAULT 7,
 ADD COLUMN IF NOT EXISTS review_note VARCHAR(1000) NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS reviewed_by BIGINT UNSIGNED NULL,
 ADD COLUMN IF NOT EXISTS reviewed_at DATETIME(6) NULL;
-- Preserve previously confirmed exact settlements as completed executions.
UPDATE accounting_cash_plans p JOIN accounting_ledger_entries e ON e.id=p.ledger_entry_id
SET p.execution_confirmed=TRUE,p.execution_reviewed=TRUE
WHERE e.amount>0 AND e.amount <= (SELECT COALESCE(SUM(a.allocated_amount),0) FROM accounting_payment_allocations a WHERE a.ledger_entry_id=e.id AND a.status='CONFIRMED')
AND NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version='028_cash_execution');
INSERT IGNORE INTO schema_migrations(version) VALUES('028_cash_execution');
