"use client";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { AccountingSkeleton } from "./accounting-skeleton";
const TaxInvoices = dynamic(() => import("./tax-invoices").then(m => m.TaxInvoices), { loading: () => <AccountingSkeleton /> });
const AccountingTransactions = dynamic(() => import("./accounting-transactions").then(m => m.AccountingTransactions), { loading: () => <AccountingSkeleton /> });
const CashWorkspace = dynamic(() => import("./cash-workspace").then(m => m.CashWorkspace), { loading: () => <AccountingSkeleton /> });

export function AccountingDashboard() {
  const pathname = usePathname();
  if (pathname.startsWith("/accounting/tax-invoices")) return <TaxInvoices />;
  if (pathname.startsWith("/accounting/banks") || pathname.startsWith("/accounting/cards")) return <AccountingTransactions key={pathname} />;
  return <CashWorkspace key={pathname} view={pathname === "/accounting/cash" ? "calendar" : pathname === "/accounting/card-bills" ? "bills" : pathname === "/accounting" ? "overview" : "plans"} />;
}
