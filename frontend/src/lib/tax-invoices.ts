export type Party = { corpNum: string; corpName: string; ceoName: string; addr: string; bizType: string; bizClass: string; contactName: string; email: string; tel: string; hp: string; taxRegId: string };
export type InvoiceItem = { date: string; name: string; specification: string; quantity: string; unitPrice: string; note: string };
export type InvoiceDocument = { writeDate: string; taxType: number; purposeType: number; customer: Party; remark: string; items: InvoiceItem[] };
export type Invoice = { id: number; mgt_key: string; document: InvoiceDocument; issuer: Party; status: string; version: number; environment: string | null; remote_state: string | null; nts_state: string | null; nts_key: string | null; error_message: string | null; supply_amount: number; tax_amount: number; total_amount: number; customer_name: string; customer_business_no: string; write_date: string };
export type InvoiceSettings = { issuer: Party; version: number; issueReady: boolean; environment: string };
export const emptyParty = (): Party => ({ corpNum: "", corpName: "", ceoName: "", addr: "", bizType: "", bizClass: "", contactName: "", email: "", tel: "", hp: "", taxRegId: "" });
export const koreaToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
export const emptyItem = (date: string): InvoiceItem => ({ date, name: "", specification: "EA", quantity: "1", unitPrice: "", note: "" });
export const newDocument = (): InvoiceDocument => ({ writeDate: koreaToday(), taxType: 1, purposeType: 2, customer: emptyParty(), remark: "", items: [emptyItem(koreaToday())] });
export const invoiceStatuses: Record<string, string> = { DRAFT: "임시저장", SENDING: "발급 처리 중", ISSUED: "발급 완료", FAILED: "발급 실패", UNKNOWN: "결과 확인 필요" };
// Fixed-point arithmetic mirrors server BigDecimal calculations; amounts are whole KRW.
function scaled(value: string | number): bigint {
  const s = String(value);
  if (!/^\d{1,16}(\.\d{1,4})?$/.test(s)) return BigInt(0);
  const [whole, fraction = ""] = s.split(".");
  return BigInt(whole) * BigInt(10000) + BigInt(fraction.padEnd(4, "0"));
}
export function lineAmounts(item: InvoiceItem, taxType: number) {
  const supply = scaled(item.quantity) * scaled(item.unitPrice) / BigInt(100000000);
  return { supply, tax: taxType === 1 ? supply / BigInt(10) : BigInt(0) };
}
export function invoiceTotals(doc: InvoiceDocument) {
  const rows = doc.items.map(i => lineAmounts(i, doc.taxType));
  const supply = rows.reduce((s, r) => s + r.supply, BigInt(0));
  const tax = rows.reduce((s, r) => s + r.tax, BigInt(0));
  return { supply, tax, total: supply + tax };
}
export const invoiceMoney = (n: bigint | string | number) => `${BigInt(n).toLocaleString("ko-KR")}원`;
