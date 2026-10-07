-- 011_work_logs.sql 적용 후 실행. 검토된 정확한 제목만 자동 분류한다.
-- 일반 서비스(ETC 포함)는 제목 일부가 비슷하다는 이유로 옮기지 않는다.
INSERT INTO work_logs(title,content_markdown,work_date,category,author_id,source_repair_id,created_at,updated_at)
SELECT COALESCE(NULLIF(r.service_title,''),r.equipment_name),r.description_markdown,
       COALESCE(r.work_date,r.written_at),
       CASE WHEN REPLACE(TRIM(COALESCE(NULLIF(r.service_title,''),r.equipment_name)),' ','')='환송회' THEN 'EVENT' ELSE 'TOOLS' END,
       r.requester_id,r.id,r.created_at,r.updated_at
FROM repair_requests r
WHERE r.deleted_at IS NULL AND r.source_deleted_at IS NULL
  AND REPLACE(TRIM(COALESCE(NULLIF(r.service_title,''),r.equipment_name)),' ','') IN ('환송회','복스알정리')
  AND NOT EXISTS(SELECT 1 FROM service_repair_components c WHERE c.repair_id=r.id)
  AND NOT EXISTS(SELECT 1 FROM service_schedules s WHERE s.repair_id=r.id AND s.deleted_at IS NULL)
  AND NOT EXISTS(SELECT 1 FROM work_logs w WHERE w.source_repair_id=r.id)
  AND NOT EXISTS(SELECT 1 FROM workshop_repairs w WHERE w.source_repair_id=r.id)
  AND NOT EXISTS(SELECT 1 FROM workshop_repairs w WHERE w.source_system=r.source_system AND w.source_id=r.source_id);

-- 재이관으로 원본이 활성화되어도 중복 표시를 막는다.
UPDATE repair_requests
SET deleted_at=COALESCE(deleted_at,CURRENT_TIMESTAMP(6))
WHERE EXISTS(SELECT 1 FROM work_logs w WHERE w.source_repair_id=repair_requests.id);
