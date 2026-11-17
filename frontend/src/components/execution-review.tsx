"use client";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import Link from "next/link";
import { api } from "@/lib/api";
import { useState } from "react";
import { useApiQuery } from "@/lib/use-api-query";
import { cashMoney as money, monthBounds, seoulToday, type CashPlan } from "@/lib/cash-planning";
import { minute } from "@/lib/accounting-format";
import { CashDialog } from "./cash-dialog";
import { AccountingLoader } from "./loading-indicator";
import { ExecutionEditor } from "./execution-editor";
import { BankExecutionReview } from "./bank-execution-review";
import { uniqueRecommendation } from "@/lib/execution-recommendations";

type Candidate = { id: number; trans_at: string; description: string; counterparty_text: string; account_name: string; available: number; reversal: boolean; recommended: boolean; reason: string };
type ReviewPlan = CashPlan & { recommendations: Candidate[] };
type BankTransaction = Candidate & { deposit_amount: number; withdraw_amount: number; review_note?: string; reviewed_at?: string };
type ReviewData = { plans: ReviewPlan[]; unlinked: BankTransaction[]; reviewedTransactions?: BankTransaction[]; accounts: { alias: string; last_sync_at: string | null; last_sync_error: string | null }[] };
const needsReview = (p: ReviewPlan) => !p.execution_confirmed || (Number(p.settled) > 0 && p.recommendations.some(c => c.reversal));

export function ExecutionReview() {
  const [selected, setSelected] = useState<number[]>([]);
  const [batch, setBatch] = useState<{plan: ReviewPlan; transaction: Candidate}[] | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchResults, setBatchResults] = useState<Record<number,string>>({});
  const [batchFinished, setBatchFinished] = useState(false);
  const [month, setMonth] = useState(seoulToday().slice(0, 7));
  const [tab, setTab] = useState("plans");
  const [searchInput, setSearch] = useState("");
  const search=useDebouncedValue(searchInput);
  const [editing, setEditing] = useState<{ plan: CashPlan; suggested?: Candidate } | null>(null);
  const [waiting, setWaiting] = useState<CashPlan | null>(null);
  const [bank, setBank] = useState<BankTransaction | null>(null);
  const bounds = monthBounds(month);
  const data = useApiQuery<ReviewData>(`/accounting/cash/review?from=${bounds.from}&to=${bounds.to}`, !!month);
  const plans = data.data?.plans ?? [];
  const pending = plans.filter(needsReview);
  const completed = plans.filter(p => p.execution_confirmed && !needsReview(p));
  const standalone = data.data?.reviewedTransactions ?? [];
  const visible = (tab === "done" ? completed : pending).filter(p => `${p.title} ${p.counterparty_name}`.includes(search)).sort((a,b) => Number(b.recommendations.some(c=>c.recommended)) - Number(a.recommendations.some(c=>c.recommended)));
  const bankRows = (tab === "done" ? standalone : data.data?.unlinked ?? []).filter(t => `${t.description} ${t.counterparty_text}`.includes(search));
  const eligible = visible.flatMap(plan => {
    const transaction = !plan.execution_confirmed && Number(plan.settled) === 0 ? uniqueRecommendation(plan, plans) : undefined;
    return transaction ? [{plan, transaction}] : [];
  });
  const selectedRows = eligible.filter(row => selected.includes(row.plan.id));
  async function confirmBatch() {
    if (!batch || batchBusy || batchFinished) return;
    setBatchBusy(true);
    for (const {plan, transaction} of batch) {
      try {
        await api(`/accounting/cash/plans/${plan.id}/review`, {method:"POST",body:JSON.stringify({version:plan.version,complete:true,note:plan.review_note ?? "",items:[{transactionId:transaction.id,amount:Number(transaction.available),requestKey:crypto.randomUUID()}]})});
        setBatchResults(previous=>({...previous,[plan.id]:"확인 완료"}));
      } catch (error) {
        setBatchResults(previous=>({...previous,[plan.id]:error instanceof Error ? error.message : "처리하지 못했습니다. 개별 확인해주세요."}));
      }
    }
    setSelected([]);setBatchFinished(true);setBatchBusy(false);void data.refetch();
  }
  return <div className="cash-workspace accounting-office execution-review review-hub">
    <header className="accounting-section-head"><h2>입출금 확인</h2></header>
    <div className="review-toolbar"><label>기준월<input type="month" value={month} onChange={e => {setMonth(e.target.value);setSelected([]);}} /></label><label>검색<input value={searchInput} placeholder="계획명 또는 통장 적요" onChange={e => {setSearch(e.target.value);setSelected([]);}} /></label><small>전후 7일 기본 · ±20% 또는 차액 1만 원 이하 정상</small></div>
    <nav className="review-tabs" aria-label="확인 대상"><button aria-pressed={tab === "plans"} onClick={() => {setSelected([]);setTab("plans");}}>확인할 계획 <b>{pending.length}</b></button><button aria-pressed={tab === "bank"} onClick={() => {setSelected([]);setTab("bank");}}>미연결 거래 <b>{data.data?.unlinked.length ?? 0}</b></button><button aria-pressed={tab === "done"} onClick={() => {setSelected([]);setTab("done");}}>완료 내역 <b>{completed.length + standalone.length}</b></button></nav>
    {data.isLoading && <AccountingLoader label="계획에 맞는 통장 거래를 찾는 중" />}{data.isError && <p role="alert" className="cash-error">{data.error.message}</p>}
    {tab === "plans" && <div className="review-batch-toolbar"><strong>{selectedRows.length}건 선택</strong><button className="cash-create" disabled={!selectedRows.length || data.isFetching} onClick={()=>{setBatch(selectedRows);setBatchResults({});setBatchFinished(false);}}>선택한 추천 거래 확인</button><small>추천이 한 건으로 구분되는 계획만 다중 확인할 수 있습니다. 후보 중복·분할·반환은 개별 확인해주세요.</small></div>}
    {tab !== "bank" && <section className="review-plan-list" aria-label="계획 확인 목록"><div className="cash-table-scroll"><table className="cash-table review-compact-table"><thead><tr>{tab === "plans" && <th className="review-select-cell"><input type="checkbox" aria-label="확인 가능한 계획 전체 선택" disabled={!eligible.length || data.isFetching} checked={eligible.length>0 && selectedRows.length===eligible.length} ref={node=>{if(node)node.indeterminate=selectedRows.length>0 && selectedRows.length<eligible.length;}} onChange={e=>setSelected(e.target.checked?eligible.map(row=>row.plan.id):[])} /></th>}<th>예정일</th><th>계획 / 계좌</th><th>예상 금액</th><th>추천 거래 / 실제 입출금</th><th>상태</th><th>처리</th></tr></thead><tbody>{visible.map(p => {
      const candidates = p.recommendations.filter(c => c.recommended);
      const suggested = !p.execution_confirmed ? uniqueRecommendation(p, plans) : undefined;
      const returns = p.recommendations.some(c => c.reversal) && Number(p.settled) > 0;
      const waitingNote = p.review_note?.startsWith("미집행 확인:") ? p.review_note.slice(7).trim() : "";
      return <tr key={p.id}>{tab === "plans" && <td className="review-select-cell"><input type="checkbox" aria-label={`${p.title} 선택`} title={eligible.some(row=>row.plan.id===p.id)?"다중 확인에 포함":"추천 거래를 개별 확인해주세요"} disabled={data.isFetching || !eligible.some(row=>row.plan.id===p.id)} checked={selectedRows.some(row=>row.plan.id===p.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/></td>}<td>{p.planned_date}<small>{p.direction === "IN" ? "입금" : "출금"}</small></td><td><strong>{p.title}</strong><small>{p.account_name || "계좌 미지정"}</small></td><td className="number">{Number(p.amount) ? money(p.amount) : "금액 미정"}</td><td>{tab === "done" ? <><strong>{money(p.settled)}</strong><small>{p.reviewed_at ? minute(p.reviewed_at) : "기존 확인 내역"}</small></> : candidates.length ? <>{candidates.slice(0,2).map(c => <div className="review-transaction-line" key={c.id}><strong>{money(c.available)}</strong><span>{c.description || c.counterparty_text}</span><small>{c.trans_at.slice(0,10)} · {c.account_name}</small></div>)}{candidates.length>2 && <small>외 {candidates.length-2}건</small>}</> : Number(p.settled)>0 ? <><strong>{money(p.settled)}</strong><small>연결된 거래 확인 필요</small></> : <><span>거래 미확인</span><small>{waitingNote || "거래를 찾거나 미집행으로 기록하세요."}</small></>}</td><td><span className="review-pill">{tab === "done" ? "완료" : returns ? "반환 확인" : suggested ? "추천" : candidates.length ? "후보 선택" : waitingNote ? "미집행 · 대기" : "확인 필요"}</span></td><td><div className="review-row-actions"><button className="cash-create" onClick={() => setEditing({plan:p,suggested})}>{tab === "done" ? "완료 내역 보기" : candidates.length ? "추천 거래 확인" : "거래 찾기·연결"}</button>{tab !== "done" && !p.execution_confirmed && Number(p.settled) === 0 && <button onClick={() => setWaiting(p)}>미집행 기록</button>}</div></td></tr>;
    })}</tbody></table></div>{data.data && !visible.length && <p className="cash-empty">{tab === "done" ? "완료된 계획이 없습니다." : "확인할 계획이 없습니다."}</p>}</section>}
    {(tab === "bank" || tab === "done") && <section className="review-plan-list" aria-label="은행거래 확인 목록"><h3>{tab === "done" ? "계획 없이 확인한 거래" : "계획에 아직 연결되지 않은 거래"}</h3><p className="cash-muted">{tab === "done" ? "확인 사유를 보거나 확인을 해제할 수 있습니다." : "해당 계획을 찾아 연결하거나, 계획 없는 거래로 확인하세요. 일부 연결된 거래는 남은 금액을 표시합니다."}</p>{bankRows.map(t => <article className="review-bank-card" key={t.id}><div><h3>{t.description || t.counterparty_text || "은행거래"}</h3><small>{minute(t.trans_at)} · {t.account_name}</small>{tab === "done" && <p>{t.review_note}</p>}</div><strong>{Number(t.deposit_amount) > 0 ? "입금" : "출금"} {money(tab === "done" ? Number(t.deposit_amount) + Number(t.withdraw_amount) : t.available)}</strong><button onClick={() => setBank(t)}>{tab === "done" ? "확인 내역 보기" : "계획 연결·확인"}</button></article>)}{data.data && !bankRows.length && <p className="cash-empty">표시할 거래가 없습니다.</p>}</section>}
    <details className="cash-panel review-help"><summary>은행 수집 상태와 확인 기준</summary><p>거래가 보이지 않으면 은행거래 메뉴에서 수집 기간을 확인하세요. 추천되지 않아도 직접 연결할 수 있으며, 정상 금액 범위를 넘으면 사유를 남겨 완료할 수 있습니다.</p>{data.data?.accounts.map((a,i) => <p key={i}>{a.alias} · 마지막 수집 {a.last_sync_at ? minute(a.last_sync_at) : "기록 없음"}{a.last_sync_error && ` · 오류: ${a.last_sync_error}`}</p>)}</details>
    {batch && <CashDialog title="선택한 입출금 확인" wide closeDisabled={batchBusy} onClose={()=>{if(!batchBusy)setBatch(null);}}><div className="review-batch-dialog" aria-busy={batchBusy}><p>계획과 연결할 거래를 확인한 뒤 완료해주세요. 각 거래의 표시 금액 전체를 반영합니다.</p><div className="cash-table-scroll"><table className="cash-table"><thead><tr><th>계획</th><th>거래 / 계좌</th><th>반영 금액</th><th>결과</th></tr></thead><tbody>{batch.map(({plan,transaction})=><tr key={plan.id}><td><strong>{plan.title}</strong><small>예정일 {plan.planned_date}</small><small>예산 {money(plan.amount)}</small></td><td>{transaction.description || transaction.counterparty_text}<small>{minute(transaction.trans_at)} · {transaction.account_name}</small></td><td className="number">{money(transaction.available)}</td><td>{batchResults[plan.id] ?? "확인 대기"}</td></tr>)}</tbody></table></div>{batchFinished && <p role="status">{Object.values(batchResults).filter(result=>result==="확인 완료").length} / {batch.length}건 완료. 완료되지 않은 항목은 목록에서 최신 상태를 확인해주세요.</p>}<footer><button disabled={batchBusy} onClick={()=>setBatch(null)}>{batchFinished?"닫기":"취소"}</button>{!batchFinished && <button className="cash-create" disabled={batchBusy} onClick={()=>void confirmBatch()}>{batchBusy?"처리 중…":`${batch.length}건 확인 완료`}</button>}</footer></div></CashDialog>}
    {waiting && <CashDialog title="아직 입출금되지 않은 계획" onClose={() => setWaiting(null)}><PendingExecution plan={waiting} onSaved={() => setWaiting(null)} /></CashDialog>}
    {editing && <CashDialog title={editing.plan.execution_confirmed ? "완료 내역" : "입출금 확인"} wide onClose={() => setEditing(null)}><ExecutionEditor plan={editing.plan} initialTransaction={editing.suggested} /></CashDialog>}
    {bank && <CashDialog title="은행거래 연결·확인" wide onClose={() => setBank(null)}><BankExecutionReview id={bank.id} date={bank.trans_at.slice(0,10)} /></CashDialog>}
  </div>;
}

function PendingExecution({ plan, onSaved }: { plan: CashPlan; onSaved: () => void }) {
  const [note,setNote] = useState(plan.review_note?.startsWith("미집행 확인:") ? plan.review_note.slice(7).trim() : "");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  return <form className="cash-form" aria-busy={busy} onSubmit={async e => {
    e.preventDefault();setBusy(true);setError("");
    try { await api(`/accounting/cash/plans/${plan.id}/review`,{method:"POST",body:JSON.stringify({version:plan.version,complete:false,note:`미집행 확인: ${note.trim()}`,items:[]})});onSaved(); }
    catch(e) {setError(e instanceof Error ? e.message : "저장하지 못했습니다.");} finally {setBusy(false);}
  }}><strong>{plan.title} · {plan.planned_date}</strong><p>입출금이 아직 발생하지 않았음을 기록합니다. 계획과 잔여 예산은 유지되고, 이후 거래가 들어오면 다시 추천됩니다.</p><label className="execution-note">미집행 사유 / 다음 확인 일정<textarea required maxLength={990} value={note} onChange={e=>setNote(e.target.value)} placeholder="예: 거래처 지급 지연, 11월 20일 다시 확인" /></label><p>일정·금액이 바뀌거나 계획이 취소됐다면 <Link href="/accounting/plans">입출금 계획에서 수정·취소</Link>하세요.</p>{error && <p role="alert" className="cash-error">{error}</p>}<footer><button className="cash-create" disabled={busy || !note.trim()}>미집행으로 기록</button></footer></form>;
}
