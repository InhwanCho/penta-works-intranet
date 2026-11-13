"use client";
import { MatchRuleEditor } from "./match-rule-editor";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";
import { cashMoney as money, withinCashTolerance, planStatus, shiftDate, type CashPlan } from "@/lib/cash-planning";
import { minute } from "@/lib/accounting-format";
import { AccountingLoader } from "./loading-indicator";
type Candidate = { id: number; trans_at: string; description: string; counterparty_text: string; account_name: string; available: number; reversal: boolean; recommended: boolean; text_match: boolean; reason: string };
type MatchData = { effectiveKeywords: string[]; plan: CashPlan; candidates: Candidate[]; allocations: { id: number; allocated_amount: number; settled_at: string; description: string; account_name: string }[] };
const errorText = (e: unknown) => e instanceof Error ? e.message : "처리하지 못했습니다.";
export function ExecutionEditor({ plan, initialTransaction }: { plan: CashPlan; initialTransaction?: { id: number; available: number; trans_at: string } }) {
  const [from, setFrom] = useState(initialTransaction ? initialTransaction.trans_at.slice(0, 10) : shiftDate(plan.planned_date, -(plan.match_days ?? 7)));
  const [to, setTo] = useState(initialTransaction ? initialTransaction.trans_at.slice(0, 10) : shiftDate(plan.planned_date, plan.match_days ?? 7));
  const [selection, setSelection] = useState<Record<number, number>>(initialTransaction && !plan.execution_confirmed && Number(initialTransaction.available) > 0 ? { [initialTransaction.id]: Number(initialTransaction.available) } : {});
  const [note, setNote] = useState(plan.review_note ?? "");
  const [showAll, setShowAll] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const valid = !!from && !!to && to >= from && (Date.parse(to) - Date.parse(from)) / 86400000 < 200;
  const path = `/accounting/cash/plans/${plan.id}`;
  const data = useApiQuery<MatchData>(`${path}/matches?from=${from}&to=${to}`, valid);
  const current = data.data?.plan ?? plan;
  const candidates = data.data?.candidates ?? [];
  const selected = Object.entries(selection);
  const shownCandidates = (showAll || !!search || !candidates.some(c => c.recommended) ? candidates : candidates.filter(c => c.recommended || selection[c.id] !== undefined)).filter(c => `${c.description} ${c.counterparty_text}`.includes(search));
  const net = Number(current.settled) + selected.reduce((sum, [id, value]) => sum + (candidates.find(c => c.id === Number(id))?.reversal ? -value : value), 0);
  const within = withinCashTolerance(Number(current.amount), net);
  const validSelection = selected.every(([id, value]) => Number.isInteger(value) && value > 0 && value <= Number(candidates.find(c => c.id === Number(id))?.available ?? 0));
  async function action(endpoint: string, body: unknown, message: string, method = "POST") {
    setBusy(true); setError(""); setNotice("");
    try { await api(endpoint, { method, body: JSON.stringify(body) }); setSelection({}); await data.refetch(); setNotice(message); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  function confirm(complete: boolean) {
    void action(`${path}/review`, { version: current.version, complete, note, items: selected.map(([id, amount]) => ({ transactionId: Number(id), amount, requestKey: crypto.randomUUID() })) }, complete ? "집행 완료로 확정했습니다. 예산 차액은 잔여 계획에서 제외됩니다." : "연결 내역을 저장했습니다. 계획은 확인 대기로 남습니다.");
  }
  return <form className="cash-match" aria-busy={busy} onSubmit={e => e.preventDefault()}>
    <div className="cash-match-summary"><strong>{current.title} · {planStatus(current)}</strong><span>예산 {Number(current.amount) ? money(current.amount) : "미정"} · 실제 집행 {money(current.settled)}</span><small>예산과 ±20% 또는 차액 1만 원 이하는 정상 범위입니다. 완료 여부는 담당자가 확정합니다.</small></div>

    {!!data.data?.allocations.length && <section><h3>연결된 실제 거래</h3>{data.data.allocations.map(a => <div className="cash-allocation" key={a.id}><span>{Number(a.allocated_amount) < 0 ? "반환 · " : ""}{a.description || "은행거래"}<small>{a.account_name} · {minute(a.settled_at)}</small></span><strong>{money(a.allocated_amount)}</strong><button type="button" disabled={busy || data.isFetching} onClick={() => { if (window.confirm("연결을 해제하고 집행 확인을 다시 열까요?")) void action(`${path}/allocations/${a.id}/void`, {}, "연결을 해제했습니다. 다시 확인해주세요."); }}>연결 해제</button></div>)}</section>}
    {!current.execution_confirmed && <details className="review-find-more"><summary>다른 거래 찾기 · 기간과 검색 변경</summary>    <div className="cash-list-filters"><label>시작일<input type="date" value={from} onChange={e => { setFrom(e.target.value); setSelection({}); }} /></label><label>종료일<input type="date" value={to} onChange={e => { setTo(e.target.value); setSelection({}); }} /></label><label>거래 검색<input value={search} onChange={e => setSearch(e.target.value)} /></label></div><button type="button" onClick={() => setShowAll(true)}>추천 외 거래도 모두 보기</button></details>}
    {!current.execution_confirmed && <p className="review-selection-guide">{selected.length ? `${selected.length}건 선택됨 · 아래 거래가 맞으면 확인 완료를 눌러주세요.` : "계획에 해당하는 거래를 선택해주세요. 추천 거래를 먼저 보여드립니다."}</p>}
    {!valid && <p role="alert">조회 기간은 200일 이내로 선택해주세요.</p>}{data.isLoading && <AccountingLoader label="은행거래 자동 탐색 중" />}{data.isError && <p role="alert" className="cash-error">{data.error.message}</p>}
    {!current.execution_confirmed && <div className="cash-candidates">{shownCandidates.map(c => <div className={`cash-candidate-row${selection[c.id] !== undefined ? " review-candidate-selected" : ""}`} key={c.id}><label className="cash-candidate-check"><input type="checkbox" disabled={busy || current.execution_confirmed} checked={selection[c.id] !== undefined} onChange={e => setSelection(previous => { const next = { ...previous }; if (e.target.checked) next[c.id] = Number(c.available); else delete next[c.id]; return next; })} /><span>{c.description || c.counterparty_text || "은행거래"}<small>{minute(c.trans_at)} · {c.account_name} · {c.reason}</small></span><strong>{money(c.available)}<small>{c.reversal ? "반환·취소 방향" : c.recommended ? "자동 추천 · 확인 대기" : "직접 확인"}</small></strong></label>{selection[c.id] !== undefined && (advanced || selection[c.id] !== Number(c.available)) && <label className="execution-allocation-input">이 계획에 반영할 금액<input aria-label={`${c.description || c.id} 반영 금액`} type="number" min={1} max={Number(c.available)} step={1} value={selection[c.id]} onChange={e => setSelection(p => ({ ...p, [c.id]: Number(e.target.value) }))} disabled={busy} /></label>}</div>)}{data.data && !shownCandidates.length && <p>연결할 거래가 없습니다. 날짜 범위를 넓히거나 은행 수집 상태를 확인하세요.</p>}</div>}

    {(!current.execution_confirmed || !!note) && <details className="review-note-details" open={!within && net > 0}><summary>{!within && net > 0 ? "확인 사유 입력이 필요합니다" : "메모 남기기 (선택)"}</summary><label className="execution-note">확인 메모<textarea maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="정상 범위 밖 또는 금액 미정의 완료에는 사유를 입력해주세요." /></label></details>}
    <div className="cash-match-submit"><span>반영 후 실제 집행 <b>{money(net)}</b>{within && " · 정상 금액 범위"}</span>{current.execution_confirmed ? <button type="button" disabled={busy || data.isFetching} onClick={() => confirm(false)}>완료 해제 · 재검토</button> : <>{advanced && <button type="button" disabled={busy || data.isFetching || !data.data || !validSelection || !valid} onClick={() => confirm(false)}>일부 집행 / 반환 저장</button>}<button type="button" className="cash-create" disabled={busy || data.isFetching || !data.data || !valid || !validSelection || net <= 0 || (!within && !note.trim())} onClick={() => confirm(true)}>입출금 확인 완료</button></>}</div>
    {!current.execution_confirmed && <button type="button" className="review-advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced(v => !v)}>{advanced ? "일반 확인으로 돌아가기" : "분할·합산·반환 처리하기"}</button>}
    {data.data && <MatchRuleEditor key={`${current.match_keywords}:${current.match_days}`} plan={current} effectiveKeywords={data.data.effectiveKeywords ?? []} suggestions={candidates.flatMap(c=>[c.description,c.counterparty_text]).filter(Boolean)} disabled={busy || data.isFetching} onSave={(keywords,days)=>action(`${path}/match-rule`,{version:current.version,keywords,days},"식별 규칙을 저장했습니다.","PUT")} />}
    {current.execution_confirmed && <p>추가 거래나 반환을 연결하려면 먼저 완료를 해제하세요.</p>}{!within && net > 0 && <p className="cash-muted">정상 범위 밖이어도 사유를 남기고 완료할 수 있습니다.</p>}{!validSelection && <p className="cash-error">반영 금액은 각 거래의 미연결 금액 이내 정수로 입력해주세요.</p>}{error && <p role="alert" className="cash-error">{error}</p>}{notice && <p role="status" className="cash-notice">{notice}</p>}
  </form>;
}
