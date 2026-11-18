"use client";
import { useResetListFilters } from "@/lib/use-reset-list-filters";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { api } from "@/lib/api";
import { useState } from "react";
import { useApiQuery } from "@/lib/use-api-query";
import { cashMoney as money, monthBounds, seoulToday, type CashPlan, type CashData } from "@/lib/cash-planning";
import { minute } from "@/lib/accounting-format";
import { CashDialog } from "./cash-dialog";
import { AccountingLoader } from "./loading-indicator";
import { ExecutionEditor } from "./execution-editor";
import { BankExecutionReview } from "./bank-execution-review";
import { PlanEditor } from "./cash-workspace";
import { BatchCashPlans } from "./batch-cash-plans";
import { TableColumnFilter, emptyColumnFilter, type ColumnFilterValue } from "./table-column-filter";
import { planStatus } from "@/lib/cash-planning";
import { uniqueRecommendation } from "@/lib/execution-recommendations";

type Candidate = { id: number; trans_at: string; description: string; counterparty_text: string; account_name: string; available: number; reversal: boolean; recommended: boolean; reason: string };
type ReviewPlan = CashPlan & { recommendations: Candidate[] };
type BankTransaction = Candidate & { deposit_amount: number; withdraw_amount: number; review_note?: string; reviewed_at?: string };
type ReviewData = { plans: ReviewPlan[]; unlinked: BankTransaction[]; reviewedTransactions?: BankTransaction[]; accounts: { alias: string; last_sync_at: string | null; last_sync_error: string | null }[] };
const reviewStatus = (p: ReviewPlan) => p.status !== "VOID" && Number(p.settled) > 0 && p.recommendations.some(c => c.reversal) ? "반환 확인" : planStatus(p);
const needsReview = (p: ReviewPlan) => p.status !== "VOID" && (!p.execution_confirmed || (Number(p.settled) > 0 && p.recommendations.some(c => c.reversal)));

export function ExecutionReview() {
  const [selected, setSelected] = useState<number[]>([]);
  const [batch, setBatch] = useState<{plan: ReviewPlan; transaction: Candidate}[] | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchResults, setBatchResults] = useState<Record<number,string>>({});
  const [batchFinished, setBatchFinished] = useState(false);
  const [month, setMonth] = useState(seoulToday().slice(0, 7));
  const [tab, setTab] = useState("all");
  const [editor, setEditor] = useState<CashPlan | "new" | "batch" | null>(null);
  const [notice, setNotice] = useState("");
  const [direction, setDirection] = useState("");
  const [account, setAccount] = useState("");
  const [schedule, setSchedule] = useState<ColumnFilterValue>(emptyColumnFilter);
  const [searchInput, setSearch] = useState("");
  const debouncedSearch=useDebouncedValue(searchInput);
  const search = searchInput ? debouncedSearch : "";
  const [editing, setEditing] = useState<{ plan: CashPlan; suggested?: Candidate } | null>(null);
  const [bank, setBank] = useState<BankTransaction | null>(null);
  const active = useResetListFilters(() => {
    setSearch(""); setMonth(seoulToday().slice(0, 7)); setTab("all");
    setAccount(""); setDirection(""); setSchedule(emptyColumnFilter); setSelected([]); setNotice("");
  });
  const bounds = monthBounds(month);
  const data = useApiQuery<ReviewData>(`/accounting/cash/review?from=${bounds.from}&to=${bounds.to}`, active && !!month);
  const workspace = useApiQuery<CashData>(`/accounting/cash?from=${bounds.from}&to=${bounds.to}&view=plans&includeEarlier=false`, active && !!month);
  const accounts = workspace.data?.accounts ?? [];
  const plans: ReviewPlan[] = [...(data.data?.plans ?? []), ...(workspace.data?.plans ?? []).filter(p => p.status === "VOID").map(p => ({...p, recommendations: []}))];
  const saved = (message: string) => { setEditor(null); setSelected([]); setNotice(message); void data.refetch(); void workspace.refetch(); };
  const pending = plans.filter(needsReview);
  const completed = plans.filter(p => p.execution_confirmed && !needsReview(p));
  const standalone = data.data?.reviewedTransactions ?? [];
  const visible = (tab === "done" ? completed : tab === "plans" ? pending : plans).filter(p =>
    `${p.title} ${p.counterparty_name} ${p.memo}`.toLowerCase().includes(search.toLowerCase()) &&
    (!direction || p.direction === direction) && (!account || String(p.account_id) === account) &&
    (!schedule.from || p.planned_date >= schedule.from) && (!schedule.to || p.planned_date <= schedule.to) &&
    (schedule.selected === null || schedule.selected.includes(reviewStatus(p)))
  ).sort((a,b) => (a.planned_date.localeCompare(b.planned_date) || a.id - b.id) * (schedule.sort === "desc" ? -1 : 1));
  const bankRows = (tab === "done" ? standalone : data.data?.unlinked ?? []).filter(t => `${t.description} ${t.counterparty_text}`.includes(search));
  const eligible = visible.flatMap(plan => {
    const transaction = plan.status !== "VOID" && !plan.execution_confirmed && Number(plan.settled) === 0 ? uniqueRecommendation(plan, plans) : undefined;
    return transaction ? [{plan, transaction}] : [];
  });
  const selectedRows = eligible.filter(row => selected.includes(row.plan.id));
  async function confirmBatch() {
    if (!batch || batchBusy || batchFinished) return;
    setBatchBusy(true);
    let failed = false;
    for (const {plan, transaction} of batch) {
      try {
        await api(`/accounting/cash/plans/${plan.id}/review`, {method:"POST",body:JSON.stringify({version:plan.version,complete:true,note:plan.review_note ?? "",items:[{transactionId:transaction.id,amount:Number(transaction.available),requestKey:crypto.randomUUID()}]})});
        setBatchResults(previous=>({...previous,[plan.id]:"확인 완료"}));
      } catch (error) {
        failed = true;
        setBatchResults(previous=>({...previous,[plan.id]:error instanceof Error ? error.message : "처리하지 못했습니다. 개별 확인해주세요."}));
      }
    }
    setSelected([]);
    if (failed) setBatchFinished(true);
    else setBatch(null);
    setBatchBusy(false);
    void data.refetch();
  }
  return <div className="cash-workspace accounting-office execution-review review-hub">
    <header className="accounting-section-head"><h2>입출금 계획</h2><div className="cash-actions"><button className="cash-create" disabled={!workspace.data} onClick={() => setEditor("new")}>계획 등록</button><button disabled={!workspace.data} onClick={() => setEditor("batch")}>여러 건 등록</button></div></header>
    {notice && <p role="status">{notice}</p>}
    <div className="review-toolbar accounting-filter-bar"><label>기준월<input type="month" value={month} onChange={e => {setMonth(e.target.value);setSelected([]);}} /></label><label>검색<input value={searchInput} placeholder="계획명 또는 통장 적요" onChange={e => {setSearch(e.target.value);setSelected([]);}} /></label><label>계좌<select value={account} onChange={e => {setAccount(e.target.value);setSelected([]);}}><option value="">전체 계좌</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.alias}</option>)}</select></label><small>전후 7일 기본 · ±20% 또는 차액 1만 원 이하 정상</small></div>
    <nav className="review-tabs" aria-label="목록 필터"><button aria-pressed={tab === "all"} onClick={() => {setSelected([]);setTab("all");}}>전체 계획 <b>{plans.length}</b></button><button aria-pressed={tab === "plans"} onClick={() => {setSelected([]);setTab("plans");}}>확인할 계획 <b>{pending.length}</b></button><button aria-pressed={tab === "bank"} onClick={() => {setSelected([]);setTab("bank");}}>미연결 거래 <b>{data.data?.unlinked.length ?? 0}</b></button><button aria-pressed={tab === "done"} onClick={() => {setSelected([]);setTab("done");}}>완료 내역 <b>{completed.length + standalone.length}</b></button></nav>
    {workspace.isError && <p role="alert" className="cash-error">{workspace.error.message}</p>}
    {data.isLoading && <AccountingLoader label="계획에 맞는 통장 거래를 찾는 중" />}{data.isError && <p role="alert" className="cash-error">{data.error.message}</p>}
    {tab !== "bank" && <div className="review-batch-toolbar"><strong>{selectedRows.length}건 선택</strong><button className="cash-create" disabled={!selectedRows.length || data.isFetching} onClick={()=>{setBatch(selectedRows);setBatchResults({});setBatchFinished(false);}}>선택한 추천 거래 확인</button><small>추천이 한 건으로 구분되는 계획만 다중 확인할 수 있습니다. 후보 중복·분할·반환은 개별 확인해주세요.</small></div>}
    {tab !== "bank" && <section className="review-plan-list" aria-label="계획 확인 목록"><div className="cash-table-scroll"><table className="cash-table review-compact-table"><thead><tr>{tab !== "bank" && <th className="review-select-cell"><input type="checkbox" aria-label="확인 가능한 계획 전체 선택" disabled={!eligible.length || data.isFetching} checked={eligible.length>0 && selectedRows.length===eligible.length} ref={node=>{if(node)node.indeterminate=selectedRows.length>0 && selectedRows.length<eligible.length;}} onChange={e=>setSelected(e.target.checked?eligible.map(row=>row.plan.id):[])} /></th>}<th><TableColumnFilter label="예정일 / 상태" dates value={schedule} onChange={next => {setSchedule(next);setSelected([]);}} options={["예정 · 확인 대기","거래 미확인","집행 연결 · 확정 대기","재확인 필요","반환 확인","완료","취소"].map(value=>({value,label:value}))} /></th><th><TableColumnFilter label="입출금" value={{...emptyColumnFilter,selected:direction ? direction === "NONE" ? [] : [direction] : null}} onChange={next => {setDirection(next.selected === null || next.selected.length === 2 ? "" : next.selected[0] ?? "NONE");setSelected([]);}} options={[{value:"IN",label:"입금"},{value:"OUT",label:"출금"}]} /></th><th>계획 / 계좌</th><th>예상 금액</th><th>추천 거래 / 실제 입출금</th><th>확인</th></tr></thead><tbody>{visible.map(p => {
      const candidates = p.recommendations.filter(c => c.recommended);
      const suggested = !p.execution_confirmed ? uniqueRecommendation(p, plans) : undefined;

      const waitingNote = p.review_note?.startsWith("미집행 확인:") ? p.review_note.slice(7).trim() : "";
      return <tr key={p.id}>{tab !== "bank" && <td className="review-select-cell"><input type="checkbox" aria-label={`${p.title} 선택`} title={eligible.some(row=>row.plan.id===p.id)?"다중 확인에 포함":"추천 거래를 개별 확인해주세요"} disabled={data.isFetching || !eligible.some(row=>row.plan.id===p.id)} checked={selectedRows.some(row=>row.plan.id===p.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/></td>}<td>{p.planned_date}<small>{reviewStatus(p)}</small></td><td>{p.direction === "IN" ? "입금" : "출금"}</td><td><button type="button" className="review-plan-title" aria-label={`${p.title} ${p.status === "VOID" ? "계획 보기" : "계획 수정"}`} title={p.status === "VOID" ? "계획 보기" : "계획 수정"} disabled={!workspace.data} onClick={() => setEditor(p)}>{p.title}</button><small>{p.counterparty_name || p.category_name || "—"}</small>{p.memo && <small className="cash-memo">{p.memo}</small>}<small>{p.account_name || "계좌 미지정"}</small></td><td className="number">{Number(p.amount) ? money(p.amount) : "금액 미정"}</td><td>{p.status === "VOID" ? <span>취소된 계획</span> : p.execution_confirmed ? <><strong>{money(p.settled)}</strong><small>{p.reviewed_at ? minute(p.reviewed_at) : "기존 확인 내역"}</small></> : candidates.length ? <>{candidates.slice(0,2).map(c => <div className="review-transaction-line" key={c.id}><strong>{money(c.available)}</strong><span>{c.description || c.counterparty_text}</span><small>{c.trans_at.slice(0,10)} · {c.account_name}</small></div>)}{candidates.length>2 && <small>외 {candidates.length-2}건</small>}</> : Number(p.settled)>0 ? <><strong>{money(p.settled)}</strong><small>연결된 거래 확인 필요</small></> : <><span>거래 미확인</span><small>{waitingNote || "거래를 찾거나 미집행으로 기록하세요."}</small></>}</td><td><div className="review-row-actions"><button onClick={() => setEditor(p)} disabled={!workspace.data}>{p.status === "VOID" ? "계획 보기" : "계획 수정"}</button>{p.status !== "VOID" && <button className="review-plan-action" onClick={() => setEditing({plan:p,suggested})}>{p.execution_confirmed && !needsReview(p) ? "내역 보기" : "집행 확인"}</button>}</div></td></tr>;
    })}</tbody></table></div>{data.data && !visible.length && <p className="cash-empty">{tab === "done" ? "완료된 계획이 없습니다." : "확인할 계획이 없습니다."}</p>}</section>}
    {(tab === "bank" || tab === "done") && <section className="review-plan-list" aria-label="은행거래 확인 목록"><h3>{tab === "done" ? "계획 없이 확인한 거래" : "계획에 아직 연결되지 않은 거래"}</h3><p className="cash-muted">{tab === "done" ? "확인 사유를 보거나 확인을 해제할 수 있습니다." : "해당 계획을 찾아 연결하거나, 계획 없는 거래로 확인하세요. 일부 연결된 거래는 남은 금액을 표시합니다."}</p>{bankRows.map(t => <article className="review-bank-card" key={t.id}><div><h3>{t.description || t.counterparty_text || "은행거래"}</h3><small>{minute(t.trans_at)} · {t.account_name}</small>{tab === "done" && <p>{t.review_note}</p>}</div><strong>{Number(t.deposit_amount) > 0 ? "입금" : "출금"} {money(tab === "done" ? Number(t.deposit_amount) + Number(t.withdraw_amount) : t.available)}</strong><button onClick={() => setBank(t)}>{tab === "done" ? "확인 내역 보기" : "계획 연결·확인"}</button></article>)}{data.data && !bankRows.length && <p className="cash-empty">표시할 거래가 없습니다.</p>}</section>}
    <details className="cash-panel review-help"><summary>은행 수집 상태와 확인 기준</summary><p>거래가 보이지 않으면 은행거래 메뉴에서 수집 기간을 확인하세요. 추천되지 않아도 직접 연결할 수 있으며, 정상 금액 범위를 넘으면 사유를 남겨 완료할 수 있습니다.</p>{data.data?.accounts.map((a,i) => <p key={i}>{a.alias} · 마지막 수집 {a.last_sync_at ? minute(a.last_sync_at) : "기록 없음"}{a.last_sync_error && ` · 오류: ${a.last_sync_error}`}</p>)}</details>
    {editor === "batch" && <CashDialog wide title="입출금 계획 여러 건 등록" onClose={() => setEditor(null)}><BatchCashPlans date={month === seoulToday().slice(0,7) ? seoulToday() : bounds.from} direction={direction === "NONE" ? "" : direction} accountId={account} accounts={accounts} onSaved={saved} /></CashDialog>}
    {editor && editor !== "batch" && <CashDialog title={editor === "new" ? "입출금 계획 등록" : "계획 상세·수정"} onClose={() => setEditor(null)}><PlanEditor plan={editor === "new" ? null : editor} bill={editor !== "new" && !!editor.card_issuer} date={month === seoulToday().slice(0,7) ? seoulToday() : bounds.from} accounts={accounts} onSaved={saved} /></CashDialog>}
    {batch && <CashDialog title="선택한 입출금 확인" wide closeDisabled={batchBusy} onClose={()=>{if(!batchBusy)setBatch(null);}}><div className="review-batch-dialog" aria-busy={batchBusy}><p>계획과 연결할 거래를 확인한 뒤 완료해주세요. 각 거래의 표시 금액 전체를 반영합니다.</p><div className="cash-table-scroll"><table className="cash-table"><thead><tr><th>계획</th><th>거래 / 계좌</th><th>반영 금액</th><th>결과</th></tr></thead><tbody>{batch.map(({plan,transaction})=><tr key={plan.id}><td><strong>{plan.title}</strong><small><strong>예정일 {plan.planned_date}</strong></small><small>예산 {money(plan.amount)}</small></td><td>{transaction.description || transaction.counterparty_text}<small><strong>{minute(transaction.trans_at)}</strong> · {transaction.account_name}</small></td><td className="number">{money(transaction.available)}</td><td>{batchResults[plan.id] ?? "확인 대기"}</td></tr>)}</tbody></table></div>{batchFinished && <p role="status">{Object.values(batchResults).filter(result=>result==="확인 완료").length} / {batch.length}건 완료. 완료되지 않은 항목은 목록에서 최신 상태를 확인해주세요.</p>}<footer><button disabled={batchBusy} onClick={()=>setBatch(null)}>{batchFinished?"닫기":"취소"}</button>{!batchFinished && <button className="cash-create" disabled={batchBusy} onClick={()=>void confirmBatch()}>{batchBusy?"처리 중…":`${batch.length}건 확인 완료`}</button>}</footer></div></CashDialog>}
    {editing && <CashDialog title={editing.plan.execution_confirmed ? "완료 내역" : "입출금 확인"} wide onClose={() => setEditing(null)}><ExecutionEditor plan={editing.plan} initialTransaction={editing.suggested} onCompleted={() => setEditing(null)} />{!editing.plan.execution_confirmed && Number(editing.plan.settled) === 0 && <details className="review-disclosure pending-execution-disclosure"><summary>아직 집행되지 않았나요?</summary><PendingExecution plan={editing.plan} onSaved={() => setEditing(null)} /></details>}</CashDialog>}
    {bank && <CashDialog title="은행거래 연결·확인" wide onClose={() => setBank(null)}><BankExecutionReview id={bank.id} date={bank.trans_at.slice(0,10)} onCompleted={() => setBank(null)} /></CashDialog>}
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
  }}><strong>{plan.title} · {plan.planned_date}</strong><p>입출금이 아직 발생하지 않았음을 기록합니다. 계획과 잔여 예산은 유지되고, 이후 거래가 들어오면 다시 추천됩니다.</p><label className="execution-note">미집행 사유 / 다음 확인 일정<textarea required maxLength={990} value={note} onChange={e=>setNote(e.target.value)} placeholder="예: 거래처 지급 지연, 11월 20일 다시 확인" /></label><p>일정·금액이 바뀌거나 계획이 취소됐다면 입출금 계획에서 수정·취소하세요.</p>{error && <p role="alert" className="cash-error">{error}</p>}<footer><button className="cash-create" disabled={busy || !note.trim()}>미집행으로 기록</button></footer></form>;
}
