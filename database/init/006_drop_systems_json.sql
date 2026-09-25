SET NAMES utf8mb4;
SET time_zone = '+09:00';

-- 005에서 장비를 service_equipment로 이관했으므로 중복 JSON 원본을 제거한다.
ALTER TABLE service_hospitals DROP COLUMN IF EXISTS systems_json;

INSERT IGNORE INTO schema_migrations(version) VALUES('006_drop_systems_json');
