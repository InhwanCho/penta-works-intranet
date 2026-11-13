"use client";
import { useState } from "react";
import Link from "next/link";
import { useApiQuery } from "@/lib/use-api-query";
import { api } from "@/lib/api";
import { cashMoney as money, shiftDate, planStatus, type CashPlan } from "@/lib/cash-planning";
import { minute } from "@/lib/accounting-format";
import { ExecutionEditor } from "./execution-review";
import { AccountingLoader } from "./loading-indicator";

type BankReviewData = {
  transaction: { id: number; available: number; trans_at: string; description: string; deposit_amount: number; withdraw_amount: number; account_name: string; reviewed_without_plan: boolean; review_version: number; review_note: string; reviewed_at: string | null; classification: string };
  plans: (CashPlan & { linked_amount: number; recommended: boolean; match_reason: string; reversal: boolean })[];
};
export function BankExecutionReview({ id, date }: { id: number; date: string }) {
  const [from, setFrom] = useState(shiftDate(date, -45));
  const [to, setTo] = useState(shiftDate(date, 45));
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CashPlan | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = !!from && !!to && to >= from && (Date.parse(to) - Date.parse(from)) / 86400000 < 200;
  const path = `/accounting/cash/bank-transactions/${id}/review`;
  const data = useApiQuery<BankReviewData>(`${path}?from=${from}&to=${to}`, valid);
  const bank = data.data?.transaction;
  async function confirm(confirmed: boolean) {
    if (!bank) return;
    setBusy(true); setError("");
    try { await api(path, { method: "POST", body: JSON.stringify({ confirmed, note: confirmed ? note : bank.review_note, version: bank.review_version, amount: Number(bank.deposit_amount) + Number(bank.withdraw_amount) }) }); await data.refetch(); }
    catch(e) { setError(e instanceof Error ? e.message : "저장하지 못했습니다."); } finally { setBusy(false); }
  }
  if (selected && bank) return <><button type="button" onClick={e => { if (!e.currentTarget.parentElement?.querySelector('form[aria-busy="true"]')) setSelected(null); }}>← 거래의 계획 목록으로</button><ExecutionEditor key={selected.id} plan={selected} initialTransaction={bank} /></>;
  return <div className="cash-match">
    {data.isLoading && <AccountingLoader label="연결할 계획을 찾는 중" />}{data.isError && <p role="alert" className="cash-error">{data.error.message}</p>}
    {bank && <><div className="cash-match-summary"><strong>{bank.description || "은행거래"}</strong><span>{minute(bank.trans_at)} · {bank.account_name} · {Number(bank.deposit_amount) ? "입금" : "출금"} {money(Number(bank.deposit_amount) + Number(bank.withdraw_amount))}</span><small>미연결 금액 {money(bank.available)}</small></div>
    {bank.reviewed_without_plan ? <form aria-busy={busy} onSubmit={e => e.preventDefault()}><p role="status">계획 없는 거래로 확인 완료했습니다.</p><p>{bank.review_note} · {minute(bank.reviewed_at)}</p><button disabled={busy || data.isFetching} onClick={() => void confirm(false)}>확인 해제 · 계획에 연결하기</button></form> : <>
      <h3>1. 이 거래에 해당하는 계획을 선택하세요</h3><p className="cash-muted">추천 계획이 먼저 나옵니다. 연결된 계획은 기간과 관계없이 표시합니다. 합산·반환 거래도 해당 계획에서 확인할 수 있습니다.</p>
      <div className="cash-list-filters"><label>계획 시작일<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>계획 종료일<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label><label>계획 검색<input placeholder="계획명, 거래처" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
      {!valid && <p role="alert">계획 검색 기간은 200일 이내로 선택해주세요.</p>}
      <div className="bank-review-plans">{data.data?.plans.filter(p => `${p.title} ${p.counterparty_name}`.includes(search)).map(p => <div className="bank-review-plan" key={p.id}><div><strong>{p.title}</strong><small>{p.planned_date} · {money(p.amount)} · {planStatus(p)}</small><small>{Number(p.linked_amount) !== 0 ? `이 거래와 연결됨 · ${money(p.linked_amount)}` : p.match_reason}</small></div><button disabled={data.isFetching} onClick={() => setSelected(p)}>{Number(p.linked_amount) !== 0 ? "연결 내역·확인" : p.recommended ? "추천 계획 확인" : "이 계획 선택"}</button></div>)}</div>
      {data.data?.plans.length === 0 && <p>조회 기간에 연결할 계획이 없습니다. 기간을 넓히거나 계획을 등록하세요.</p>}
      <Link href="/accounting/plans">새 입출금 계획 등록 →</Link>
      {Number(bank.available) === Number(bank.deposit_amount) + Number(bank.withdraw_amount) && bank.classification !== "INTERNAL_TRANSFER" && <details><summary>해당하는 계획이 없는 거래인가요?</summary><form aria-busy={busy} onSubmit={e => { e.preventDefault(); void confirm(true); }}><p>이 확인은 다른 계획을 완료하지 않습니다. 거래를 검토했다는 기록만 남깁니다.</p><label className="execution-note">확인 사유<textarea required maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="예: 예산에 없던 소액 수수료" /></label><button className="cash-create" disabled={busy || data.isFetching || !note.trim()}>계획 없는 거래로 확인 완료</button></form></details>}
    </>}</>}
    {error && <p role="alert" className="cash-error">{error}</p>}
  </div>;
}
