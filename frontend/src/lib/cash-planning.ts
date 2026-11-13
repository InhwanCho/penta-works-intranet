export type CashPlan = { execution_confirmed?: boolean; execution_reviewed?: boolean; match_keywords?: string; match_days?: number; review_note?: string; reviewed_at?: string; id: number; title: string; direction: "IN" | "OUT"; amount: number; planned_date: string; account_id: number | null; account_name: string | null; original_date: string; original_amount: number; counterparty_name: string; category_name: string; certainty: "CONFIRMED" | "ESTIMATED"; card_issuer: "BC" | "HANA" | null; billing_month: string | null; memo: string; status: string; version: number; settled: number; remaining: number };
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
  if (plan.execution_confirmed) return "완료";
  if (plan.execution_confirmed === undefined && Number(plan.remaining) <= 0 && !hasPendingAmount(plan)) return "완료";
  if (Number(plan.settled) > 0) return "집행 연결 · 확정 대기";
  if (plan.execution_reviewed) return "재확인 필요";
  if (shiftDate(plan.planned_date, plan.match_days ?? 7) < today) return "거래 미확인";
  return "예정 · 확인 대기";
}
export const hasPendingAmount = (plan: CashPlan) => Number(plan.amount) === 0;
export const isOpenPlan = (plan: CashPlan) => plan.status !== "VOID" && !plan.execution_confirmed && (plan.execution_confirmed !== undefined || hasPendingAmount(plan) || Number(plan.remaining) > 0);

export const needsIncomeCheck = (plan: CashPlan, today: string) =>
  plan.direction === "IN" && isOpenPlan(plan) && plan.planned_date <= today;

// Card bills are already plans: split them out rather than counting them twice.
export function cashTotals(days: CashDay[], plans: CashPlan[]) {
  let income = 0, expense = 0, plannedIn = 0, plannedOut = 0, cardOut = 0;
  for (const day of days) { income += Number(day.income); expense += Number(day.expense); }
  for (const plan of plans) {
    if (!isOpenPlan(plan)) continue;
    const remaining = Number(plan.remaining);
    if (plan.direction === "IN") plannedIn += remaining;
    else if (plan.card_issuer) cardOut += remaining;
    else plannedOut += remaining;
  }
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

export const withinCashTolerance = (expected: number, actual: number) => expected > 0 && Math.abs(actual - expected) <= Math.max(expected * .2, 10000);
