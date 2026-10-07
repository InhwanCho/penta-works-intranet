# PENTA OFFICE

PENTA WORKS 사내 업무 포털입니다.

```text
frontend/   Next.js 15 관리자형 UI, Toast UI Editor
backend/    Spring Boot 3, Spring Security 세션, MariaDB
database/   MariaDB 10.11 초기 스키마
deploy/     Docker, Nginx, 백업 및 배포 스크립트
jenkins/    Jenkins 운영 잡 정의
```

## 주요 기능

- 공지사항과 통합 검색
- 사진을 포함한 Markdown 회의록 및 참여자 관리
- 사진을 포함한 정비기록, 재방문 상태와 30일 휴지통
- 병원·MRI 장비·부품 기준정보와 PM·수리·ACR·Cold Head 서비스 기록
- PM 체크리스트, ACR 자동 계산·판정, 병원별 서비스 일정 달력
- 정비 부품 연결, 병원 메모, CSV 내보내기와 인쇄/PDF
- PDF 업무 매뉴얼 업로드 및 다운로드
- 회사·휴가·개인 일정
- 사이트 내부 알림
- 사용자와 관리자 전용 비상연락망
- 생성·수정·다운로드 감사 로그

일반 첨부파일은 최대 20MB이며 서버의 전용 Docker 볼륨에 저장됩니다. 정비 사진은 장당 20MB·기록당
20장까지 받고, 서버에서 긴 변 1920px 이미지와 480px 썸네일로 변환해 DB에 보관합니다.

## 로컬 검증

```bash
cd backend && JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew test
cd frontend && pnpm install && pnpm lint && pnpm typecheck && pnpm build
```

## 운영

- URL: `https://office.pentaworks.net`
- 앱 디렉터리: `/home/inhwan/apps/pentaworks-intranet`
- 시크릿: `/home/inhwan/pentaworks-secrets/intranet.env`
- 백업: `/home/inhwan/backups/pentaworks-intranet`

`main` 브랜치가 변경되면 Jenkins가 검증 후 서버에서 Docker Compose 배포를 실행합니다.
MREyes 연동 파이프라인은 Jenkins Secret Text 자격증 `mreyes-office-api-key`를 사용합니다. 배포 시 이 값을 운영 환경파일의 `MREYES_API_KEY`로 저장하며 소스와 빌드 로그에는 남기지 않습니다.
DB와 첨부파일은 매일 백업하며 자동 삭제하지 않습니다.

MREyes에서는 `GET /api/v1/integrations/mreyes/sites/{siteId}`로 사이트·장비·부품·정비이력을 읽습니다. 이 경로는 `X-MREyes-Api-Key` 헤더를 사용하는 GET 전용 서버 간 API이며 작성·수정·삭제 기능을 제공하지 않습니다.
정비이력 응답에는 작업 사진 메타데이터가 포함되며, 실제 사진은 같은 API 키로 `GET /api/v1/integrations/mreyes/sites/{siteId}/maintenance/{maintenanceId}/photos/{photoId}`를 호출해 읽습니다. 사이트와 정비기록 소속을 함께 확인하므로 다른 사이트 사진 ID를 조합해서 조회할 수 없습니다.

## Firebase 데이터 이관 준비

`database/init/002_service_schema.sql`은 기존 Pentaservice Firestore의 `hospitals`, `logs`, `photos`, `prep`, `schedule` 컬렉션을 받을 구조를 추가합니다. `source_system`과 `source_id`로 Firestore 문서 ID를 보존하며 PM·ACR 중첩 데이터는 JSON으로 손실 없이 저장할 수 있습니다. 이 파일은 스키마만 준비하며 Firebase 데이터를 자동으로 읽거나 이관하지 않습니다.

## 프런트엔드 데이터 캐시

TanStack Query에서 목록·상세·작성 화면의 조회를 공유합니다. 일반 조회는 5분 동안 재사용하고 사용하지 않는 캐시는 1시간 후 정리합니다. 인증/알림은 30초, 대시보드/일정은 1분 기준으로 갱신합니다. 오래된 조회는 화면 복귀 시 기존 내용을 유지하면서 다시 가져옵니다.

저장·수정·삭제 성공 시 해당 리소스와 대시보드·검색·알림 캐시를 무효화합니다. 로그인·로그아웃·세션 만료 시 메모리 캐시를 초기화하며, 업무 데이터 캐시는 브라우저 저장소에 영구 보관하지 않습니다. API 조회는 `useApiQuery`, 명령형 조회/변경은 `api`를 사용해 같은 캐시 규칙을 적용합니다.

## 업무일지 및 기존 서비스 기록 분류

사내행사·공구 정리·사내업무는 업무일지에서 관리합니다. 병원 서비스 기록은 병원·장비 상세에서 작성/조회합니다. 기존 GitHub 서비스의 DB를 이관할 때는 [업무일지 마이그레이션 지침](database/WORK_LOG_MIGRATION.md)을 먼저 확인하고 `011_work_logs.sql`을 배포 전에 적용하세요. 원본 기록·사진을 보존하면서 업무일지로 이동하며, MREyes에는 병원 서비스 이력만 제공합니다.

사무실 장비·부품 수리 및 테스트는 별도 **수리 기록** 메뉴에서 관리합니다. 개별 장비마다 테스트 필요/실패/수리 완료와 오류 축을 기록할 수 있습니다. [수리 기록 이관 지침](database/WORKSHOP_REPAIR_MIGRATION.md)에 기존 작성 기록과 VRE/Gradient 2EA 처리 기준을 남겼습니다. 새 코드 배포에는 `012_workshop_repairs.sql`까지 적용해야 합니다.

주간 회의록은 매주 첫 근무일의 회의에서 지난주 업무를 공유하도록 회의일/보고 기간과 ‘지난주 진행 내용·진행 중인 일/이슈·이번 주/예정 작업’을 구분합니다. 기존 기록 및 참석자·첨부의 이관 기준은 [주간 회의록 운영 문서](database/WEEKLY_MEETINGS.md)를 참고하세요.

배포 스크립트는 011/012 스키마를 확인한 뒤 업무일지 분류 SQL을 트랜잭션으로 실행합니다. 분류 SQL의 원본은 `backend/src/main/resources/db/maintenance/classify-work-logs.sql`이며 `scripts/classify-work-logs.sql`은 같은 파일을 가리킵니다.
