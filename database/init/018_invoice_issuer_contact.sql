SET NAMES utf8mb4;
-- One-time default update only. Existing invoice issuer snapshots remain unchanged.
UPDATE accounting_invoice_issuer
SET profile_json=JSON_SET(profile_json,
    '$.contactName','조재영',
    '$.email','jycho@pentaworks.net',
    '$.tel','01038998786',
    '$.hp','01038998786'),
    version=version+1
WHERE id=1
  AND NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='018_invoice_issuer_contact');
INSERT IGNORE INTO schema_migrations(version) VALUES('018_invoice_issuer_contact');
