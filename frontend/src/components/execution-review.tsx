"use client";
import { useState } from "react";
import Link from "next/link";
import { CashWorkflow } from "./cash-workflow";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";
import { cashMoney as money, withinCashTolerance, monthBounds, planStatus, seoulToday, shiftDate, type CashPlan } from "@/lib/cash-planning";
import { minute } from "@/lib/accounting-format";
import { CashDialog } from "./cash-dialog";
import { AccountingLoader } from "./loading-indicator";

type Candidate = { id: number; trans_at: string; description: string; counterparty_text: string; account_name: string; available: number; reversal: boolean; recommended: boolean; text_match: boolean; reason: string };
type ReviewPlan = CashPlan & { recommendations: Candidate[] };
type ReviewData = { plans: ReviewPlan[]; unlinked: (Candidate & { deposit_amount: number; withdraw_amount: number })[]; accounts: { alias: string; last_sync_at: string | null; last_sync_error: string | null }[] };
type MatchData = { plan: CashPlan; candidates: Candidate[]; allocations: { id: number; allocated_amount: number; settled_at: string; description: string; account_name: string }[] };
const needsReview = (p: ReviewPlan) => !p.execution_confirmed || (Number(p.settled) > 0 && p.recommendations.some(c => c.reversal));
const errorText = (e: unknown) => e instanceof Error ? e.message : "처리하지 못했습니다.";

export function ExecutionReview() {
  const [month, setMonth] = useState(seoulToday().slice(0, 7));
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CashPlan | null>(null);
  const bounds = monthBounds(month);
  const data = useApiQuery<ReviewData>(`/accounting/cash/review?from=${bounds.from}&to=${bounds.to}`, !!month);
  const plans = data.data?.plans ?? [];
  const visible = plans.filter(p => (filter === "all" || (filter === "done" ? p.execution_confirmed : needsReview(p))) && `${p.title} ${p.counterparty_name}`.includes(search));
  return <div className="cash-workspace execution-review">
    <header className="accounting-section-head"><div><h2>입출금 확인</h2><p>적요로 자동 탐색하고, 담당자가 실제 집행을 최종 확정합니다.</p></div><Link href="/accounting/banks">은행거래 →</Link></header>
    <CashWorkflow step="review" />
    <div className="cash-list-filters"><label>계획 기준월<input type="month" value={month} onChange={e => setMonth(e.target.value)} /></label><label>표시<select value={filter} onChange={e => setFilter(e.target.value)}><option value="pending">확인할 계획</option><option value="done">완료</option><option value="all">전체</option></select></label><label>검색<input value={search} placeholder="계획명, 거래처" onChange={e => setSearch(e.target.value)} /></label><button onClick={() => void data.refetch()} disabled={data.isFetching}>통장 거래 다시 찾기</button></div>
    <p className="cash-muted">기본 전후 7일 · 금액 ±20% 또는 차액 1만 원 이하 · 추천은 완료가 아닙니다. 이전 달의 미완료 계획도 포함합니다.</p>
    <div className="execution-counts"><strong>확인 대기 {plans.filter(needsReview).length}건</strong><span>적요 후보 있음 {plans.filter(p => !p.execution_confirmed && p.recommendations.some(c => !c.reversal)).length}건</span><span>완료 {plans.filter(p => p.execution_confirmed).length}건</span></div>
    {data.isLoading && <AccountingLoader label="적요를 대조하는 중" />}{data.isError && <p role="alert" className="cash-error">{data.error.message}</p>}
    <section className="cash-panel"><div className="cash-table-scroll"><table className="cash-table"><thead><tr><th>계획 / 예정일</th><th>예산</th><th>자동 탐색 결과</th><th>확인 상태</th><th>확인</th></tr></thead><tbody>{visible.map(p => <tr key={p.id}><td><strong>{p.title}</strong><small>{p.planned_date} · {p.direction === "IN" ? "입금" : "출금"} · {p.account_name || "전체 계좌"}</small></td><td>{Number(p.amount) ? money(p.amount) : "금액 미정"}<small>실제 연결 {money(p.settled)}</small></td><td>{p.recommendations.length ? <><strong>{p.recommendations.filter(c => !c.reversal).length}건의 입출금 후보</strong>{p.recommendations.slice(0, 2).map(c => <small key={c.id}>{c.description || c.counterparty_text} · {money(c.available)} · {c.reason}</small>)}{p.recommendations.length > 2 && <small>외 {p.recommendations.length - 2}건</small>}</> : "적요 후보 없음"}</td><td>{planStatus(p)}{p.recommendations.some(c => c.reversal) && Number(p.settled) > 0 && <small className="cash-error">반환 후보 재확인</small>}{p.reviewed_at && <small>최종 확인 {minute(p.reviewed_at)}</small>}</td><td><button onClick={() => setEditing(p)}>{p.execution_confirmed ? "내역·재검토" : "거래 확인"}</button></td></tr>)}</tbody></table>{data.data && !visible.length && <p className="cash-empty">해당하는 계획이 없습니다.</p>}</div></section>
    <details className="cash-panel"><summary>계획과 연결되지 않은 거래 · {data.data?.unlinked.length ?? 0}건</summary><p>선택 월의 미배분 거래입니다. 기존 계획의 검토 화면에서 날짜를 넓혀 연결하거나 새 계획을 등록하세요. 일부 배분된 거래는 남은 금액만 표시합니다.</p><Link href="/accounting/plans">입출금 계획 등록 →</Link><div className="cash-table-scroll"><table className="cash-table"><thead><tr><th>일시 / 계좌</th><th>적요</th><th>구분</th><th>미연결 금액</th></tr></thead><tbody>{data.data?.unlinked.map(t => <tr key={t.id}><td>{minute(t.trans_at)}<small>{t.account_name}</small></td><td>{t.description || t.counterparty_text}</td><td>{Number(t.deposit_amount) > 0 ? "입금" : "출금"}</td><td>{money(t.available)}</td></tr>)}</tbody></table></div></details>
    <details className="cash-panel"><summary>은행 데이터 수집 상태</summary><p>거래가 없다는 사실만으로 미집행을 확정하지 않습니다. 마지막 수집 시각과 은행거래 조회 기간을 확인하세요.</p>{data.data?.accounts.map(a => <p key={a.alias}>{a.alias} · {a.last_sync_at ? minute(a.last_sync_at) : "수집 기록 없음"}{a.last_sync_error && ` · 수집 오류: ${a.last_sync_error}`}</p>)}</details>
    {editing && <CashDialog title="집행 검토 및 확정" wide onClose={() => setEditing(null)}><ExecutionEditor plan={editing} /></CashDialog>}
  </div>;
}

export function ExecutionEditor({ plan, initialTransaction }: { plan: CashPlan; initialTransaction?: { id: number; available: number; trans_at: string } }) {
  const [from, setFrom] = useState(initialTransaction ? initialTransaction.trans_at.slice(0, 10) : shiftDate(plan.planned_date, -(plan.match_days ?? 7)));
  const [to, setTo] = useState(initialTransaction ? initialTransaction.trans_at.slice(0, 10) : shiftDate(plan.planned_date, plan.match_days ?? 7));
  const [selection, setSelection] = useState<Record<number, number>>(initialTransaction && !plan.execution_confirmed && Number(initialTransaction.available) > 0 ? { [initialTransaction.id]: Number(initialTransaction.available) } : {});
  const [keywords, setKeywords] = useState(plan.match_keywords ?? "");
  const [days, setDays] = useState(plan.match_days ?? 7);
  const [note, setNote] = useState(plan.review_note ?? "");
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
    <details><summary>자동 식별 규칙</summary><div className="cash-list-filters"><label>적요 검색어 (쉼표로 구분)<input value={keywords} maxLength={500} placeholder="건강보험, 건보" onChange={e => setKeywords(e.target.value)} /></label><label>예정일 전후 일수<input type="number" min={0} max={14} value={days} onChange={e => setDays(Number(e.target.value))} /></label><button type="button" disabled={busy || data.isFetching || !Number.isInteger(days)} onClick={() => void action(`${path}/match-rule`, { version: current.version, keywords, days }, "식별 규칙을 저장했습니다. 다음 탐색부터 적용됩니다.", "PUT")}>규칙 저장</button></div><p className="cash-muted">비워두면 거래처명·계획명을 적요와 대조합니다. 검색어 중 하나가 포함되면 후보입니다. 규칙은 이 계획에 적용됩니다.</p></details>
    {!!data.data?.allocations.length && <section><h3>연결된 실제 거래</h3>{data.data.allocations.map(a => <div className="cash-allocation" key={a.id}><span>{Number(a.allocated_amount) < 0 ? "반환 · " : ""}{a.description || "은행거래"}<small>{a.account_name} · {minute(a.settled_at)}</small></span><strong>{money(a.allocated_amount)}</strong><button type="button" disabled={busy || data.isFetching} onClick={() => { if (window.confirm("연결을 해제하고 집행 확인을 다시 열까요?")) void action(`${path}/allocations/${a.id}/void`, {}, "연결을 해제했습니다. 다시 확인해주세요."); }}>연결 해제</button></div>)}</section>}
    <div className="cash-list-filters"><label>시작일<input type="date" value={from} onChange={e => { setFrom(e.target.value); setSelection({}); }} /></label><label>종료일<input type="date" value={to} onChange={e => { setTo(e.target.value); setSelection({}); }} /></label><label>거래 검색<input value={search} onChange={e => setSearch(e.target.value)} /></label></div>
    <p className="cash-muted">적요 후보가 먼저 표시됩니다. 여러 건을 선택하면 분할 집행, 반영 금액을 줄이면 합산 거래를 여러 계획에 나눠 연결할 수 있습니다. 반환은 실제 집행액에서 차감됩니다.</p>
    {!valid && <p role="alert">조회 기간은 200일 이내로 선택해주세요.</p>}{data.isLoading && <AccountingLoader label="은행거래 자동 탐색 중" />}{data.isError && <p role="alert" className="cash-error">{data.error.message}</p>}
    <div className="cash-candidates">{candidates.filter(c => `${c.description} ${c.counterparty_text}`.includes(search)).map(c => <div className="cash-candidate-row" key={c.id}><label className="cash-candidate-check"><input type="checkbox" disabled={busy || current.execution_confirmed} checked={selection[c.id] !== undefined} onChange={e => setSelection(previous => { const next = { ...previous }; if (e.target.checked) next[c.id] = Number(c.available); else delete next[c.id]; return next; })} /><span>{c.description || c.counterparty_text || "은행거래"}<small>{minute(c.trans_at)} · {c.account_name} · {c.reason}</small></span><strong>{money(c.available)}<small>{c.reversal ? "반환·취소 방향" : c.recommended ? "자동 추천 · 확인 대기" : "직접 확인"}</small></strong></label>{selection[c.id] !== undefined && <label className="execution-allocation-input">이 계획에 반영할 금액<input aria-label={`${c.description || c.id} 반영 금액`} type="number" min={1} max={Number(c.available)} step={1} value={selection[c.id]} onChange={e => setSelection(p => ({ ...p, [c.id]: Number(e.target.value) }))} disabled={busy} /></label>}</div>)}{data.data && !candidates.length && <p>연결할 거래가 없습니다. 날짜 범위를 넓히거나 은행 수집 상태를 확인하세요.</p>}</div>
    <label className="execution-note">확인 메모<textarea maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="정상 범위 밖 또는 금액 미정의 완료에는 사유를 입력해주세요." /></label>
    <div className="cash-match-submit"><span>반영 후 실제 집행 <b>{money(net)}</b>{within && " · 정상 금액 범위"}</span>{current.execution_confirmed ? <button type="button" disabled={busy || data.isFetching} onClick={() => confirm(false)}>완료 해제 · 재검토</button> : <><button type="button" disabled={busy || data.isFetching || !data.data || !validSelection || !valid} onClick={() => confirm(false)}>일부 집행 / 반환 저장</button><button type="button" className="cash-create" disabled={busy || data.isFetching || !data.data || !valid || !validSelection || net <= 0 || (!within && !note.trim())} onClick={() => confirm(true)}>입출금 확인 완료</button></>}</div>
    {current.execution_confirmed && <p>추가 거래나 반환을 연결하려면 먼저 완료를 해제하세요.</p>}{!within && net > 0 && <p className="cash-muted">정상 범위 밖이어도 사유를 남기고 완료할 수 있습니다.</p>}{!validSelection && <p className="cash-error">반영 금액은 각 거래의 미연결 금액 이내 정수로 입력해주세요.</p>}{error && <p role="alert" className="cash-error">{error}</p>}{notice && <p role="status" className="cash-notice">{notice}</p>}
  </form>;
}
