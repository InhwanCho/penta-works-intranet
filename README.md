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
- 사진을 포함한 수리 요청과 상태 이력
- 병원·MRI 장비 기준정보와 PM·수리·ACR·Cold Head 서비스 기록
- PDF 업무 매뉴얼 업로드 및 다운로드
- 회사·휴가·개인 일정
- 사이트 내부 알림
- 사용자와 관리자 전용 비상연락망
- 생성·수정·다운로드 감사 로그

파일은 최대 20MB이며 서버의 전용 Docker 볼륨에 저장됩니다.

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
