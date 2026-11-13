import Link from "next/link";
export function CashWorkflow({ step }: { step: "plans" | "review" | "banks" }) {
  return <section className="cash-workflow" aria-label="입출금 관리 순서">
    <nav><Link href="/accounting/plans" aria-current={step === "plans" ? "page" : undefined}>1. 계획 등록·관리</Link><Link href="/accounting/review" aria-current={step === "review" ? "page" : undefined}>2. 입출금 확인</Link><Link href="/accounting/banks" aria-current={step === "banks" ? "page" : undefined}>은행거래에서 확인</Link></nav>
    <p>{step === "plans" ? "앞으로 들어오고 나갈 돈을 등록하세요. 등록한 계획은 그대로 유지되며, 실제 거래가 생기면 아래 ‘입출금 확인’ 버튼으로 완료할 수 있습니다." : step === "review" ? "등록한 계획에 맞는 통장 거래를 찾아드립니다. ‘거래 확인’을 눌러 맞는 거래를 선택하고 완료하세요. 새 계획은 ‘계획 등록·관리’에서 등록합니다." : "각 거래의 확인 상태를 보고 바로 처리하세요. 계획과 연결하거나, 계획이 없는 거래라면 사유를 남겨 확인할 수 있습니다."}</p>
  </section>;
}
