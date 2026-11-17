import Link from "next/link";
export function CashWorkflow() {
  return <div className="cash-workflow cash-workflow-brief"><p>통장 내역과 확인 상태를 조회할 수 있습니다. 거래 연결과 확인은 입출금 계획에서 처리합니다.</p><Link href="/accounting/plans">입출금 계획으로 →</Link></div>;
}
