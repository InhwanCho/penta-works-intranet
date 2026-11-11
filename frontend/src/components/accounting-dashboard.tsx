"use client";
import { useOfficePathname } from "./office-tab-context";
import dynamic from "next/dynamic";
import LoadingIndicator from "./loading-indicator";
const TaxInvoices = dynamic(() => import("./tax-invoices").then(m => m.TaxInvoices), { loading: () => <LoadingIndicator label="회계 자료를 불러오는 중" /> });
const AccountingTransactions = dynamic(() => import("./accounting-transactions").then(m => m.AccountingTransactions), { loading: () => <LoadingIndicator label="회계 자료를 불러오는 중" /> });
const CashWorkspace = dynamic(() => import("./cash-workspace").then(m => m.CashWorkspace), { loading: () => <LoadingIndicator label="회계 자료를 불러오는 중" /> });

const CounterpartyLedger = dynamic(() => import("./counterparty-ledger").then(m => m.CounterpartyLedger));

export function AccountingDashboard() {
  const pathname = useOfficePathname();
  if (pathname === "/accounting/ledger") return <CounterpartyLedger />;
  if (pathname.startsWith("/accounting/tax-invoices")) return <TaxInvoices />;
  if (pathname.startsWith("/accounting/banks") || pathname.startsWith("/accounting/cards")) return <AccountingTransactions key={pathname} />;
  return <CashWorkspace key={pathname} view={pathname === "/accounting/daily" ? "daily" : pathname === "/accounting/cash" ? "calendar" : pathname === "/accounting/card-bills" ? "bills" : pathname === "/accounting" ? "overview" : "plans"} />;
}
