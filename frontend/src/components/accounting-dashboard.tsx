"use client";

import { CreditCard, FileText, Landmark, Link2, ReceiptText, ShieldCheck, type LucideIcon } from "lucide-react";
import { useState } from "react";

type ModuleId = "cards" | "accounts" | "taxInvoices" | "cashReceipts";
type Module = {
  id: ModuleId;
  title: string;
  description: string;
  volume: string;
  icon: LucideIcon;
  tone: string;
};

const modules: Module[] = [
  { id: "cards", title: "법인카드 내역", description: "카드 승인·취소 내역과 증빙을 확인합니다.", volume: "카드 2개", icon: CreditCard, tone: "navy" },
  { id: "accounts", title: "통장 내역", description: "계좌별 입출금 내역과 거래처를 확인합니다.", volume: "계좌 2개", icon: Landmark, tone: "green" },
  { id: "taxInvoices", title: "세금계산서", description: "자동 발행을 준비하고 발행 내역을 관리합니다.", volume: "월 20~30건", icon: FileText, tone: "amber" },
  { id: "cashReceipts", title: "현금영수증", description: "필요할 때 발행하고 처리 결과를 확인합니다.", volume: "필요 시 발행", icon: ReceiptText, tone: "violet" },
];

const tableCopy: Record<ModuleId, { title: string; columns: string[]; empty: string }> = {
  cards: { title: "최근 법인카드 내역", columns: ["승인일", "카드", "가맹점", "금액", "증빙"], empty: "바로빌을 연결하면 법인카드 2개의 승인 내역이 표시됩니다." },
  accounts: { title: "최근 통장 내역", columns: ["거래일", "계좌", "적요", "입금", "출금"], empty: "바로빌을 연결하면 통장 2개의 입출금 내역이 표시됩니다." },
  taxInvoices: { title: "세금계산서 발행 내역", columns: ["작성일", "거래처", "공급가액", "상태", "발행일"], empty: "연동 후 자동 발행 규칙과 월별 발행 내역을 관리할 수 있습니다." },
  cashReceipts: { title: "현금영수증 발행 내역", columns: ["발행일", "식별번호", "공급가액", "상태", "승인번호"], empty: "현금영수증 발행 기능은 바로빌 연동 후 사용할 수 있습니다." },
};

export function AccountingDashboard() {
  const [active, setActive] = useState<ModuleId>("cards");
  const selected = modules.find((module) => module.id === active) ?? modules[0];
  const SelectedIcon = selected.icon;
  const table = tableCopy[active];

  return <div className="accounting-dashboard">
    <section className="accounting-connect">
      <div className="accounting-connect-icon"><ShieldCheck aria-hidden /></div>
      <div><span>BAROBILL CONNECT</span><h2>바로빌 연동 준비 중</h2><p>현재는 화면 구성 단계입니다. 인증키와 사업자 정보를 연결한 뒤 실제 조회·발행 기능을 활성화합니다.</p></div>
      <button disabled><Link2 aria-hidden /> 연동 전</button>
    </section>

    <div className="accounting-module-grid" aria-label="회계 업무 메뉴">
      {modules.map((module) => { const Icon = module.icon; return <button key={module.id} className={`accounting-module ${module.tone} ${active === module.id ? "active" : ""}`} onClick={() => setActive(module.id)} aria-pressed={active === module.id}>
        <span className="accounting-module-icon"><Icon aria-hidden /></span>
        <span className="accounting-module-copy"><small>{module.volume}</small><strong>{module.title}</strong><em>{module.description}</em></span>
      </button>; })}
    </div>

    <section className="accounting-ledger">
      <div className="accounting-ledger-head">
        <div><span>{selected.volume}</span><h2>{table.title}</h2></div>
        <div className="accounting-ledger-actions"><select aria-label="조회 기간" defaultValue="this-month"><option value="this-month">이번 달</option><option value="last-month">지난 달</option><option value="three-months">최근 3개월</option></select><button disabled>{active === "taxInvoices" ? "세금계산서 발행" : active === "cashReceipts" ? "현금영수증 발행" : "내역 불러오기"}</button></div>
      </div>
      <div className="accounting-table" role="table" aria-label={table.title}>
        <div className="accounting-table-row accounting-table-header" role="row">{table.columns.map((column) => <span role="columnheader" key={column}>{column}</span>)}</div>
        <div className="accounting-table-empty"><SelectedIcon aria-hidden /><strong>아직 연결된 데이터가 없습니다</strong><p>{table.empty}</p></div>
      </div>
    </section>
  </div>;
}
