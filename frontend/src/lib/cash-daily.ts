import { accountTrack, cashTotals, isOpenPlan, type CashAccount, type CashBalance, type CashDay, type CashPlan } from "./cash-planning";
export function dailyBankRows(accounts: CashAccount[], days: CashDay[], plans: CashPlan[], balances: CashBalance[], balanceDate: string) {
  const groups = new Map<string, { label: string; ids: Set<number> }>();
  for (const account of accounts) {
    const key = accountTrack(account) ?? account.bank_name;
    if (!groups.has(key)) groups.set(key, { label: accountTrack(account) === "HANA" ? "하나은행" : accountTrack(account) === "IBK" ? "기업은행" : account.bank_name, ids: new Set() });
    groups.get(key)!.ids.add(account.id);
  }
  const knownIds = new Set(accounts.map(a => a.id));
  if (plans.some(p => isOpenPlan(p) && (p.account_id == null || !knownIds.has(p.account_id)))) groups.set("unassigned", { label: "계좌 미지정", ids: new Set() });
  return [...groups].map(([key, group]) => {
    const actual = days.filter(d => group.ids.has(d.account_id));
    const pending = plans.filter(p => key === "unassigned" ? p.account_id == null || !knownIds.has(p.account_id) : p.account_id != null && group.ids.has(p.account_id));
    const closing = balances.filter(b => b.date === balanceDate && group.ids.has(b.account_id));
    const known = group.ids.size > 0 && closing.length === group.ids.size && closing.every(b => b.balance != null);
    return { key, label: group.label, ...cashTotals(actual, pending), transfer: actual.reduce((sum, d) => sum + Number(d.transfer), 0), balance: known ? closing.reduce((sum, b) => sum + Number(b.balance), 0) : null };
  });
}
