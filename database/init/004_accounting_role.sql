SET NAMES utf8mb4;
SET time_zone = '+09:00';

ALTER TABLE users
    MODIFY COLUMN role ENUM('ADMIN', 'ACCOUNTING', 'USER') NOT NULL DEFAULT 'USER';

UPDATE users SET role='USER' WHERE login_id='root';

INSERT IGNORE INTO schema_migrations(version) VALUES('004_accounting_role');
