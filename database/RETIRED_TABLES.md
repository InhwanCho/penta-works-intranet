# 020: MREyes 회의록 조회 및 미사용 스키마 삭제

회의록 원본은 운영 MREyes의 `workspace_meeting`이다. `database/integrations/mreyes-meeting-view.sql`을 MREyes 운영 DB에 적용하고 `office_meeting_read` 뷰에만 SELECT 권한이 있는 전용 계정을 만든다. 뷰에서 활성 PENTAWORKS 회사와 미삭제 회의록만 노출한다. 계정에 원본 테이블, INSERT/UPDATE/DELETE/DDL 권한을 부여하지 않는다. 운영 환경파일의 `MREYES_MEETINGS_DB_URL`, `MREYES_MEETINGS_DB_USERNAME`, `MREYES_MEETINGS_DB_PASSWORD`를 설정한다. 기본 DB 네트워크는 `pentaworks_default`이며 `MREYES_DATABASE_NETWORK`로 변경할 수 있다. 개발에도 운영 회의록을 읽을 경우 반드시 동일한 읽기 전용 계정을 사용한다.

인트라넷은 GET `/api/v1/meetings`, `/api/v1/meetings/{id}`만 제공한다. 쓰기는 관리자도 금지한다. 대시보드와 통합 검색도 같은 뷰를 사용한다. 연결 실패는 오류로 표시하며 로컬 회의록으로 대체하지 않는다. MREyes와 동일한 본문 변환·정화 함수와 목록/상세 구성을 사용한다. 일정 메뉴 및 일정 URL, 회의록 작성/수정 URL은 제거/이동한다. 사내 업무 그룹은 회계보다 위에 표시한다.

020은 기존 회의록/참석자, 일정, 병원·장비·부품·서비스·PM·ACR·사진·준비물, 사내 업무일지, 사무실 수리 기록과 연결 테이블 27개 및 미사용 매뉴얼 분류 테이블 1개를 삭제한다. `accounting_counterparties.hospital_id`, `manuals.category_id`, `files.checksum_sha256`도 제거한다. 매뉴얼의 기존 설명 본문은 보존한다. 회계·사용자·세션·공지·매뉴얼·공용 파일·감사 로그는 유지한다. 폐기 대상에만 연결된 파일은 삭제 상태로 표시하여 기존 파일 API로 열리지 않게 한다. 물리 파일은 백업/공용 파일 보존 정책에 따라 남긴다.

배포 순서: 읽기 계정 설정 → `deploy/check-meeting-reader.sh ENV_FILE` → DB/업로드 백업 → 새 이미지 빌드 → 기존 앱 정지 → 020 적용 → 새 앱 시작 → 로그인·회의록·대시보드·검색·회계 확인. MariaDB DDL은 자동 커밋이므로 실패 시 트랜잭션 롤백할 수 없다. 각 DROP은 재실행 가능하다. 이전 코드로 되돌릴 때는 반드시 020 직전 DB 백업도 함께 복원해야 한다.

기존 서비스 컨트롤러와 해당 기능의 테스트는 제거했다. 회계 등 현재 기능의 테스트는 유지하고, 회의록 회사 격리·삭제 필터·404/503·SQL 바인딩·관리자 쓰기 금지 및 폐기 테이블 없는 대시보드/검색 검증을 추가했다.
