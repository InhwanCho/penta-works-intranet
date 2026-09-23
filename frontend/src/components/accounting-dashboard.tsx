"use client";

import Image from "next/image";
import { CreditCard, FileText, Landmark, Link2, ReceiptText, ShieldCheck, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

type ModuleId = "cards" | "accounts" | "taxInvoices" | "cashReceipts";
type BrandId = "shinhan" | "hyundai" | "ibk" | "kb" | "invoice" | "receipt";
type Module = { id: ModuleId; title: string; description: string; volume: string; icon: LucideIcon; tone: string };
type Transaction = { date: string; time?: string; brand: BrandId; source: string; counterparty: string; detail: string; amount: string; status: string; tone: "complete" | "pending" | "warning" | "draft"; incoming?: boolean };

const modules: Module[] = [
  { id: "cards", title: "법인카드", description: "승인 내역과 증빙", volume: "2개 카드", icon: CreditCard, tone: "navy" },
  { id: "accounts", title: "통장", description: "입출금과 거래처", volume: "2개 계좌", icon: Landmark, tone: "green" },
  { id: "taxInvoices", title: "세금계산서", description: "자동 발행과 내역", volume: "월 20~30건", icon: FileText, tone: "amber" },
  { id: "cashReceipts", title: "현금영수증", description: "발행과 처리 결과", volume: "필요 시", icon: ReceiptText, tone: "violet" },
];

const brandLogos: Partial<Record<BrandId, { src: string; alt: string }>> = {
  shinhan: { src: "/brands/shinhan-card.svg", alt: "신한카드" }, hyundai: { src: "/brands/hyundai-card.svg", alt: "현대카드" },
  ibk: { src: "/brands/ibk-bank.svg", alt: "IBK기업은행" }, kb: { src: "/brands/kb-bank.svg", alt: "KB국민은행" },
};

const transactions: Record<ModuleId, Transaction[]> = {
  cards: [
    { date: "오늘", time: "08:42", brand: "shinhan", source: "신한 4821", counterparty: "한국철도공사", detail: "출장 교통비 · 대전 → 서울", amount: "86,400원", status: "증빙 필요", tone: "warning" },
    { date: "어제", time: "14:18", brand: "hyundai", source: "현대 9037", counterparty: "오피스디포 강남점", detail: "사무용품 · 일반 경비", amount: "127,600원", status: "증빙 완료", tone: "complete" },
    { date: "09.20", time: "19:31", brand: "shinhan", source: "신한 4821", counterparty: "대전복합터미널 주차장", detail: "출장 주차비", amount: "18,000원", status: "증빙 완료", tone: "complete" },
    { date: "09.18", time: "12:06", brand: "hyundai", source: "현대 9037", counterparty: "주식회사 한빛식당", detail: "거래처 미팅 · 참석자 4명", amount: "74,000원", status: "확인 필요", tone: "pending" },
  ],
  accounts: [
    { date: "오늘", time: "09:12", brand: "ibk", source: "기업 2840", counterparty: "에이치메디칼", detail: "서비스 대금 입금", amount: "+4,950,000원", status: "입금 완료", tone: "complete", incoming: true },
    { date: "어제", time: "16:40", brand: "kb", source: "국민 9173", counterparty: "가람빌딩관리", detail: "9월 사무실 관리비", amount: "-682,500원", status: "출금 완료", tone: "draft" },
    { date: "09.20", time: "11:05", brand: "ibk", source: "기업 2840", counterparty: "출장비 정산", detail: "직원 출장비 3건", amount: "-346,800원", status: "출금 완료", tone: "draft" },
    { date: "09.18", time: "15:22", brand: "kb", source: "국민 9173", counterparty: "정기예금 이자", detail: "예금 이자 입금", amount: "+42,180원", status: "입금 완료", tone: "complete", incoming: true },
  ],
  taxInvoices: [
    { date: "09.22", brand: "invoice", source: "매출", counterparty: "가온영상의학과", detail: "MRI 정기점검 서비스 · 발행 09.22", amount: "3,600,000원", status: "발행 완료", tone: "complete" },
    { date: "09.20", brand: "invoice", source: "매출", counterparty: "새봄병원", detail: "부품 교체 및 기술료", amount: "8,250,000원", status: "전송 중", tone: "pending" },
    { date: "09.18", brand: "invoice", source: "예약", counterparty: "한결메디컬센터", detail: "월 정기 서비스 · 09.30 자동 발행", amount: "1,480,000원", status: "발행 예약", tone: "pending" },
    { date: "09.15", brand: "invoice", source: "임시", counterparty: "더나은영상센터", detail: "Cold Head 작업", amount: "5,720,000원", status: "작성 중", tone: "draft" },
  ],
  cashReceipts: [
    { date: "09.12", brand: "receipt", source: "소득공제", counterparty: "010-****-2814", detail: "승인번호 184092713", amount: "120,000원", status: "발행 완료", tone: "complete" },
    { date: "08.28", brand: "receipt", source: "지출증빙", counterparty: "214-**-*****", detail: "승인번호 178430026", amount: "85,000원", status: "발행 취소", tone: "warning" },
  ],
};

export function AccountingDashboard() {
  const [active, setActive] = useState<ModuleId>("cards");
  const [filter, setFilter] = useState("전체");
  const selected = modules.find((module) => module.id === active) ?? modules[0];
  const activeRows = useMemo(() => transactions[active].filter((row) => filter === "전체" || row.status.includes(filter)), [active, filter]);
  const total = activeRows.reduce((sum, row) => sum + Number(row.amount.replace(/[^0-9]/g, "")), 0);
  function changeModule(id: ModuleId) { setActive(id); setFilter("전체"); }

  return <div className="accounting-dashboard">
    <section className="accounting-connect"><div className="accounting-connect-icon"><ShieldCheck aria-hidden /></div><div><span>BAROBILL CONNECT</span><h2>바로빌 연동 준비 중</h2><p>화면 검토용 샘플 데이터입니다. 인증키와 사업자 정보를 연결하면 실제 내역으로 교체됩니다.</p></div><button disabled><Link2 aria-hidden /> 연동 전</button></section>
    <div className="accounting-module-grid" aria-label="회계 업무 메뉴">{modules.map((module) => { const Icon = module.icon; return <button key={module.id} className={`accounting-module ${module.tone} ${active === module.id ? "active" : ""}`} onClick={() => changeModule(module.id)} aria-pressed={active === module.id}><span className="accounting-module-icon"><Icon aria-hidden /></span><span className="accounting-module-copy"><small>{module.volume}</small><strong>{module.title}</strong><em>{module.description}</em></span></button>; })}</div>
    <section className="accounting-feed-shell">
      <div className="accounting-feed-head"><div><span>{selected.volume} · 샘플</span><h2>{selected.title} 최근 내역</h2><p>{activeRows.length}건 · 합계 {total.toLocaleString("ko-KR")}원</p></div><div className="accounting-filter-chips">{["전체", "완료", "필요", "예약"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
      <div className="accounting-feed">{activeRows.map((row, index) => <article className="accounting-transaction" key={`${active}-${index}`}>
        <div className="transaction-source"><Brand brand={row.brand} /><span>{row.source}</span></div><div className="counterparty-badge" aria-hidden>{row.counterparty.slice(0, 1)}</div>
        <div className="transaction-main"><div><strong>{row.counterparty}</strong><span className={`sample-status ${row.tone}`}>{row.status}</span></div><p>{row.detail}</p><small>{row.date}{row.time ? ` · ${row.time}` : ""}</small></div><strong className={`transaction-amount ${row.incoming ? "incoming" : ""}`}>{row.amount}</strong>
      </article>)}{!activeRows.length && <div className="accounting-feed-empty">선택한 상태의 샘플 내역이 없습니다.</div>}</div>
    </section>
  </div>;
}

function Brand({ brand }: { brand: BrandId }) {
  const logo = brandLogos[brand];
  if (logo) return <span className="transaction-brand-logo"><Image src={logo.src} width={120} height={34} alt={logo.alt} /></span>;
  const Icon = brand === "invoice" ? FileText : ReceiptText;
  return <span className={`transaction-document-icon ${brand}`}><Icon aria-hidden /></span>;
}
