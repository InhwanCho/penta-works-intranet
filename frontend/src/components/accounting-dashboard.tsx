"use client";
import { useOfficePathname } from "./office-tab-context";
import dynamic from "next/dynamic";
const TaxInvoices = dynamic(() => import("./tax-invoices").then(m => m.TaxInvoices));
const AccountingTransactions = dynamic(() => import("./accounting-transactions").then(m => m.AccountingTransactions));
const CashWorkspace = dynamic(() => import("./cash-workspace").then(m => m.CashWorkspace));

const ExecutionReview = dynamic(() => import("./execution-review").then(m => m.ExecutionReview));
const CounterpartyLedger = dynamic(() => import("./counterparty-ledger").then(m => m.CounterpartyLedger));

export function AccountingDashboard() {
  const pathname = useOfficePathname();
  if (pathname === "/accounting/review") return <ExecutionReview />;
  if (pathname === "/accounting/ledger") return <CounterpartyLedger />;
  if (pathname.startsWith("/accounting/tax-invoices")) return <TaxInvoices />;
  if (pathname.startsWith("/accounting/banks") || pathname.startsWith("/accounting/cards")) return <AccountingTransactions key={pathname} />;
  return <CashWorkspace key={pathname} view={pathname === "/accounting/card-bills" ? "bills" : pathname === "/accounting" ? "overview" : "plans"} />;
}
