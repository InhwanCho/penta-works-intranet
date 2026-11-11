export type LedgerRow = { id: number; date: string; counterparty: string; kind: string; description: string; amount: number; vat: number; deductible: boolean | number; version: number };
export function vatTotals(rows: LedgerRow[]) {
  const sales = rows.filter(r => r.kind === "SALE").reduce((s,r) => s + Number(r.vat),0);
  const purchases = rows.filter(r => r.kind === "PURCHASE" && Boolean(r.deductible)).reduce((s,r) => s + Number(r.vat),0);
  return { sales, purchases, net: sales - purchases };
}
export function ledgerAmounts(row: LedgerRow, mode: string) {
  return { debit: row.kind === (mode === "sales" ? "SALE" : "PAYMENT") ? Number(row.amount) : 0, credit: row.kind === (mode === "sales" ? "RECEIPT" : "PURCHASE") ? Number(row.amount) : 0 };
}
