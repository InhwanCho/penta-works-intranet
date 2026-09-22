# Intranet database

MariaDB 10.11용 단일 DB 구성입니다. 개발과 운영에서 같은 DB를 사용합니다.

## 실행

```bash
cp .env.example .env
# .env의 비밀번호를 변경
docker compose up -d database
```

초기 스키마는 빈 볼륨을 처음 생성할 때 `database/init/001_schema.sql`에서 적용됩니다.
이미 만들어진 DB를 변경할 때는 초기화 파일을 수정하지 않고 순번이 붙은 마이그레이션 파일을 추가합니다.

`002_service_schema.sql`은 Pentaservice Firestore 이관 대상 테이블과 기존 서비스 기록 확장 컬럼을 추가합니다. 기존 운영 DB에는 배포 전에 백업한 뒤 이 SQL을 한 번 적용해야 하며, SQL 적용만으로 Firebase 데이터가 복사되지는 않습니다.

관리자 계정 2개는 비밀번호가 정해진 뒤 BCrypt 또는 Argon2 해시로 생성합니다. 로그인 정보가 저장소에 남지 않도록 초기 SQL에는 계정을 넣지 않았습니다.

Toast UI Editor 본문은 `*_markdown`에 저장합니다. 에디터에서 먼저 올린 사진은 `files`에 `TEMP`로 만들고, 글 저장 시 `file_links`를 만든 다음 `ATTACHED`로 변경합니다. 만료된 `TEMP` 파일은 주기적으로 제거합니다.
