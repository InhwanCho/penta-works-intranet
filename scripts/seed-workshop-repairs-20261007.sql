-- 운영 DB에서 확인한 원본 2~7번: admin1 작성, 병원 미연결 사무실 수리.
-- 다른 DB에서는 원본 ID/작성자/제목/작업일 대응을 먼저 검증한다.
SET NAMES utf8mb4;
SET time_zone = '+09:00';
START TRANSACTION;
SET @workshop_author_id=(SELECT id FROM users WHERE login_id='admin1' AND active=TRUE);
INSERT INTO workshop_repairs(equipment_name,description_markdown,work_date,quantity,status,author_id,source_repair_id,created_at,updated_at)
SELECT r.equipment_name,r.description_markdown,COALESCE(r.work_date,r.written_at),1,
       CASE WHEN r.status='COMPLETED' THEN 'COMPLETED' WHEN r.status='IN_PROGRESS' THEN 'IN_PROGRESS' ELSE 'RECEIVED' END,
       r.requester_id,r.id,r.created_at,r.updated_at
FROM repair_requests r
WHERE r.id IN (2,3,4,5,6,7) AND r.requester_id=@workshop_author_id AND r.hospital_id IS NULL
  AND r.source_system IS NULL
  AND NOT EXISTS(SELECT 1 FROM workshop_repairs w WHERE w.source_repair_id=r.id)
  AND NOT EXISTS(SELECT 1 FROM work_logs w WHERE w.source_repair_id=r.id)
  AND NOT EXISTS(SELECT 1 FROM service_repair_components c WHERE c.repair_id=r.id)
  AND NOT EXISTS(SELECT 1 FROM service_schedules s WHERE s.repair_id=r.id AND s.deleted_at IS NULL);
INSERT INTO workshop_repair_units(repair_id,unit_no,status)
SELECT w.id,1,w.status FROM workshop_repairs w WHERE w.source_repair_id IN (2,3,4,5,6,7)
 AND NOT EXISTS(SELECT 1 FROM workshop_repair_units u WHERE u.repair_id=w.id);

-- 수리 완료: 요청 당시의 작업일 2026-10-07. 확인되지 않은 S/N은 기록하지 않는다.
INSERT INTO workshop_repairs(equipment_name,description_markdown,work_date,quantity,status,author_id,source_system,source_id)
SELECT 'VRE Power Supply','VRE Power Supply 2EA 수리 완료.','2026-10-07',2,'COMPLETED',@workshop_author_id,'office_request','vre-power-supply-2ea-20261007'
WHERE NOT EXISTS(SELECT 1 FROM workshop_repairs WHERE source_system='office_request' AND source_id='vre-power-supply-2ea-20261007');
INSERT INTO workshop_repair_units(repair_id,unit_no,status,test_result)
SELECT w.id,n.unit_no,'COMPLETED','수리 완료' FROM workshop_repairs w CROSS JOIN (SELECT 1 unit_no UNION ALL SELECT 2) n
WHERE w.source_system='office_request' AND w.source_id='vre-power-supply-2ea-20261007'
 AND NOT EXISTS(SELECT 1 FROM workshop_repair_units u WHERE u.repair_id=w.id AND u.unit_no=n.unit_no);

-- 기존 Firestore 이관 백업의 mum7impq1z06x: 2026-09-29 사무실 테스트 2대.
-- 병원 미연결로 이전 증분 이관에서 빠진 원본을 별도 수리 기록으로 가져온다.
INSERT INTO workshop_repairs(equipment_name,description_markdown,work_date,quantity,status,author_id,source_system,source_id)
SELECT 'Gradient Power Supply','사무실 보유 Gradient Power Supply 2EA 테스트 실패.\n1번: Over Voltage Y축 (OVY), 정상 동작 불가.\n2번: Over Voltage Z축 (OVZ), 정상 동작 불가.','2026-09-29',2,'TEST_FAILED',
 COALESCE((SELECT id FROM users WHERE login_id='sdc'),@workshop_author_id),'firebase','mum7impq1z06x'
WHERE NOT EXISTS(SELECT 1 FROM workshop_repairs WHERE source_system='firebase' AND source_id='mum7impq1z06x');
INSERT INTO workshop_repair_units(repair_id,unit_no,status,fault_axis,test_result)
SELECT w.id,n.unit_no,'TEST_FAILED',CASE WHEN n.unit_no=1 THEN 'Y' ELSE 'Z' END,
 CASE WHEN n.unit_no=1 THEN 'Over Voltage Y축 (OVY). 테스트 실패.' ELSE 'Over Voltage Z축 (OVZ). 테스트 실패.' END
FROM workshop_repairs w CROSS JOIN (SELECT 1 unit_no UNION ALL SELECT 2) n
WHERE w.source_system='firebase' AND w.source_id='mum7impq1z06x'
 AND NOT EXISTS(SELECT 1 FROM workshop_repair_units u WHERE u.repair_id=w.id AND u.unit_no=n.unit_no);
COMMIT;
