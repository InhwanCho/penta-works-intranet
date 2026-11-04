"use client";
import { usePathname } from "next/navigation";
import { TaxInvoices } from "./tax-invoices";
import { AccountingTransactions } from "./accounting-transactions";
import { CashWorkspace } from "./cash-workspace";

export function AccountingDashboard() {
  const pathname = usePathname();
  if (pathname.startsWith("/accounting/tax-invoices")) return <TaxInvoices />;
  if (pathname.startsWith("/accounting/banks") || pathname.startsWith("/accounting/cards")) return <AccountingTransactions key={pathname} />;
  return <CashWorkspace key={pathname} view={pathname === "/accounting/cash" ? "calendar" : pathname === "/accounting/card-bills" ? "bills" : pathname === "/accounting" ? "overview" : "plans"} />;
}
