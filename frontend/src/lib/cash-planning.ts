export type CashPlan = { id: number; title: string; direction: "IN" | "OUT"; amount: number; planned_date: string; account_id: number | null; account_name: string | null; original_date: string; original_amount: number; counterparty_name: string; category_name: string; certainty: "CONFIRMED" | "ESTIMATED"; card_issuer: "BC" | "HANA" | null; billing_month: string | null; memo: string; status: string; version: number; settled: number; remaining: number };
export type CashAccount = { id: number; alias: string; bank_name: string; bank_code?: string; account_num_masked: string; balance: number | null; balance_at: string | null; last_sync_at: string | null; last_sync_error: string | null };
export type CashDay = { date: string; account_id: number; income: number; expense: number; transfer: number };
export type CashBalance = { date: string; account_id: number; balance: number | null; balance_at: string | null };
export type CashData = { plans: CashPlan[]; accounts: CashAccount[]; days: CashDay[]; balances: CashBalance[] };
export const cashMoney = (v: unknown) => v == null ? "미확인" : `${Number(v).toLocaleString("ko-KR")}원`;
export const seoulToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
export function shiftDate(date: string, days: number) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function monthBounds(month: string) { const [y, m] = month.split("-").map(Number); return { from: `${month}-01`, to: `${month}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}` }; }
export function planStatus(plan: CashPlan, today = seoulToday()) {
  if (plan.status === "VOID") return "취소";
  if (hasPendingAmount(plan)) return "금액 미정";
  if (Number(plan.remaining) <= 0) return "완료";
  if (plan.planned_date < today) return Number(plan.settled) > 0 ? "일부 처리 · 지연" : "기한 지남";
  return Number(plan.settled) > 0 ? "일부 처리" : "예정";
}
export const hasPendingAmount = (plan: CashPlan) => Number(plan.amount) === 0;
export const isOpenPlan = (plan: CashPlan) => plan.status !== "VOID" && (hasPendingAmount(plan) || Number(plan.remaining) > 0);

export const needsIncomeCheck = (plan: CashPlan, today: string) =>
  plan.direction === "IN" && isOpenPlan(plan) && plan.planned_date <= today;

// Card bills are already plans: split them out rather than counting them twice.
export function cashTotals(days: CashDay[], plans: CashPlan[]) {
  const open = plans.filter(isOpenPlan);
  const income = days.reduce((sum, d) => sum + Number(d.income), 0);
  const expense = days.reduce((sum, d) => sum + Number(d.expense), 0);
  const plannedIn = open.filter(p => p.direction === "IN").reduce((sum, p) => sum + Number(p.remaining), 0);
  const plannedOut = open.filter(p => p.direction === "OUT" && !p.card_issuer).reduce((sum, p) => sum + Number(p.remaining), 0);
  const cardOut = open.filter(p => p.direction === "OUT" && p.card_issuer).reduce((sum, p) => sum + Number(p.remaining), 0);
  return { income, expense, plannedIn, plannedOut, cardOut, net: income - expense + plannedIn - plannedOut - cardOut };
}

export type BankTrack = "HANA" | "IBK";
export const bankTracks: { id: BankTrack; label: string; card: string }[] = [{ id: "HANA", label: "하나은행", card: "하나카드" }, { id: "IBK", label: "기업은행", card: "BC카드" }];
export function accountTrack(account?: CashAccount): BankTrack | null {
  if (!account) return null;
  if (["HANA", "081", "81"].includes(account.bank_code ?? "") || /하나|hana/i.test(account.bank_name)) return "HANA";
  if (["IBK", "003", "3"].includes(account.bank_code ?? "") || /기업|ibk/i.test(account.bank_name)) return "IBK";
  return null;
}
export function planTrack(plan: CashPlan, accounts: CashAccount[]): BankTrack | null {
  if (plan.card_issuer) return plan.card_issuer === "BC" ? "IBK" : "HANA";
  return accountTrack(accounts.find(a => a.id === plan.account_id));
}

export const signedCashMoney = (v: number) => `${v > 0 ? "+" : ""}${cashMoney(v)}`;
