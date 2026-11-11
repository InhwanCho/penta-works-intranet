ALTER TABLE accounting_cash_plans
  DROP CONSTRAINT IF EXISTS chk_cash_plan_amount,
  ADD CONSTRAINT chk_cash_plan_amount CHECK(original_amount >= 0);
INSERT IGNORE INTO schema_migrations(version) VALUES('027_cash_plan_amount_pending');
