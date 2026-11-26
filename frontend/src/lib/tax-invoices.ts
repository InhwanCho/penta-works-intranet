export type Party = { corpNum: string; corpName: string; ceoName: string; addr: string; bizType: string; bizClass: string; contactName: string; email: string; tel: string; hp: string; taxRegId: string };
export type InvoiceItem = { date: string; name: string; specification: string; quantity: string; unitPrice: string; grossUnitPrice?: string | null; note: string };
export type InvoiceDocument = { writeDate: string; taxType: number; purposeType: number; customer: Party; remark: string; items: InvoiceItem[] };
export type Invoice = { original_id?: number; correction_code?: number; correction_sign?: number; corrections?: {id:number; correction_group:string; correction_code:number; correction_part:number; deleted?:boolean | number; status:string; total_amount:number}[]; id: number; mgt_key: string; document: InvoiceDocument; issuer: Party; status: string; version: number; environment: string | null; remote_state: string | null; nts_state: string | null; nts_key: string | null; error_message: string | null; supply_amount: number; tax_amount: number; total_amount: number; customer_name: string; customer_address?: string; customer_business_no: string; write_date: string; scheduled_date?: string | null; created_minute?: string; issued_minute?: string | null; nts_expected?: string | null };
export type InvoiceSettings = { issuer: Party; version: number; issueReady: boolean; environment: string };
export const emptyParty = (): Party => ({ corpNum: "", corpName: "", ceoName: "", addr: "", bizType: "", bizClass: "", contactName: "", email: "", tel: "", hp: "", taxRegId: "" });
export const koreaToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
export function earliestInvoiceScheduleDate() {
  const [year, month, day] = koreaToday().split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}
export const emptyItem = (date: string): InvoiceItem => ({ date, name: "", specification: "EA", quantity: "1", grossUnitPrice: "", unitPrice: "", note: "" });
export const newDocument = (): InvoiceDocument => ({ writeDate: koreaToday(), taxType: 1, purposeType: 2, customer: emptyParty(), remark: "", items: [emptyItem(koreaToday())] });
export const invoiceStatuses: Record<string, string> = { CANCELLED:"발급취소", CORRECTION_READY:"수정발급 대기", DRAFT: "임시저장", SCHEDULED: "발급 예약", SENDING: "발급 처리 중", ISSUED: "바로빌 발급 완료", FAILED: "발급 실패", UNKNOWN: "결과 확인 필요" };
export function invoiceDisplayStatus(invoice: Pick<Invoice, "status" | "nts_state">) {
  return invoice.status === "ISSUED" && String(invoice.nts_state) === "4" ? "국세청 전송 완료" : invoiceStatuses[invoice.status];
}
const rejectionReasons: Record<string, string> = {
  "-11207": "공급받는자 담당자명을 확인해주세요.",
  "-11208": "공급받는자 이메일을 확인해주세요.",
  "-11211": "공급받는자 연락처를 확인해주세요.",
  "-11212": "공급받는자 휴대폰 번호를 확인해주세요.",
  "-26001": "발급용 공동인증서 등록이 필요합니다.",
  "-26002": "발급용 공동인증서의 유효기간을 확인해주세요.",
};
export function invoiceStatusDetail(invoice: Pick<Invoice, "status" | "error_message">) {
  const message = invoice.error_message?.trim();
  const code = message?.match(/^바로빌 응답 코드:\s*(-?\d+)$/)?.[1];
  if (invoice.status === "FAILED") {
    if (code) return (rejectionReasons[code] ?? "바로빌에서 발급 요청을 거절했습니다.") + ` (코드 ${code})`;
    return message || "발급에 실패했습니다. 상세 사유가 기록되지 않았습니다.";
  }
  if (invoice.status === "UNKNOWN") {
    return "발급 여부를 확인할 수 없습니다. 상태 조회로 확인해주세요." + (code ? ` (코드 ${code})` : "");
  }
  return message || "";
}
// Fixed-point arithmetic mirrors server BigDecimal calculations; amounts are whole KRW.
function scaled(value: string | number): bigint {
  const s = String(value);
  if (!/^\d{1,16}(\.\d{1,4})?$/.test(s)) return BigInt(0);
  const [whole, fraction = ""] = s.split(".");
  return BigInt(whole) * BigInt(10000) + BigInt(fraction.padEnd(4, "0"));
}
export function lineAmounts(item: InvoiceItem, taxType: number) {
  if (item.grossUnitPrice != null) {
    const gross = scaled(item.quantity) * scaled(item.grossUnitPrice) / BigInt(100000000);
    const supply = taxType === 1 ? (gross * BigInt(10) + BigInt(5)) / BigInt(11) : gross;
    return { supply, tax: gross - supply };
  }
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

export function grossPriceText(item: InvoiceItem, taxType: number) {
  if (item.grossUnitPrice != null) return String(item.grossUnitPrice);
  const amount = lineAmounts({ ...item, quantity: "1" }, taxType);
  return String(amount.supply + amount.tax);
}

// Match the four-decimal HALF_UP net unit price sent in the invoice XML.
export function netUnitPriceText(item: InvoiceItem, supply: bigint) {
  const quantity = scaled(item.quantity);
  if (quantity <= BigInt(0)) return "—";
  const scale = BigInt(10000);
  const price = item.grossUnitPrice == null ? scaled(item.unitPrice)
    : (supply * scale * scale + quantity / BigInt(2)) / quantity;
  const fraction = String(price % scale).padStart(4, "0").replace(/0+$/, "");
  return (price / scale).toLocaleString("ko-KR") + (fraction ? "." + fraction : "");
}
