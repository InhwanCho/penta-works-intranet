# PENTA OFFICE

7인 규모의 PENTA WORKS 사내 포털입니다.

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
DB와 첨부파일은 매일 백업하며 자동 삭제하지 않습니다.
