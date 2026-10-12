# 회계 계좌조회·카드 업로드

## 화면

office 회계 메뉴에서 계좌내역/카드내역을 이용한다. 이전 가상 회계 대시보드는 코드에 미리보기로 남겨두었지만 실제 회계 진입 화면에는 가상 금액을 표시하지 않는다. 자금계획·급여 등 장부 편집은 후속 구현 대상이다.

계좌: 등록 계좌 가져오기 → 원화 계좌 선택 → 기간 선택 → 선택 계좌 거래 가져오기. 저장된 거래는 전체/계좌별로 50건씩 조회하며 기간 전체 입금·출금 합계를 표시한다. 기간은 최대 200일이다. 이미 바로빌에 수집된 거래를 조회하는 API이며 은행의 즉시 잔액 조회가 아니다. 현재 외화계좌는 제외한다.

카드: BC/하나 선택 → 카드사 승인내역 XLS/XLSX 선택 → 파일 검증 → 미리보기 확인 → 검증한 내역 저장. 최대 5MB/20,000건이다. 미리보기는 처음 100건, 건수와 합계는 파일 전체 기준이다. 잘못된 행은 파일 전체를 거절하고 오류 시트/행을 표시한다. 수식 행과 전체 카드번호가 노출된 파일은 받지 않는다. 검증 시 업로드한 파일은 서버에 보관하지 않고 저장 시 다시 파싱하며 해시를 비교한다.

제공된 2026-10-08 BC 파일 19행, 하나 파일 20행을 실제 MariaDB에서 검증했다. 두 파일의 취소 반영 합계는 1,900,233원이고 재업로드 시 39행이 추가로 생기지 않는다. 금융거래만 저장하며 계정과목·비용 장부·지급 연결을 자동 생성하지 않는다. 거래를 비용으로 자동 인식하지 않으므로 카드대금 출금 등과 중복 비용을 만들지 않는다.

## 서버 설정

`.env.example`의 다음 값을 실제 비공개 환경파일에 설정한다. Docker Compose backend에 전달되므로 설정 변경 후 backend 컨테이너를 다시 생성해야 한다.

- BAROBILL_CERT_KEY: 환경에 맞는 연동인증키
- BAROBILL_CORP_NUM: 조회 회원사 사업자번호, 숫자 10자리
- BAROBILL_USER_ID: 바로빌 회원 ID
- BAROBILL_ENVIRONMENT: production 또는 test
- ACCOUNTING_ENCRYPTION_KEY: AES-256용 무작위 32바이트의 Base64
- ACCOUNTING_IDENTITY_KEY: 다른 무작위 32바이트의 Base64(HMAC 식별)

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

issuer는 BC/HANA이고 날짜는 YYYY-MM-DD다. 동일 계좌번호의 TransRefKey를 중복키로 사용한다. 조회 페이지 수/건수가 변경되거나 최종 합계가 맞지 않으면 전체 조회를 실패 처리한다. API 호출을 모두 마친 뒤 DB 트랜잭션으로 저장하며 중간 오류는 롤백한다. 조회 오류는 공급자 오류 코드와 안내만 반환하며 SOAP 내용·인증정보를 노출하지 않는다.

카드번호는 카드사와 마스킹 번호를 조합한 import_identity로 연결한다. 기존 수동 등록 카드가 여러 개 일치하면 자동 병합하지 않고 거절한다. BC의 신규/취소는 별도 이벤트이며 하나는 동일 승인 거래의 상태를 갱신한다. 같은 거래 키가 한 파일에 두 번 나타나면 임의로 무시하지 않고 검토를 요청한다. 지급 연결된 원본 금액 변경도 자동 갱신하지 않는다.

변경된 금융거래의 이전/이후 값과 수집 요약은 기존 audit_logs에 기록한다. 카드 취소 원승인은 같은 카드·승인번호·승인일의 승인이 한 건일 때만 연결한다. 업로드와 조회는 장부 분류·메모를 덮어쓰지 않는다.

## 검증

일반 검증: backend `./gradlew test bootJar`, frontend `pnpm typecheck`, `pnpm lint`, `pnpm build`.

실제 MariaDB 통합 검증은 별도 로컬 서버에 `ACCOUNTING_TEST_DB_URL=jdbc:mariadb://127.0.0.1:포트/mysql`을 설정해 `./gradlew test --tests '*accounting.*' --rerun-tasks`로 실행한다. 테스트는 자체 임시 DB를 만들고 끝나면 삭제한다. `ACCOUNTING_SAMPLE_DIR`에 사용자가 제공한 카드 파일 디렉터리를 설정하면 원본 두 파일의 합계·재업로드도 검증한다. 원본 금융 자료를 저장소의 테스트 fixture로 복사하지 않는다.

바로빌 공식 규격: https://dev.barobill.co.kr/docs/references/계좌조회-API

운영 SOAP WSDL: https://ws.baroservice.com/BANKACCOUNT.asmx?WSDL
