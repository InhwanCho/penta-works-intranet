"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import LoadingIndicator from "./loading-indicator";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, CreditCard, Landmark, Link2, Plus, RefreshCw, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";
import { cashMoney as money, isOpenPlan, monthBounds, planStatus, seoulToday, shiftDate, type CashAccount, type CashData, type CashDay, type CashPlan } from "@/lib/cash-planning";
import { minute } from "./accounting-transactions";

type View = "overview" | "calendar" | "plans" | "bills";
const labels = { overview: "자금현황", calendar: "자금달력", plans: "입출금 계획", bills: "카드 결제예정" };
const errorText = (e: unknown) => e instanceof Error ? e.message : "처리하지 못했습니다.";

export function CashWorkspace({ view }: { view: View }) {
  const today = seoulToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [account, setAccount] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("open");
  const [direction, setDirection] = useState("");
  const [selected, setSelected] = useState(today);
  const [mode, setMode] = useState<"month" | "week">("month");
  const [editor, setEditor] = useState<CashPlan | "new" | null>(null);
  const [matching, setMatching] = useState<CashPlan | null>(null);
  const [notice, setNotice] = useState("");
  const status = useApiQuery<{ ready: boolean }>("/accounting/cash/status");
  const bounds = monthBounds(month);
  const gridStart = shiftDate(bounds.from, -(new Date(`${bounds.from}T12:00:00Z`).getUTCDay() + 6) % 7);
  const gridEnd = shiftDate(gridStart, 41);
  const data = useApiQuery<CashData>(`/accounting/cash?from=${gridStart}&to=${gridEnd}`, status.data?.ready === true);
  const accounts = data.data?.accounts ?? [];
  const plans = (data.data?.plans ?? []).filter(p => !account || String(p.account_id) === account);
  const days = (data.data?.days ?? []).filter(d => !account || String(d.account_id) === account);
  const monthPlans = plans.filter(p => p.planned_date >= bounds.from && p.planned_date <= bounds.to);
  const open = monthPlans.filter(isOpenPlan);
  const overdue = plans.filter(p => isOpenPlan(p) && p.planned_date < today);
  const dueInMonth = overdue.filter(p => p.planned_date <= bounds.to);
  const visible = plans.filter(p => (p.planned_date <= bounds.to && (p.planned_date >= bounds.from || isOpenPlan(p))) && (view !== "bills" || p.card_issuer) && (!direction || p.direction === direction) && (!search || `${p.title} ${p.counterparty_name} ${p.category_name}`.toLowerCase().includes(search.toLowerCase())) && (filter === "all" || (filter === "open" ? isOpenPlan(p) : filter === "late" ? isOpenPlan(p) && p.planned_date < today : planStatus(p) === "완료")));
  const sum = (rows: CashPlan[], dir: string) => rows.filter(p => p.direction === dir).reduce((s, p) => s + Number(p.remaining), 0);
  function changeMonth(value: string) { if (!/^\d{4}-\d{2}$/.test(value)) return; setMonth(value); setSelected(`${value}-01`); }
  function move(amount: number) { const [y, m] = month.split("-").map(Number); changeMonth(new Date(Date.UTC(y, m - 1 + amount, 1)).toISOString().slice(0, 7)); }
  function saved(message: string) { setEditor(null); setNotice(message); void data.refetch(); }
  return <div className="cash-workspace accounting-office">
    <header className="cash-page-heading"><div><span className="cash-eyebrow">회계 · 자금관리</span><h1>{labels[view]}</h1></div><div className="cash-actions"><button onClick={() => void data.refetch()} disabled={!data.data || data.isFetching} aria-label="자금현황 새로고침"><RefreshCw /></button><button className="cash-create" disabled={!status.data?.ready} onClick={() => setEditor("new")}><Plus />{view === "bills" ? "청구액 등록" : "계획 등록"}</button></div></header>
    {status.isError && <p role="alert" className="cash-error">{status.error.message}</p>}
    {status.data && !status.data.ready && <div className="cash-empty"><Landmark /><strong>자금계획을 사용할 준비가 필요합니다.</strong><p>서버에 자금계획 DB 업데이트를 적용하면 계획 등록과 달력이 활성화됩니다.</p></div>}
    {data.isError && <p role="alert" className="cash-error">{data.error.message}<button onClick={() => void data.refetch()}>다시 불러오기</button></p>}
    {(status.isPending || (status.data?.ready && data.isPending)) && <LoadingIndicator label="회계 자료를 불러오는 중" />}
    {notice && <p className="cash-notice" role="status">{notice}<button aria-label="알림 닫기" onClick={() => setNotice("")}><X /></button></p>}
    {data.data && <>
      <div className="cash-toolbar"><div className="cash-month"><button aria-label="이전 달" onClick={() => move(-1)}><ChevronLeft /></button><label><span className="sr-only">조회 월</span><input type="month" value={month} onChange={e => changeMonth(e.target.value)} /></label><button aria-label="다음 달" onClick={() => move(1)}><ChevronRight /></button><button onClick={() => { changeMonth(today.slice(0, 7)); setSelected(today); }}>이번 달</button></div><label className="cash-account-filter"><Landmark /><select aria-label="계좌 필터" value={account} onChange={e => setAccount(e.target.value)}><option value="">전체 계좌</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.alias}</option>)}</select></label></div>
      {view === "overview" && <>
        <div className="cash-metrics"><article><span>조회 계좌 잔액 합계</span><strong>{accounts.filter(a => !account || String(a.id) === account).length && accounts.filter(a => !account || String(a.id) === account).every(a => a.balance != null) ? money(accounts.filter(a => !account || String(a.id) === account).reduce((s, a) => s + Number(a.balance), 0)) : "미확인"}</strong><small>계좌별 마지막 거래 기준 · 동시점 잔액 아님</small></article><article><span><ArrowDownLeft />선택 월 남은 입금</span><strong>{money(sum(open, "IN"))}</strong><small>실제 입금과 연결한 금액 제외</small></article><article><span><ArrowUpRight />선택 월 남은 지급</span><strong>{money(sum(open, "OUT"))}</strong><small>카드 결제예정 포함</small></article><article><span>기한 지난 미처리 계획</span><strong>{dueInMonth.length}<em>건</em></strong><small>선택 월 말까지 · 완료 확인 필요</small></article></div>
        <section className="cash-panel"><div className="cash-panel-heading"><h2>계좌별 잔액</h2><Link href="/accounting/banks">은행거래 보기 →</Link></div><div className="cash-table-scroll"><table className="cash-table cash-account-table"><thead><tr><th>계좌명</th><th>계좌번호</th><th className="number">잔액</th><th>잔액 기준</th><th>마지막 수집</th></tr></thead><tbody>{accounts.filter(a => !account || String(a.id) === account).map(a => <tr key={a.id}><td>{a.alias}</td><td>{a.account_num_masked}</td><td className="number"><strong>{money(a.balance)}</strong></td><td>{minute(a.balance_at)}</td><td>{minute(a.last_sync_at)}{a.last_sync_error && <small className="cash-error">수집 확인 필요 · {a.last_sync_error}</small>}</td></tr>)}</tbody></table>{!accounts.length && <div className="cash-empty">연결된 계좌가 없습니다. 은행거래에서 계좌 목록을 불러오세요.</div>}</div></section>
        <section className="cash-panel"><div className="cash-panel-heading"><h2>먼저 확인할 계획</h2><Link href="/accounting/plans">전체 계획 →</Link></div><PlanTable plans={[...dueInMonth, ...open.filter(p => p.planned_date >= today)].slice(0, 5)} onEdit={setEditor} onMatch={setMatching} empty="기한이 지났거나 처리가 필요한 계획이 없습니다." /></section>
      </>}
      {(view === "calendar" || view === "overview") && <section className="cash-panel cash-calendar-panel"><div className="cash-panel-heading"><div><h2>{view === "overview" ? "이번 달 자금흐름" : "자금 일정"}</h2></div><div className="cash-segment" aria-label="달력 보기">{(["month", "week"] as const).map(m => <button key={m} aria-pressed={mode === m} className={mode === m ? "selected" : ""} onClick={() => setMode(m)}>{m === "month" ? "월간" : "주간"}</button>)}</div></div><CashCalendar start={gridStart} month={month} selected={selected} setSelected={date => { setSelected(date); if (date.slice(0, 7) !== month) setMonth(date.slice(0, 7)); }} mode={mode} plans={plans} days={days} />
        <div className="cash-day-detail"><div className="cash-panel-heading"><div><h3>{selected} 상세</h3></div><button onClick={() => setEditor("new")}><Plus />이 날짜에 등록</button></div><PlanTable plans={plans.filter(p => p.planned_date === selected && p.status !== "VOID")} onEdit={setEditor} onMatch={setMatching} empty="등록된 계획이 없습니다." /><DayTransactions date={selected} account={account} /></div>
      </section>}
      {(view === "plans" || view === "bills") && <>
        {view === "bills" && <div className="cash-guidance"><CreditCard /><div><strong>사용내역과 결제예정액은 따로 관리합니다.</strong><p>청구서를 확인한 금액만 ‘확정’으로 등록하세요. 승인내역 합계는 자동으로 청구액이 되지 않습니다. 카드사별 결제월 합계로 등록하며, 은행 출금과 연결하면 중복 집계하지 않습니다.</p></div><Link href="/accounting/cards/upload">사용내역 업로드 →</Link></div>}
        <div className="cash-list-filters"><div className="cash-segment">{[["open", "미처리"], ["late", "기한 지남"], ["done", "완료"], ["all", "전체"]].map(([id, text]) => <button key={id} aria-pressed={filter === id} className={filter === id ? "selected" : ""} onClick={() => setFilter(id)}>{text}</button>)}</div><select aria-label="입출금 방향" value={direction} onChange={e => setDirection(e.target.value)}><option value="">입금·출금 전체</option><option value="IN">입금</option><option value="OUT">출금</option></select><label className="cash-search"><Search /><input placeholder="거래처, 항목 검색" aria-label="계획 검색" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
        <section className="cash-panel"><div className="cash-panel-heading"><h2>{view === "bills" ? "월별 카드 결제예정" : "계획 목록"} <small>{visible.length}건</small></h2><span className="cash-muted">이전 달의 미처리 계획 포함</span></div><PlanTable plans={visible} onEdit={setEditor} onMatch={setMatching} empty={search ? "검색 조건에 맞는 계획이 없습니다." : "등록된 계획이 없습니다. 계획을 등록하면 달력에도 표시됩니다."} /></section>
      </>}
    </>}
    {editor && <CashDialog title={editor === "new" ? view === "bills" ? "카드 청구액 등록" : "입출금 계획 등록" : "계획 상세·수정"} onClose={() => setEditor(null)}><PlanEditor plan={editor === "new" ? null : editor} bill={view === "bills"} date={view === "calendar" || view === "overview" ? selected : `${month}-15`} accounts={accounts} onSaved={saved} /></CashDialog>}
    {matching && <CashDialog title="실제 은행거래 연결" onClose={() => setMatching(null)}><MatchEditor plan={matching} onChanged={() => { void data.refetch(); }} /></CashDialog>}
  </div>;
}

function PlanTable({ plans, onEdit, onMatch, empty }: { plans: CashPlan[]; onEdit: (p: CashPlan) => void; onMatch: (p: CashPlan) => void; empty: string }) {
  if (!plans.length) return <div className="cash-empty"><CalendarDays /><p>{empty}</p></div>;
  return <div className="cash-table-scroll"><table className="cash-table"><thead><tr><th>예정일 / 상태</th><th>항목 / 거래처</th><th>계좌</th><th>예정금액</th><th>실적 연결</th><th>남은 금액</th><th>관리</th></tr></thead><tbody>{plans.map(p => <tr key={p.id}><td>{p.planned_date}<small className={isOpenPlan(p) && p.planned_date < seoulToday() ? "cash-overdue" : ""}>{planStatus(p)}</small></td><td><button className="cash-text-button" onClick={() => onEdit(p)}>{p.title}</button><small>{p.direction === "IN" ? "입금" : "출금"} · {p.counterparty_name || p.category_name || "미분류"}{p.card_issuer && ` · ${p.card_issuer === "HANA" ? "하나" : "BC"} ${p.billing_month?.slice(0, 7)}`}</small></td><td>{p.account_name || "미지정"}<small>{p.certainty === "CONFIRMED" ? "확정" : "추정"}</small></td><td className="number">{money(p.amount)}</td><td className="number">{money(p.settled)}</td><td className="number"><strong>{p.status === "VOID" ? "—" : money(p.remaining)}</strong></td><td><button disabled={p.status === "VOID"} onClick={() => onMatch(p)}><Link2 />연결</button></td></tr>)}</tbody></table></div>;
}

function CashCalendar({ start, month, selected, setSelected, mode, plans, days }: { start: string; month: string; selected: string; setSelected: (d: string) => void; mode: "month" | "week"; plans: CashPlan[]; days: CashDay[] }) {
  const weekStart = shiftDate(selected, -(new Date(`${selected}T12:00:00Z`).getUTCDay() + 6) % 7);
  const dates = Array.from({ length: mode === "month" ? 42 : 7 }, (_, i) => shiftDate(mode === "month" ? start : weekStart, i));
  const indexed = useMemo(() => {
    const actual = new Map<string, CashDay[]>(); const pending = new Map<string, CashPlan[]>();
    for (const d of days) actual.set(d.date, [...(actual.get(d.date) ?? []), d]);
    for (const p of plans) if (isOpenPlan(p)) pending.set(p.planned_date, [...(pending.get(p.planned_date) ?? []), p]);
    return { actual, pending };
  }, [days, plans]);
  return <><div className="cash-calendar-legend"><span>실제 거래</span><span>예정: 아직 연결되지 않은 금액</span>{mode === "week" && <div className="cash-actions"><button aria-label="이전 주" onClick={() => setSelected(shiftDate(selected, -7))}><ChevronLeft /></button><button aria-label="다음 주" onClick={() => setSelected(shiftDate(selected, 7))}><ChevronRight /></button></div>}</div><div className="cash-calendar-scroll"><div className={`cash-calendar ${mode}`}><div className="cash-weekdays">{["월", "화", "수", "목", "금", "토", "일"].map(d => <span key={d}>{d}</span>)}</div><div className="cash-date-grid">{dates.map(date => {
    const actual = indexed.actual.get(date) ?? []; const pending = indexed.pending.get(date) ?? [];
    const income = actual.reduce((s, d) => s + Number(d.income), 0); const expense = actual.reduce((s, d) => s + Number(d.expense), 0);
    const pin = pending.filter(p => p.direction === "IN").reduce((s, p) => s + Number(p.remaining), 0); const pout = pending.filter(p => p.direction === "OUT").reduce((s, p) => s + Number(p.remaining), 0);
    return <button key={date} aria-label={`${date} 상세`} aria-pressed={selected === date} className={`${selected === date ? "selected" : ""} ${date.slice(0, 7) !== month ? "outside" : ""}`} onClick={() => setSelected(date)}><span className="cash-day-number">{Number(date.slice(8))}{date === seoulToday() && <small>오늘</small>}</span>{income > 0 && <span className="cash-in">입 {money(income)}</span>}{expense > 0 && <span>출 {money(expense)}</span>}{pin > 0 && <span className="cash-pending">입 예정 {money(pin)}</span>}{pout > 0 && <span className="cash-pending">출 예정 {money(pout)}</span>}{actual.some(d => Number(d.transfer) !== 0) && <small>내부이체 있음</small>}{mode === "week" && pending.map(p => <span className="cash-week-item" key={p.id}>{p.title}<small>{p.counterparty_name || p.account_name}</small></span>)}</button>;
  })}</div></div></div></>;
}

function DayTransactions({ date, account }: { date: string; account: string }) {
  const [page, setPage] = useState(1);
  const rows = useApiQuery<{ total: number; rows: { id: number; trans_at: string; description: string; counterparty_text: string; alias: string; deposit_amount: number; withdraw_amount: number; classification: string }[] }>(`/accounting/bank-transactions?from=${date}&to=${date}&page=${page}${account ? `&source=${account}` : ""}`);
  useEffect(() => { setPage(1); }, [date, account]);
  return <div className="cash-day-actual"><h4>실제 은행거래 {rows.data ? `${rows.data.total}건` : ""}</h4>{rows.isError && <p role="alert">{rows.error.message}</p>}{rows.isPending && <LoadingIndicator compact label="은행거래를 불러오는 중" />}{rows.data?.rows.map(r => <div key={r.id}><span>{r.description || r.counterparty_text || "은행거래"}<small>{r.alias} · {minute(r.trans_at)}{r.classification === "INTERNAL_TRANSFER" ? " · 내부이체" : ""}</small></span><strong>{Number(r.deposit_amount) > 0 ? "+" : "−"}{money(Number(r.deposit_amount) || Number(r.withdraw_amount))}</strong></div>)}{rows.data?.total === 0 && <p className="cash-muted">이 날짜에 수집된 거래가 없습니다.</p>}{!!rows.data && rows.data.total > 50 && <div className="cash-actions"><button disabled={page === 1} onClick={() => setPage(p => p - 1)}>이전</button><span>{page} / {Math.ceil(rows.data.total / 50)}</span><button disabled={page * 50 >= rows.data.total} onClick={() => setPage(p => p + 1)}>다음</button></div>}</div>;
}

function CashDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="cash-dialog" onCancel={e => { e.preventDefault(); onClose(); }}><header><h2>{title}</h2><button aria-label="닫기" onClick={onClose}><X /></button></header>{children}</dialog>;
}

function PlanEditor({ plan, bill, date, accounts, onSaved }: { plan: CashPlan | null; bill: boolean; date: string; accounts: CashAccount[]; onSaved: (message: string) => void }) {
  const [form, setForm] = useState({ title: plan?.title ?? (bill ? "법인카드 결제대금" : ""), direction: plan?.direction ?? "OUT", amount: String(plan?.amount ?? ""), plannedDate: plan?.planned_date ?? date, accountId: String(plan?.account_id ?? ""), counterparty: plan?.counterparty_name ?? "", category: plan?.category_name ?? "", certainty: plan?.certainty ?? "ESTIMATED", memo: plan?.memo ?? "", months: "1", monthEnd: false, cardIssuer: plan?.card_issuer ?? (bill ? "BC" : ""), billingMonth: (plan?.billing_month ?? date).slice(0, 7) });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [requestKey] = useState(() => crypto.randomUUID());
  const field = (key: keyof typeof form, value: string | boolean) => setForm(f => ({ ...f, [key]: value }));
  async function save(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(""); try { await api(`/accounting/cash/plans${plan ? `/${plan.id}` : ""}`, { method: plan ? "PUT" : "POST", body: JSON.stringify({ ...form, amount: Number(form.amount), accountId: form.accountId ? Number(form.accountId) : null, months: Number(form.months), cardIssuer: form.cardIssuer || null, billingMonth: form.cardIssuer ? `${form.billingMonth}-01` : null, version: plan?.version ?? 0, requestKey }) }); onSaved(plan ? "계획을 수정했습니다." : `${form.months}건의 계획을 등록했습니다.`); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  async function cancel() { if (!plan || !window.confirm("이 계획을 취소할까요? 기존 기록은 보존됩니다.")) return; setBusy(true); setError(""); try { await api(`/accounting/cash/plans/${plan.id}/cancel`, { method: "POST", body: JSON.stringify({ version: plan.version }) }); onSaved("계획을 취소했습니다."); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  return <form onSubmit={save} className="cash-form"><fieldset disabled={busy || plan?.status === "VOID"}><div className="cash-form-grid">
    <label className="wide">항목명<input required maxLength={255} value={form.title} onChange={e => field("title", e.target.value)} placeholder="예: 11월 유지보수료, 급여, 카드대금" /></label>
    <label>구분<select value={form.direction} disabled={!!form.cardIssuer} onChange={e => field("direction", e.target.value)}><option value="IN">입금</option><option value="OUT">출금</option></select></label><label>예정금액 (원)<input required type="number" min="1" max="999999999999" step="1" value={form.amount} onChange={e => field("amount", e.target.value)} /></label>
    <label>예정일<input required type="date" min="2000-01-01" max="2100-12-31" value={form.plannedDate} onChange={e => field("plannedDate", e.target.value)} /></label><label>입출금 계좌<select required={!!form.cardIssuer} value={form.accountId} onChange={e => field("accountId", e.target.value)}><option value="">미지정</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.alias}</option>)}</select></label>
    <label>거래처<input maxLength={200} value={form.counterparty} onChange={e => field("counterparty", e.target.value)} placeholder="병원명 또는 지급처" /></label><label>분류<input list="cash-categories" maxLength={100} value={form.category} onChange={e => field("category", e.target.value)} placeholder="유지보수료, 급여 등" /><datalist id="cash-categories">{["유지보수료", "장비대금", "급여", "임차료", "보험료", "세금", "대출이자", "카드대금", "기타"].map(c => <option key={c}>{c}</option>)}</datalist></label>
    <label>금액 확인<select value={form.certainty} onChange={e => field("certainty", e.target.value)}><option value="ESTIMATED">추정</option><option value="CONFIRMED">확정</option></select></label><label>카드 청구<select value={form.cardIssuer} onChange={e => { field("cardIssuer", e.target.value); if (e.target.value) field("direction", "OUT"); }}><option value="">일반 입출금</option><option value="BC">BC카드</option><option value="HANA">하나카드</option></select></label>
    {form.cardIssuer && <label>결제월<input required type="month" value={form.billingMonth} onChange={e => field("billingMonth", e.target.value)} /></label>}
    {!plan && <><label>매월 반복 생성<select value={form.months} onChange={e => field("months", e.target.value)}>{[1, 3, 6, 12, 24].map(n => <option key={n} value={n}>{n === 1 ? "이번 건만" : `${n}개월 생성`}</option>)}</select></label>{Number(form.months) > 1 && <label className="cash-check"><input type="checkbox" checked={form.monthEnd} onChange={e => field("monthEnd", e.target.checked)} />매월 말일로 등록</label>}</>}
    <label className="wide">메모<textarea rows={3} maxLength={5000} value={form.memo} onChange={e => field("memo", e.target.value)} placeholder="금액 산출 근거나 일정 변경 사유" /></label>
  </div></fieldset>
  {plan && <p className="cash-muted">최초 계획 {plan.original_date} · {money(plan.original_amount)}<br />실적 연결 {money(plan.settled)} · 이 건만 수정합니다.</p>}
  {!plan && Number(form.months) > 1 && <p className="cash-muted">등록일 기준으로 {form.months}개월을 한 번에 생성합니다. 해당 날짜가 없는 달은 말일을 사용합니다. 생성 후 각 건의 금액과 날짜를 수정할 수 있습니다.</p>}
  {error && <p role="alert" className="cash-error">{error}</p>}<footer>{plan && <button type="button" disabled={busy || plan.status === "VOID" || Number(plan.settled) > 0} onClick={() => void cancel()}>계획 취소</button>}<button type="submit" className="cash-create" disabled={busy || plan?.status === "VOID"}>{busy ? "저장 중…" : plan ? "변경 저장" : "계획 등록"}</button></footer></form>;
}

type Candidate = { id: number; trans_at: string; description: string; counterparty_text: string; account_name: string; available: number };
type MatchData = { plan: CashPlan; candidates: Candidate[]; truncated: boolean; allocations: { id: number; allocated_amount: number; settled_at: string; description: string; account_name: string }[] };
function MatchEditor({ plan, onChanged }: { plan: CashPlan; onChanged: () => void }) {
  const [from, setFrom] = useState(shiftDate(plan.planned_date, -30)); const [to, setTo] = useState(shiftDate(plan.planned_date, 30));
  const valid = !!from && !!to && to >= from && (Date.parse(to) - Date.parse(from)) / 86400000 < 200;
  const matches = useApiQuery<MatchData>(`/accounting/cash/plans/${plan.id}/matches?from=${from}&to=${to}`, valid);
  const [chosen, setChosen] = useState<Candidate | null>(null); const [amount, setAmount] = useState(""); const [search, setSearch] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [key, setKey] = useState(() => crypto.randomUUID());
  async function act(path: string, body?: unknown) { setBusy(true); setError(""); setNotice(""); try { await api(path, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) }); await matches.refetch(); onChanged(); setChosen(null); setAmount(""); setKey(crypto.randomUUID()); setNotice(body ? "실제 거래를 연결했습니다." : "연결을 해제했습니다."); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  const current = matches.data?.plan ?? plan;
  return <div className="cash-match"><div className="cash-match-summary"><strong>{current.title}</strong><span>예정 {money(current.amount)} · 남은 금액 <b>{money(current.remaining)}</b></span><small>계좌·입출금 방향이 맞는 거래를 표시합니다. 거래처와 금액을 확인한 뒤 연결하세요.</small></div>
    {matches.data?.allocations.length ? <section><h3>연결된 실적</h3>{matches.data.allocations.map(a => <div className="cash-allocation" key={a.id}><span>{a.description || "은행거래"}<small>{a.account_name} · {minute(a.settled_at)}</small></span><strong>{money(a.allocated_amount)}</strong><button disabled={busy} onClick={() => { if (window.confirm("이 거래 연결을 해제할까요? 남은 예정액이 다시 늘어납니다.")) void act(`/accounting/cash/plans/${plan.id}/allocations/${a.id}/void`); }}>연결 해제</button></div>)}</section> : null}
    <div className="cash-list-filters"><label>시작일<input type="date" value={from} onChange={e => { setFrom(e.target.value); setChosen(null); }} /></label><label>종료일<input type="date" value={to} onChange={e => { setTo(e.target.value); setChosen(null); }} /></label><label>거래 검색<input value={search} placeholder="거래내용, 입금자" onChange={e => setSearch(e.target.value)} /></label></div>
    {!valid && <p role="alert">조회 기간을 200일 이내로 선택해주세요.</p>}{matches.isError && <p role="alert" className="cash-error">{matches.error.message}</p>}{matches.isFetching && <p role="status">거래 조회 중…</p>}{matches.data?.truncated && <p>최근 200건까지 표시합니다. 날짜 범위를 좁혀주세요.</p>}
    {valid && <div className="cash-candidates">{matches.data?.candidates.filter(c => `${c.description} ${c.counterparty_text}`.includes(search)).map(c => <button disabled={busy || Number(current.remaining) <= 0} className={chosen?.id === c.id ? "selected" : ""} aria-pressed={chosen?.id === c.id} key={c.id} onClick={() => { setChosen(c); setAmount(String(Math.min(Number(c.available), Number(current.remaining)))); setKey(crypto.randomUUID()); }}><span>{c.description || c.counterparty_text || "은행거래"}<small>{minute(c.trans_at)} · {c.account_name}</small></span><strong>{money(c.available)}<small>미연결 금액</small></strong></button>)}{matches.data?.candidates.length === 0 && <p className="cash-muted">연결 가능한 거래가 없습니다. 조회 기간이나 계획의 계좌를 확인해주세요.</p>}</div>}
    {chosen && valid && <form onSubmit={e => { e.preventDefault(); void act(`/accounting/cash/plans/${plan.id}/allocations`, { transactionId: chosen.id, amount: Number(amount), version: current.version, requestKey: key }); }} className="cash-match-submit"><label>이번에 연결할 금액 (원)<input type="number" required min="1" step="1" max={Math.min(Number(chosen.available), Number(current.remaining))} value={amount} onChange={e => { setAmount(e.target.value); setKey(crypto.randomUUID()); }} /></label><button className="cash-create" disabled={busy || matches.isFetching}><Link2 />{busy ? "연결 중…" : "선택한 거래 연결"}</button></form>}
    {error && <p role="alert" className="cash-error">{error}</p>}{notice && <p role="status" className="cash-notice">{notice}</p>}
  </div>;
}
