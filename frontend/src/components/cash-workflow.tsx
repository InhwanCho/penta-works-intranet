import Link from "next/link";
export function CashWorkflow({ step }: { step: "plans" | "banks" }) {
  return <div className="cash-workflow cash-workflow-brief"><p>{step === "plans" ? "예정된 입출금을 등록·수정하는 화면입니다. 실제 거래 연결과 완료 처리는 ‘입출금 확인’에서만 합니다." : "통장 내역과 확인 상태를 조회하는 화면입니다. 거래 연결과 확인·해제는 ‘입출금 확인’에서만 합니다."}</p><Link href="/accounting/review">입출금 확인 메뉴로 →</Link></div>;
}
