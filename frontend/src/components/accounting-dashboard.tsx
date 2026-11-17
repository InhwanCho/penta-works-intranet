"use client";
import { useOfficePathname } from "./office-tab-context";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
const TaxInvoices = dynamic(() => import("./tax-invoices").then(m => m.TaxInvoices));
const AccountingTransactions = dynamic(() => import("./accounting-transactions").then(m => m.AccountingTransactions));
const CashWorkspace = dynamic(() => import("./cash-workspace").then(m => m.CashWorkspace));

const ExecutionReview = dynamic(() => import("./execution-review").then(m => m.ExecutionReview));
const CounterpartyLedger = dynamic(() => import("./counterparty-ledger").then(m => m.CounterpartyLedger));

function PlansWorkspace() {
  const pathname = usePathname();
  const search = useSearchParams();
  const review = pathname === "/accounting/plans" && search.get("view") === "execution";
  return <>
    <nav className="review-tabs" aria-label="입출금 계획 작업">
      <Link href="/accounting/plans" aria-current={!review ? "page" : undefined}>계획 관리</Link>
      <Link href="/accounting/plans?view=execution" aria-current={review ? "page" : undefined}>집행 확인</Link>
    </nav>
    {review ? <ExecutionReview /> : <CashWorkspace view="plans" />}
  </>;
}

export function AccountingDashboard() {
  const pathname = useOfficePathname();
  if (pathname === "/accounting/plans") return <Suspense><PlansWorkspace /></Suspense>;
  if (pathname === "/accounting/ledger") return <CounterpartyLedger />;
  if (pathname.startsWith("/accounting/tax-invoices")) return <TaxInvoices />;
  if (pathname.startsWith("/accounting/banks") || pathname.startsWith("/accounting/cards")) return <AccountingTransactions key={pathname} />;
  return <CashWorkspace key={pathname} view={pathname === "/accounting/card-bills" ? "bills" : pathname === "/accounting" ? "overview" : "plans"} />;
}
