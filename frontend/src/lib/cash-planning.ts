export type CashPlan = { id: number; title: string; direction: "IN" | "OUT"; amount: number; planned_date: string; account_id: number | null; account_name: string | null; original_date: string; original_amount: number; counterparty_name: string; category_name: string; certainty: "CONFIRMED" | "ESTIMATED"; card_issuer: "BC" | "HANA" | null; billing_month: string | null; memo: string; status: string; version: number; settled: number; remaining: number };
export type CashAccount = { id: number; alias: string; bank_name: string; account_num_masked: string; balance: number | null; balance_at: string | null; last_sync_at: string | null; last_sync_error: string | null };
export type CashDay = { date: string; account_id: number; income: number; expense: number; transfer: number };
export type CashData = { plans: CashPlan[]; accounts: CashAccount[]; days: CashDay[] };
export const cashMoney = (v: unknown) => v == null ? "미확인" : `${Number(v).toLocaleString("ko-KR")}원`;
export const seoulToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
export function shiftDate(date: string, days: number) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function monthBounds(month: string) { const [y, m] = month.split("-").map(Number); return { from: `${month}-01`, to: `${month}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}` }; }
export function planStatus(plan: CashPlan, today = seoulToday()) {
  if (plan.status === "VOID") return "취소";
  if (Number(plan.remaining) <= 0) return "완료";
  if (plan.planned_date < today) return Number(plan.settled) > 0 ? "일부 처리 · 지연" : "기한 지남";
  return Number(plan.settled) > 0 ? "일부 처리" : "예정";
}
export const isOpenPlan = (plan: CashPlan) => plan.status !== "VOID" && Number(plan.remaining) > 0;
