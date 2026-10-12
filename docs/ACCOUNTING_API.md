# 회계 계좌조회·카드 업로드

## 화면

office 회계 메뉴에서 계좌내역/카드내역을 이용한다. 이전 가상 회계 대시보드는 코드에 미리보기로 남겨두었지만 실제 회계 진입 화면에는 가상 금액을 표시하지 않는다. 자금계획·급여 등 장부 편집은 후속 구현 대상이다.

계좌: 계좌 선택 → 기간 선택. 가져오기 버튼 없이 서버가 4시간마다 수집한다. 한국 시간 00:15, 04:15, 08:15, 12:15, 16:15, 20:15에 등록 원화계좌를 조회하고 최근 90일을 중복 없이 갱신한다. 서버 시작 20초 후에도 한 번 실행한다. DB advisory lock으로 동시 서버의 중복 실행을 막고 계좌별 실패는 다른 계좌를 중단하지 않는다. 활성 ADMIN 중 첫 ID를 감사로그 주체로 사용하며 일반 사용자 세션은 필요하지 않다. 은행별 최근 성공·오류를 화면에 표시하고 화면은 1분마다 저장 데이터를 갱신한다. 저장된 거래는 전체/계좌별로 50건씩 조회하며 기간 전체 입금·출금 합계를 표시한다. 기간은 최대 200일이다. 바로빌 자체 은행 수집 시각과 별개이며 현재 외화계좌는 제외한다.

카드 목록은 `/accounting/cards`, 업로드는 `/accounting/cards/upload`로 분리한다. BC/하나 선택 → 파일 선택 → 파일 내용 확인 → 확인한 내역 저장 순서다. 최대 5MB/20,000건이다. 미리보기는 처음 100건, 건수와 합계는 파일 전체 기준이다. 잘못된 행은 파일 전체를 거절하고 오류 시트/행을 표시한다. 수식 행과 전체 카드번호가 노출된 파일은 받지 않는다. 검증 시 파일을 서버에 보관하지 않고 저장 시 다시 파싱하며 해시를 비교한다.

목록의 업로드·삭제 관리에서 파일별 전체 되돌리기와 항목 제거·복원을 제공한다. 신규 거래는 소프트 삭제하고, 갱신 거래는 업로드 직전 스냅샷으로 복원한다. 중복·변경 없는 거래는 그대로 유지한다. 같은 거래가 나중에 변경·제거·복원됐거나 장부·지급에 연결되면 파일 전체를 롤백하지 않고 트랜잭션을 취소한다. 삭제는 복원 가능하며 같은 파일을 재업로드해 수동 제거 거래가 조용히 되살아나지 않는다. 업로드 롤백으로 제거한 거래는 수정 파일을 다시 업로드해 반영할 수 있다. 최근 업로드 100개와 제거 거래 100개를 표시한다.

015 이전 파일은 이전 값이 없으므로 마이그레이션 시 최신 source_filename 기준의 baseline 이력으로 묶는다. 해당 파일은 현재 내역 제거·개별 복원만 제공하고 과거 갱신 값 복원을 약속하지 않는다. 제거는 카드 거래 이외의 장부·파일 원본을 삭제하지 않는다.

Spring Session JDBC로 세션을 DB에 보관한다. PENTA_SESSION 쿠키의 HttpOnly/Secure/SameSite 설정과 12시간 비활동 만료는 유지한다. 서버 재시작 이후에도 로그인 상태가 유지되며 기존 비밀번호 변경·비활성화·권한 변경 검사와 로그아웃 무효화도 유지한다. 최초 메모리→DB 전환에서 기존 로그인 세션은 한 번 재로그인이 필요하다.

제공된 2026-10-08 BC 파일 19행, 하나 파일 20행을 실제 MariaDB에서 검증했다. 두 파일의 취소 반영 합계는 1,900,233원이고 재업로드 시 39행이 추가로 생기지 않는다. 금융거래만 저장하며 계정과목·비용 장부·지급 연결을 자동 생성하지 않는다. 거래를 비용으로 자동 인식하지 않으므로 카드대금 출금 등과 중복 비용을 만들지 않는다.

## 서버 설정

`.env.example`의 다음 값을 실제 비공개 환경파일에 설정한다. Docker Compose backend에 전달되므로 설정 변경 후 backend 컨테이너를 다시 생성해야 한다.

- BAROBILL_CERT_KEY: 환경에 맞는 연동인증키
- BAROBILL_CORP_NUM: 조회 회원사 사업자번호, 숫자 10자리
- BAROBILL_USER_ID: 바로빌 회원 ID
- BAROBILL_ENVIRONMENT: production 또는 test
- ACCOUNTING_ENCRYPTION_KEY: AES-256용 무작위 32바이트의 Base64
- ACCOUNTING_IDENTITY_KEY: 다른 무작위 32바이트의 Base64(HMAC 식별)
- ACCOUNTING_AUTO_SYNC_ENABLED: true(기본값), false는 자동 수집 중지

두 키는 각각 `openssl rand -base64 32`로 생성하고 DB 백업과 함께 복구 가능한 별도 비공개 장소에 보관한다. 기존 계좌가 저장된 후 키를 임의 교체하면 복호화 및 동일 계좌 매핑이 깨지므로 키 교체는 별도 이관 작업이다. 인증키·암호화키는 Git 및 API 응답에 포함하지 않는다.

바로빌 GetBankAccountEx2 응답의 계좌 비밀번호·빠른조회 ID/비밀번호·식별번호는 사용하거나 저장하지 않는다. 계좌번호는 암호화하고 거래 원본 JSON에서는 제거한다. 사용자 화면에는 마스킹 번호만 반환한다.

## API

모든 경로는 `/api/v1/accounting` 아래이며 ADMIN/ACCOUNTING 세션이 필요하다. 변경 요청은 기존 CSRF 검사를 따른다. 일반 USER와 MREYES 연동키는 회계 API에 접근할 수 없다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | /status | DB 적용 및 바로빌 설정 여부, 환경 |
| GET | /bank-accounts | 저장된 원화 계좌 목록 |
| POST | /bank-accounts/refresh | 바로빌에서 사용 중인 원화 계좌 등록 |
| POST | /bank-transactions/sync | JSON accountId/from/to로 전체 페이지 수집 |
| GET | /bank-transactions | from/to/source/page 조건의 목록 및 기간 합계 |
| GET | /cards | 저장된 카드 목록 |
| GET | /card-transactions | from/to/source/page 조건의 목록 및 기간 합계 |
| POST | /card-import/preview | multipart file/issuer로 검증 |
| POST | /card-import/commit | multipart file/issuer/fileHash로 반영 |
| GET | /card-uploads | 업로드 이력 및 기존 파일별 제거 단위 |
| POST | /card-uploads/{id}/rollback | 파일 단위 되돌리기 |
| DELETE | /card-transactions/{id} | 복원 가능한 항목 제거 |
| GET | /card-transactions/removed | 제거한 거래 목록 |
| POST | /card-transactions/{id}/restore | 항목 복원 |

issuer는 BC/HANA이고 날짜는 YYYY-MM-DD다. 동일 계좌번호의 TransRefKey를 중복키로 사용한다. 조회 페이지 수/건수가 변경되거나 최종 합계가 맞지 않으면 전체 조회를 실패 처리한다. API 호출을 모두 마친 뒤 DB 트랜잭션으로 저장하며 중간 오류는 롤백한다. 조회 오류는 공급자 오류 코드와 안내만 반환하며 SOAP 내용·인증정보를 노출하지 않는다.

카드번호는 카드사와 마스킹 번호를 조합한 import_identity로 연결한다. 기존 수동 등록 카드가 여러 개 일치하면 자동 병합하지 않고 거절한다. BC의 신규/취소는 별도 이벤트이며 하나는 동일 승인 거래의 상태를 갱신한다. 같은 거래 키가 한 파일에 두 번 나타나면 임의로 무시하지 않고 검토를 요청한다. 지급 연결된 원본 금액 변경도 자동 갱신하지 않는다.

변경된 금융거래의 이전/이후 값과 수집 요약은 기존 audit_logs에 기록한다. 카드 취소 원승인은 같은 카드·승인번호·승인일의 승인이 한 건일 때만 연결한다. 업로드와 조회는 장부 분류·메모를 덮어쓰지 않는다.

## 검증

일반 검증: backend `./gradlew test bootJar`, frontend `pnpm typecheck`, `pnpm lint`, `pnpm build`.

실제 MariaDB 통합 검증은 별도 로컬 서버에 `ACCOUNTING_TEST_DB_URL=jdbc:mariadb://127.0.0.1:포트/mysql`을 설정해 `./gradlew test --tests '*accounting.*' --rerun-tasks`로 실행한다. 테스트는 자체 임시 DB를 만들고 끝나면 삭제한다. `ACCOUNTING_SAMPLE_DIR`에 사용자가 제공한 카드 파일 디렉터리를 설정하면 원본 두 파일의 합계·재업로드도 검증한다. 원본 금융 자료를 저장소의 테스트 fixture로 복사하지 않는다.

바로빌 공식 규격: https://dev.barobill.co.kr/docs/references/계좌조회-API

운영 SOAP WSDL: https://ws.baroservice.com/BANKACCOUNT.asmx?WSDL
