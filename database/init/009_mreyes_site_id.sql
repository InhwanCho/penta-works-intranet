SET NAMES utf8mb4;
SET time_zone = '+09:00';

-- MREyes의 site.site와 인트라넷 병원을 1:1로 연결한다.
-- 인트라넷의 관리 코드(code)는 별도 용도이므로 변경하지 않는다.
ALTER TABLE service_hospitals
    ADD COLUMN mreyes_site_id VARCHAR(32) NULL AFTER code,
    ADD UNIQUE KEY uk_service_hospitals_mreyes_site_id (mreyes_site_id);

-- 현재 양쪽 병원명이 명확히 일치하는 항목만 연결한다.
UPDATE service_hospitals SET mreyes_site_id = '006' WHERE id = 1 AND name = '연세고든병원';
UPDATE service_hospitals SET mreyes_site_id = '018' WHERE id = 2 AND name = '바른사랑병원';
UPDATE service_hospitals SET mreyes_site_id = '003' WHERE id = 3 AND name = '광교 휴내과';
UPDATE service_hospitals SET mreyes_site_id = '015' WHERE id = 4 AND name = 'S신경1(Creator 1.5T)';
UPDATE service_hospitals SET mreyes_site_id = '020' WHERE id = 5 AND name = 'K마디병원';
UPDATE service_hospitals SET mreyes_site_id = '016' WHERE id = 6 AND name = '대구동물메디컬센터';
UPDATE service_hospitals SET mreyes_site_id = '008' WHERE id = 7 AND name = '신당 서울베스트';
UPDATE service_hospitals SET mreyes_site_id = '002' WHERE id = 8 AND name = '일등병원';
UPDATE service_hospitals SET mreyes_site_id = '013' WHERE id = 9 AND name = '수원 센텀병원';
UPDATE service_hospitals SET mreyes_site_id = '019' WHERE id = 10 AND name = '대천중앙병원';
UPDATE service_hospitals SET mreyes_site_id = '007' WHERE id = 11 AND name = '강북 우리베스트';
UPDATE service_hospitals SET mreyes_site_id = '010' WHERE id = 12 AND name = '수원참잘함';
UPDATE service_hospitals SET mreyes_site_id = '009' WHERE id = 13 AND name = '평택 으랏차정형외과 의원';
UPDATE service_hospitals SET mreyes_site_id = '012' WHERE id = 14 AND name = '강동참잘함';
UPDATE service_hospitals SET mreyes_site_id = '011' WHERE id = 15 AND name = '새길병원';
UPDATE service_hospitals SET mreyes_site_id = '021' WHERE id = 16 AND name = '원성준 영상의학과 동물병원';
UPDATE service_hospitals SET mreyes_site_id = '005' WHERE id = 17 AND name = '의정부 서울프라임';
UPDATE service_hospitals SET mreyes_site_id = '017' WHERE id = 18 AND name = '신사 우리베스트';
UPDATE service_hospitals SET mreyes_site_id = '023' WHERE id = 19 AND name = '바르다임병원';
UPDATE service_hospitals SET mreyes_site_id = '022' WHERE id = 20 AND name = '정병원';
UPDATE service_hospitals SET mreyes_site_id = '004' WHERE id = 21 AND name = '더퍼스트병원';
UPDATE service_hospitals SET mreyes_site_id = '014' WHERE id = 23 AND name = 'S신경2(Excite 1.5T)';

INSERT INTO schema_migrations(version) VALUES ('009_mreyes_site_id');
