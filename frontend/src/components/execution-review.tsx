"use client";
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
  const [month, setMonth] = useState(seoulToday().slice(0, 7));
  const [tab, setTab] = useState("plans");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ plan: CashPlan; suggested?: Candidate } | null>(null);
  const [bank, setBank] = useState<BankTransaction | null>(null);
  const bounds = monthBounds(month);
  const data = useApiQuery<ReviewData>(`/accounting/cash/review?from=${bounds.from}&to=${bounds.to}`, !!month);
  const plans = data.data?.plans ?? [];
  const pending = plans.filter(needsReview);
  const completed = plans.filter(p => p.execution_confirmed && !needsReview(p));
  const standalone = data.data?.reviewedTransactions ?? [];
  const visible = (tab === "done" ? completed : pending).filter(p => `${p.title} ${p.counterparty_name}`.includes(search)).sort((a,b) => Number(b.recommendations.some(c=>c.recommended)) - Number(a.recommendations.some(c=>c.recommended)));
  const bankRows = (tab === "done" ? standalone : data.data?.unlinked ?? []).filter(t => `${t.description} ${t.counterparty_text}`.includes(search));
  return <div className="cash-workspace execution-review review-hub">
    <header className="accounting-section-head"><div><h2>입출금 확인</h2><p>거래 연결과 완료 처리는 여기에서만 합니다.</p></div><button disabled={data.isFetching} onClick={() => void data.refetch()}>추천 새로고침</button></header>
    <ol className="review-steps"><li><b>1</b> 확인할 계획 선택</li><li><b>2</b> 추천 거래와 비교</li><li><b>3</b> 맞으면 확인 완료</li></ol>
    <div className="review-toolbar"><label>기준월<input type="month" value={month} onChange={e => setMonth(e.target.value)} /></label><label>검색<input value={search} placeholder="계획명 또는 통장 적요" onChange={e => setSearch(e.target.value)} /></label><small>전후 7일 기본 · ±20% 또는 차액 1만 원 이하 정상</small></div>
    <nav className="review-tabs" aria-label="확인 대상"><button aria-pressed={tab === "plans"} onClick={() => setTab("plans")}>확인할 계획 <b>{pending.length}</b></button><button aria-pressed={tab === "bank"} onClick={() => setTab("bank")}>미연결 거래 <b>{data.data?.unlinked.length ?? 0}</b></button><button aria-pressed={tab === "done"} onClick={() => setTab("done")}>완료 내역 <b>{completed.length + standalone.length}</b></button></nav>
    {data.isLoading && <AccountingLoader label="계획에 맞는 통장 거래를 찾는 중" />}{data.isError && <p role="alert" className="cash-error">{data.error.message}</p>}
    {tab !== "bank" && <section className="review-plan-list" aria-label="계획 확인 목록">
      {tab === "plans" && <p className="cash-muted">추천이 있는 계획부터 표시합니다. 이전 달 미완료 계획도 포함됩니다.</p>}
      {visible.map(p => {
        const candidates = p.recommendations.filter(c => c.recommended);
        const suggested = !p.execution_confirmed ? uniqueRecommendation(p, plans) : undefined;
        const returns = p.recommendations.some(c => c.reversal) && Number(p.settled) > 0;
        return <article className="review-plan-card" key={p.id}>
          <div className="review-compare"><div className="review-plan-side"><small>예정했던 {p.direction === "IN" ? "입금" : "출금"}</small><h3>{p.title}</h3><strong>{Number(p.amount) ? money(p.amount) : "금액 미정"}</strong><span>{p.planned_date} · {p.account_name || "계좌 미지정"}</span></div><span className="review-arrow" aria-hidden>→</span>
          <div className="review-bank-side">{tab === "done" ? <><span className="review-pill">확인 완료</span><strong>{money(p.settled)}</strong><small>{p.reviewed_at ? minute(p.reviewed_at) : "기존 확인 내역"}</small></> : returns ? <><span className="review-pill">반환 여부 확인</span><p>반대 방향의 거래가 발견됐습니다.</p><small>기존 연결과 반환 거래를 확인하세요.</small></> : candidates.length ? <><span className="review-pill">{suggested ? "추천 거래" : candidates.length > 1 ? `추천 ${candidates.length}건 · 선택 필요` : "다른 계획과 후보 중복"}</span>{candidates.slice(0,2).map(c => <div key={c.id}><strong>{money(c.available)}</strong><span>{c.description || c.counterparty_text}</span><small>{c.trans_at.slice(0,10)} · {c.account_name}</small></div>)}{candidates.length > 2 && <small>외 {candidates.length - 2}건</small>}</> : <><span className="review-pill neutral">{Number(p.settled) > 0 ? "연결된 거래 있음" : "직접 찾기"}</span><p>{Number(p.settled) > 0 ? "연결한 거래를 보고 완료 여부를 확인해주세요." : p.recommendations.length ? "적요 후보가 있지만 날짜·금액 확인이 필요합니다." : "맞는 거래를 아직 찾지 못했습니다."}</p><small>{Number(p.settled) > 0 ? `이미 연결한 금액 ${money(p.settled)}` : "기간을 넓히거나 적요로 검색할 수 있습니다."}</small></>}</div></div>
          <footer><small>{tab === "done" ? "완료 내역 조회와 확인 해제도 이곳에서 합니다." : suggested ? "추천 내용을 확인한 뒤 완료해주세요." : "추천은 자동 완료가 아닙니다."}</small><button className="cash-create" onClick={() => setEditing({ plan: p, suggested })}>{tab === "done" ? "완료 내역 보기" : returns ? "반환 거래 확인" : candidates.length ? "추천 거래 확인" : Number(p.settled) > 0 ? "연결 내역 확인" : "거래 직접 찾기"}</button></footer>
        </article>;
      })}
      {data.data && !visible.length && <p className="cash-empty">{tab === "done" ? "완료된 계획이 없습니다." : "확인할 계획이 없습니다. 미연결 은행거래도 확인해보세요."}</p>}
    </section>}
    {(tab === "bank" || tab === "done") && <section className="review-plan-list" aria-label="은행거래 확인 목록"><h3>{tab === "done" ? "계획 없이 확인한 거래" : "계획에 아직 연결되지 않은 거래"}</h3><p className="cash-muted">{tab === "done" ? "확인 사유를 보거나 확인을 해제할 수 있습니다." : "해당 계획을 찾아 연결하거나, 계획 없는 거래로 확인하세요. 일부 연결된 거래는 남은 금액을 표시합니다."}</p>{bankRows.map(t => <article className="review-bank-card" key={t.id}><div><h3>{t.description || t.counterparty_text || "은행거래"}</h3><small>{minute(t.trans_at)} · {t.account_name}</small>{tab === "done" && <p>{t.review_note}</p>}</div><strong>{Number(t.deposit_amount) > 0 ? "입금" : "출금"} {money(tab === "done" ? Number(t.deposit_amount) + Number(t.withdraw_amount) : t.available)}</strong><button onClick={() => setBank(t)}>{tab === "done" ? "확인 내역 보기" : "계획 연결·확인"}</button></article>)}{data.data && !bankRows.length && <p className="cash-empty">표시할 거래가 없습니다.</p>}</section>}
    <details className="cash-panel review-help"><summary>은행 수집 상태와 확인 기준</summary><p>거래가 보이지 않으면 은행거래 메뉴에서 수집 기간을 확인하세요. 추천되지 않아도 직접 연결할 수 있으며, 정상 금액 범위를 넘으면 사유를 남겨 완료할 수 있습니다.</p>{data.data?.accounts.map((a,i) => <p key={i}>{a.alias} · 마지막 수집 {a.last_sync_at ? minute(a.last_sync_at) : "기록 없음"}{a.last_sync_error && ` · 오류: ${a.last_sync_error}`}</p>)}</details>
    {editing && <CashDialog title={editing.plan.execution_confirmed ? "완료 내역" : "입출금 확인"} wide onClose={() => setEditing(null)}><ExecutionEditor plan={editing.plan} initialTransaction={editing.suggested} /></CashDialog>}
    {bank && <CashDialog title="은행거래 연결·확인" wide onClose={() => setBank(null)}><BankExecutionReview id={bank.id} date={bank.trans_at.slice(0,10)} /></CashDialog>}
  </div>;
}
