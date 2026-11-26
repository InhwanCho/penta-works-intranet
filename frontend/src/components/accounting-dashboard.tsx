"use client";
import { useOfficePathname } from "./office-tab-context";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
const TaxInvoices = dynamic(() => import("./tax-invoices").then(m => m.TaxInvoices));
const AccountingTransactions = dynamic(() => import("./accounting-transactions").then(m => m.AccountingTransactions));
const CashWorkspace = dynamic(() => import("./cash-workspace").then(m => m.CashWorkspace));

const ExecutionReview = dynamic(() => import("./execution-review").then(m => m.ExecutionReview));
const CounterpartyLedger = dynamic(() => import("./counterparty-ledger").then(m => m.CounterpartyLedger));

function CardWorkspace() {
  const [bills,setBills]=useState(false);
  useEffect(()=>{
    const sync=()=>setBills(window.location.hash==="#bills");
    sync();
    window.addEventListener("hashchange",sync);
    return ()=>window.removeEventListener("hashchange",sync);
  },[]);
  return <section className="accounting-office cash-workspace card-workspace">
    <header className="cash-page-heading"><h1>카드내역 · 결제예정</h1></header>
    <div className="cash-segment" aria-label="카드 조회 구분">
      <button type="button" aria-pressed={!bills} className={!bills?"selected":""} onClick={()=>{setBills(false);window.history.replaceState(window.history.state,"",window.location.pathname+window.location.search);}}>카드 사용내역</button>
      <button type="button" aria-pressed={bills} className={bills?"selected":""} onClick={()=>{setBills(true);window.history.replaceState(window.history.state,"","#bills");}}>결제예정</button>
    </div>
    {bills?<CashWorkspace view="bills"/>:<AccountingTransactions/>}
  </section>;
}

export function AccountingDashboard() {
  const pathname = useOfficePathname();
  if (pathname === "/accounting/plans") return <ExecutionReview />;
  if (pathname === "/accounting/ledger") return <CounterpartyLedger />;
  if (pathname.startsWith("/accounting/tax-invoices")) return <TaxInvoices />;
  if (pathname === "/accounting/cards") return <CardWorkspace />;
  if (pathname.startsWith("/accounting/banks") || pathname.startsWith("/accounting/cards")) return <AccountingTransactions key={pathname} />;
  return <CashWorkspace key={pathname} view={pathname === "/accounting/card-bills" ? "bills" : pathname === "/accounting" ? "overview" : "plans"} />;
}
