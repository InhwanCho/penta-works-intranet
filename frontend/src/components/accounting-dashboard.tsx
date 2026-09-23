"use client";

import Image from "next/image";
import { ArrowDownLeft, ArrowUpRight, BadgeDollarSign, BarChart3, CalendarClock, CreditCard, FileText, Landmark, LayoutDashboard, Link2, ReceiptText, RefreshCw, ShieldCheck, Users, WalletCards, type LucideIcon } from "lucide-react";
import { useState } from "react";

type ViewId = "overview" | "cash" | "receivables" | "expenses" | "payables" | "payroll" | "recurring" | "profit";
type View = { id: ViewId; label: string; caption: string; icon: LucideIcon };

const views: View[] = [
  { id: "overview", label: "회계 홈", caption: "오늘 할 일", icon: LayoutDashboard },
  { id: "cash", label: "자금계획", caption: "주간 현금 흐름", icon: WalletCards },
  { id: "receivables", label: "매출·수금", caption: "발행과 입금", icon: ArrowDownLeft },
  { id: "expenses", label: "지출", caption: "비용과 증빙", icon: ArrowUpRight },
  { id: "payables", label: "미지급금", caption: "업체 지급", icon: BadgeDollarSign },
  { id: "payroll", label: "급여", caption: "급여 마감", icon: Users },
  { id: "recurring", label: "자동이체", caption: "정기 지출", icon: RefreshCw },
  { id: "profit", label: "손익", caption: "계획 대비 실적", icon: BarChart3 },
];

const workflow = [
  { label: "입금 예정 확인", detail: "이번 주 수금 예정 4건", value: "36,800,000원", tone: "green" },
  { label: "지급 결정 필요", detail: "업체 미지급금 3건", value: "12,450,000원", tone: "amber" },
  { label: "급여 마감", detail: "9월 급여 검토 전", value: "D-2", tone: "violet" },
  { label: "증빙 미연결", detail: "카드·계좌 거래 5건", value: "확인", tone: "coral" },
];

const viewData: Record<Exclude<ViewId, "overview">, { eyebrow: string; title: string; description: string; columns: string[]; rows: string[][] }> = {
  cash: { eyebrow: "WEEKLY CASH PLAN", title: "주간 자금계획", description: "예정 입출금을 반영해 주차별 가용 자금을 봅니다.", columns: ["기간", "예상 입금", "예상 지출", "예상 잔액", "상태"], rows: [["이번 주", "36,800,000원", "27,450,000원", "193,550,000원", "확정"], ["다음 주", "18,200,000원", "31,600,000원", "180,150,000원", "검토"], ["10월 1주", "42,000,000원", "24,800,000원", "197,350,000원", "계획"]] },
  receivables: { eyebrow: "SALES & COLLECTIONS", title: "매출·수금 관리", description: "계산서 발행부터 예정일, 실제 입금, 미수금까지 연결합니다.", columns: ["거래처", "업무", "발행일", "입금 예정", "금액·상태"], rows: [["가상병원 A", "정기 유지보수", "09.18", "09.25", "4,400,000원 · 입금 예정"], ["가상병원 B", "부품 교체", "09.20", "09.30", "7,920,000원 · 계산서 발행"], ["가상병원 C", "기술 지원", "08.31", "09.15", "2,750,000원 · 수금 확인"]] },
  expenses: { eyebrow: "EXPENSE CONTROL", title: "지출 관리", description: "비용을 계정과목과 지급 방식으로 분류하고 증빙을 연결합니다.", columns: ["지출 항목", "구분", "지급 방식", "지급일", "금액·상태"], rows: [["사무실 운영비", "관리비", "자동이체", "09.25", "680,000원 · 예정"], ["현장 출장비", "여비교통비", "법인카드", "09.22", "214,000원 · 증빙 필요"], ["소프트웨어 이용료", "지급수수료", "계좌이체", "09.20", "330,000원 · 완료"]] },
  payables: { eyebrow: "ACCOUNTS PAYABLE", title: "업체 미지급금", description: "업체별 잔액과 지급 예정일을 확인하고 지급 여부를 결정합니다.", columns: ["업체", "내용", "발생일", "지급 예정", "잔액·상태"], rows: [["가상업체 A", "부품 매입", "09.08", "09.26", "6,800,000원 · 지급 검토"], ["가상업체 B", "외주 기술료", "09.12", "09.30", "3,850,000원 · 지급 예정"], ["가상업체 C", "소모품 매입", "09.16", "10.05", "1,800,000원 · 정상"]] },
  payroll: { eyebrow: "PAYROLL CLOSE", title: "급여 마감", description: "개인정보를 노출하지 않고 지급액·공제액·회사 부담금을 월 단위로 검토합니다.", columns: ["대상", "지급 합계", "공제 합계", "실지급액", "상태"], rows: [["직원 A", "4,200,000원", "520,000원", "3,680,000원", "검토 완료"], ["직원 B", "3,850,000원", "470,000원", "3,380,000원", "검토 필요"], ["직원 C", "3,600,000원", "435,000원", "3,165,000원", "검토 완료"]] },
  recurring: { eyebrow: "RECURRING PAYMENTS", title: "자동이체 관리", description: "정기 지급의 출금 계좌와 다음 출금일, 계약 기간을 관리합니다.", columns: ["지급처", "항목", "출금 계좌", "다음 출금일", "상태"], rows: [["가상업체 A", "통신비", "기업 · 2840", "09.25", "자동이체"], ["가상업체 B", "보험료", "국민 · 9173", "09.27", "자동이체"], ["가상업체 C", "구독료", "현대 · 9037", "10.02", "카드 정기결제"]] },
  profit: { eyebrow: "PROFIT & LOSS", title: "손익 계획 대비 실적", description: "연간 목표와 누계 실적, 당월 흐름을 계정별로 비교합니다.", columns: ["항목", "연간 계획", "누계 실적", "달성률", "당월"], rows: [["매출", "720,000,000원", "486,000,000원", "68%", "58,000,000원"], ["매출원가", "252,000,000원", "164,000,000원", "65%", "19,200,000원"], ["판매관리비", "288,000,000원", "201,000,000원", "70%", "23,400,000원"], ["영업이익", "180,000,000원", "121,000,000원", "67%", "15,400,000원"]] },
};

const sources = [
  { label: "신한 법인카드", meta: "1개 · 승인내역", logo: "/brands/shinhan-card.svg", icon: CreditCard },
  { label: "현대 법인카드", meta: "1개 · 승인내역", logo: "/brands/hyundai-card.svg", icon: CreditCard },
  { label: "기업은행", meta: "1개 · 입출금", logo: "/brands/ibk-bank.svg", icon: Landmark },
  { label: "국민은행", meta: "1개 · 입출금", logo: "/brands/kb-bank.svg", icon: Landmark },
  { label: "세금계산서", meta: "바로빌 연동 예정", icon: FileText },
  { label: "현금영수증", meta: "바로빌 연동 예정", icon: ReceiptText },
];

export function AccountingDashboard() {
  const [active, setActive] = useState<ViewId>("overview");
  return <div className="accounting-dashboard accounting-workspace">
    <section className="accounting-connect"><div className="accounting-connect-icon"><ShieldCheck aria-hidden /></div><div><span>ACCOUNTING WORKSPACE · SAMPLE</span><h2>자금 흐름을 한 화면에서 관리합니다</h2><p>장부의 업무 구조만 반영한 가상 데이터입니다. 실제 회사 정보는 포함하지 않았습니다.</p></div><button disabled><Link2 aria-hidden /> 연동 전</button></section>
    <div className="accounting-layout">
      <nav className="accounting-work-nav" aria-label="회계 업무 메뉴">{views.map((view) => { const Icon = view.icon; return <button key={view.id} className={active === view.id ? "active" : ""} onClick={() => setActive(view.id)}><span><Icon aria-hidden /></span><div><strong>{view.label}</strong><small>{view.caption}</small></div></button>; })}</nav>
      <main className="accounting-work-main">{active === "overview" ? <Overview /> : <LedgerView id={active} />}</main>
    </div>
  </div>;
}

function Overview() {
  return <div className="accounting-overview">
    <header className="accounting-section-head"><div><span>SEPTEMBER · SAMPLE</span><h2>이번 달 자금 현황</h2><p>입금 예정과 지급 계획을 반영한 월말 예상입니다.</p></div><div className="accounting-date"><CalendarClock aria-hidden /> 2026. 09. 23 기준</div></header>
    <div className="accounting-kpis"><article><span>현재 가용 자금</span><strong>184,200,000원</strong><small>2개 계좌 합계</small></article><article><span>입금 예정</span><strong className="positive">+36,800,000원</strong><small>이번 주 4건</small></article><article><span>지출 예정</span><strong>-27,450,000원</strong><small>급여·미지급금 포함</small></article><article className="forecast"><span>월말 예상 잔액</span><strong>193,550,000원</strong><small>예정 거래 반영</small></article></div>
    <section className="accounting-action-panel"><div className="accounting-block-title"><div><span>TODAY&apos;S WORK</span><h3>먼저 확인할 업무</h3></div><small>가상 데이터</small></div><div className="accounting-action-grid">{workflow.map((item) => <article key={item.label}><i className={item.tone} /><div><strong>{item.label}</strong><span>{item.detail}</span></div><b>{item.value}</b></article>)}</div></section>
    <SourcePanel />
  </div>;
}

function LedgerView({ id }: { id: Exclude<ViewId, "overview"> }) {
  const data = viewData[id];
  return <div className="accounting-ledger-view"><header className="accounting-section-head"><div><span>{data.eyebrow} · SAMPLE</span><h2>{data.title}</h2><p>{data.description}</p></div><button disabled>UI 미리보기</button></header>
    {id === "cash" && <div className="cash-account-strip"><article><Landmark /><span>기업 · 2840</span><strong>112,400,000원</strong></article><article><Landmark /><span>국민 · 9173</span><strong>71,800,000원</strong></article></div>}
    <div className="accounting-records"><div className="accounting-record-head">{data.columns.map((column) => <span key={column}>{column}</span>)}</div>{data.rows.map((row, rowIndex) => <article key={rowIndex}>{row.map((cell, cellIndex) => <div key={cellIndex} data-label={data.columns[cellIndex]}><strong>{cell}</strong></div>)}</article>)}</div><SourcePanel compact /></div>;
}

function SourcePanel({ compact = false }: { compact?: boolean }) {
  return <section className={`accounting-sources ${compact ? "compact" : ""}`}><div className="accounting-block-title"><div><span>DATA SOURCES</span><h3>연동 자료</h3></div><small>카드 2 · 계좌 2 · 전자증빙</small></div><div className="accounting-source-grid">{sources.map((source) => { const Icon = source.icon; return <article key={source.label}><div className="source-logo">{source.logo ? <Image src={source.logo} width={110} height={30} alt={source.label} /> : <Icon aria-hidden />}</div><div><strong>{source.label}</strong><span>{source.meta}</span></div><i /></article>; })}</div></section>;
}
