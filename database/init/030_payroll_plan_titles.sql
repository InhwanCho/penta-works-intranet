START TRANSACTION;
UPDATE accounting_ledger_entries e
JOIN accounting_cash_plans p ON p.ledger_entry_id=e.id
SET e.title=CONCAT(TRIM(e.title),' 급여'), e.version=e.version+1
WHERE e.direction='OUT' AND e.status<>'VOID' AND p.execution_confirmed=FALSE
  AND p.card_issuer IS NULL AND e.title NOT LIKE '%급여%'
  AND TRIM(e.title) REGEXP '[^[:space:]][[:space:]]*[(](오전|오후)[)]$'
  AND CHAR_LENGTH(TRIM(e.title))<=252;
INSERT IGNORE INTO schema_migrations(version) VALUES('030_payroll_plan_titles');
COMMIT;
