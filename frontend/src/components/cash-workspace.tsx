"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CashDialog } from "./cash-dialog";
import { PlanAmountInput, PlanChoice, PlanScheduleFields, planOccurrences } from "./cash-plan-fields";
import { BatchCashPlans } from "./batch-cash-plans";
import { AccountingLoader } from "./loading-indicator";
import { CalendarDays, ChevronLeft, ChevronRight, CreditCard, Landmark, Link2, Plus, RefreshCw, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";
import { accountTrack, planTrack, bankTracks, cashTotals, signedCashMoney, cashMoney as money, isOpenPlan, monthBounds, planStatus, seoulToday, shiftDate, type CashBalance, type CashAccount, type CashData, type CashDay, type CashPlan } from "@/lib/cash-planning";
import { minute } from "./accounting-transactions";

type View = "overview" | "calendar" | "plans" | "bills" | "daily";
const labels = { overview: "대시보드", calendar: "자금달력", plans: "입출금 계획", bills: "카드 결제예정", daily: "일별 자금집계" };
const errorText = (e: unknown) => e instanceof Error ? e.message : "처리하지 못했습니다.";

export function CashWorkspace({ view }: { view: View }) {
  const today = seoulToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [track, setTrack] = useState("");
  const [account, setAccount] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("open");
  const [direction, setDirection] = useState("");
  const [selected, setSelected] = useState(today);
  const [detailDate, setDetailDate] = useState<string | null>(null);
  const [mode, setMode] = useState<"month" | "week">("month");
  const [editor, setEditor] = useState<CashPlan | "new" | "batch" | null>(null);
  const [matching, setMatching] = useState<CashPlan | null>(null);
  const [notice, setNotice] = useState("");
  const status = useApiQuery<{ ready: boolean }>("/accounting/cash/status");
  const bounds = monthBounds(month);
  const gridStart = shiftDate(bounds.from, -(new Date(`${bounds.from}T12:00:00Z`).getUTCDay() + 6) % 7);
  const gridEnd = shiftDate(gridStart, 41);
  const data = useApiQuery<CashData>(`/accounting/cash?from=${gridStart}&to=${gridEnd}`, status.data?.ready === true);
  const accounts = data.data?.accounts ?? [];
  const plans = (data.data?.plans ?? []).filter(p => (!account || String(p.account_id) === account) && (!track || planTrack(p, accounts) === track));
  const days = (data.data?.days ?? []).filter(d => (!account || String(d.account_id) === account) && (!track || accountTrack(accounts.find(a => a.id === d.account_id)) === track));
  const monthPlans = plans.filter(p => p.planned_date >= bounds.from && p.planned_date <= bounds.to);
  const open = monthPlans.filter(isOpenPlan);
  const overdue = plans.filter(p => isOpenPlan(p) && p.planned_date < today);
  const dueInMonth = overdue.filter(p => p.planned_date <= bounds.to);
  const visible = plans.filter(p => (p.planned_date <= bounds.to && (p.planned_date >= bounds.from || isOpenPlan(p))) && (view !== "bills" || p.card_issuer) && (!direction || p.direction === direction) && (!search || `${p.title} ${p.counterparty_name} ${p.category_name}`.toLowerCase().includes(search.toLowerCase())) && (filter === "all" || (filter === "open" ? isOpenPlan(p) : filter === "late" ? isOpenPlan(p) && p.planned_date < today : planStatus(p) === "완료")));
  const sum = (rows: CashPlan[], dir: string) => rows.filter(p => p.direction === dir).reduce((s, p) => s + Number(p.remaining), 0);
  function changeMonth(value: string) { if (!/^\d{4}-\d{2}$/.test(value)) return; setMonth(value); setSelected(`${value}-01`); }
  function move(amount: number) { const [y, m] = month.split("-").map(Number); changeMonth(new Date(Date.UTC(y, m - 1 + amount, 1)).toISOString().slice(0, 7)); }
  function selectDate(date: string) {
    setSelected(date);
    if (date.slice(0, 7) !== month) setMonth(date.slice(0, 7));
  }
  function saved(message: string) { setEditor(null); setNotice(message); void data.refetch(); }
  return <div className="cash-workspace accounting-office">
    <header className="cash-page-heading"><div><span className="cash-eyebrow">회계 · 자금관리</span><h1>{labels[view]}</h1></div><div className="cash-actions"><button onClick={() => void data.refetch()} disabled={!data.data || data.isFetching} aria-label="대시보드 새로고침"><RefreshCw /></button><button className="cash-create" disabled={!status.data?.ready} onClick={() => setEditor("new")}><Plus />{view === "bills" ? "청구액 등록" : "계획 등록"}</button>{view !== "bills" && <button disabled={!status.data?.ready} onClick={() => setEditor("batch")}>여러 건 등록</button>}</div></header>
    {status.isError && <p role="alert" className="cash-error">{status.error.message}</p>}
    {status.data && !status.data.ready && <div className="cash-empty"><Landmark /><strong>자금계획을 사용할 준비가 필요합니다.</strong><p>서버에 자금계획 DB 업데이트를 적용하면 계획 등록과 달력이 활성화됩니다.</p></div>}
    {data.isError && <p role="alert" className="cash-error">{data.error.message}<button onClick={() => void data.refetch()}>다시 불러오기</button></p>}
    {(status.isPending || (status.data?.ready && data.isPending)) && <AccountingLoader />}
    {notice && <p className="cash-notice" role="status">{notice}<button aria-label="알림 닫기" onClick={() => setNotice("")}><X /></button></p>}
    {data.data && <>
      {plans.some(p => p.card_issuer && accountTrack(accounts.find(a => a.id === p.account_id)) !== planTrack(p, accounts)) && <p className="cash-guidance">카드 결제은행과 등록 계좌가 다른 계획이 있습니다. BC카드는 기업은행, 하나카드는 하나은행 계좌로 계획을 수정해주세요. 은행별 예정액은 카드 결제은행 기준입니다.</p>}
      <div className="cash-toolbar"><div className="cash-month"><button aria-label="이전 달" onClick={() => move(-1)}><ChevronLeft /></button><label><span className="sr-only">조회 월</span><input type="month" value={month} onChange={e => changeMonth(e.target.value)} /></label><button aria-label="다음 달" onClick={() => move(1)}><ChevronRight /></button><button onClick={() => { changeMonth(today.slice(0, 7)); setSelected(today); }}>이번 달</button></div><select aria-label="은행별 보기" value={track} onChange={e => { setTrack(e.target.value); setAccount(""); }}><option value="">전체 은행</option>{bankTracks.map(t => <option key={t.id} value={t.id}>{t.label} · {t.card}</option>)}</select><label className="cash-account-filter"><Landmark /><select aria-label="계좌 필터" value={account} onChange={e => setAccount(e.target.value)}><option value="">전체 계좌</option>{accounts.filter(a => !track || accountTrack(a) === track).map(a => <option key={a.id} value={a.id}>{a.alias}</option>)}</select></label></div>
      {view === "daily" && <DailyCashTable month={month} accounts={accounts.filter(a => (!account || String(a.id) === account) && (!track || accountTrack(a) === track))} days={days} plans={plans} balances={data.data.balances ?? []} />}
      {(view === "calendar" || view === "overview") && <section className="cash-panel cash-calendar-panel"><div className="cash-panel-heading"><div><h2>{view === "overview" ? "이번 달 자금흐름" : "자금 일정"}</h2></div><div className="cash-segment" aria-label="달력 보기">{(["month", "week"] as const).map(m => <button key={m} aria-pressed={mode === m} className={mode === m ? "selected" : ""} onClick={() => setMode(m)}>{m === "month" ? "월간" : "주간"}</button>)}</div></div><CashCalendar accounts={accounts} start={gridStart} month={month} selected={selected} setSelected={selectDate} onOpenDate={date => { selectDate(date); setDetailDate(date); }} mode={mode} plans={plans} days={days} />

      </section>}
      {view === "overview" && <>
        <div className="cash-bank-tracks">{bankTracks.filter(t => !track || t.id === track).map(t => {
          const selectedAccounts = accounts.filter(a => accountTrack(a) === t.id && (!account || String(a.id) === account));
          const pending = open.filter(p => planTrack(p, accounts) === t.id);
          const actual = days.filter(d => d.date >= bounds.from && d.date <= bounds.to && accountTrack(accounts.find(a => a.id === d.account_id)) === t.id);
          return <section className="cash-bank-track" key={t.id}><header><h2>{t.label}</h2><span>{t.card} 결제계좌</span></header><dl><div><dt>계좌 잔액</dt><dd>{selectedAccounts.length && selectedAccounts.every(a => a.balance != null) ? money(selectedAccounts.reduce((s,a) => s + Number(a.balance),0)) : "미확인"}</dd></div><div><dt>이번 달 입금 · 내부이체 제외</dt><dd>{money(actual.reduce((s,d) => s + Number(d.income),0))}</dd></div><div><dt>이번 달 출금 · 내부이체 제외</dt><dd>{money(actual.reduce((s,d) => s + Number(d.expense),0))}</dd></div><div><dt>남은 입금 예정</dt><dd>{money(sum(pending,"IN"))}</dd></div><div><dt>남은 출금 예정 · 카드 포함</dt><dd>{money(sum(pending,"OUT"))}</dd></div></dl></section>;
        })}</div>
        {open.some(p => !planTrack(p, accounts)) && <p className="cash-guidance">은행 미지정 계획 {open.filter(p => !planTrack(p, accounts)).length}건은 은행별 합계에서 제외됩니다. 계획에서 입출금 계좌를 지정해주세요.</p>}
        <section className="cash-panel"><div className="cash-panel-heading"><h2>계좌별 잔액</h2><Link href="/accounting/banks">은행거래 보기 →</Link></div><div className="cash-table-scroll cash-account-scroll"><table className="cash-table cash-account-table"><thead><tr><th>계좌명</th><th>계좌번호</th><th className="number">잔액</th><th>잔액 기준</th></tr></thead><tbody>{accounts.filter(a => (!account || String(a.id) === account) && (!track || accountTrack(a) === track)).map(a => <tr key={a.id}><td>{a.alias}</td><td>{a.account_num_masked}</td><td className="number"><strong>{money(a.balance)}</strong></td><td>{minute(a.balance_at)}{a.last_sync_error && <small className="cash-error">수집 확인 필요 · {a.last_sync_error}</small>}</td></tr>)}</tbody></table>{!accounts.length && <div className="cash-empty">연결된 계좌가 없습니다. 은행거래에서 계좌 목록을 불러오세요.</div>}</div></section>
        <section className="cash-panel"><div className="cash-panel-heading"><h2>먼저 확인할 계획</h2><Link href="/accounting/plans">전체 계획 →</Link></div><BankPlanTables accounts={accounts} plans={[...dueInMonth, ...open.filter(p => p.planned_date >= today)].slice(0, 5)} onEdit={setEditor} onMatch={setMatching} empty="기한이 지났거나 처리가 필요한 계획이 없습니다." /></section>
      </>}
      {(view === "plans" || view === "bills") && <>
        {view === "bills" && <div className="cash-guidance"><CreditCard /><div><strong>사용내역과 결제예정액은 따로 관리합니다.</strong><p>청구서를 확인한 금액만 ‘확정’으로 등록하세요. 승인내역 합계는 자동으로 청구액이 되지 않습니다. 카드사별 결제월 합계로 등록하며, 은행 출금과 연결하면 중복 집계하지 않습니다.</p></div><Link href="/accounting/cards/upload">사용내역 업로드 →</Link></div>}
        <div className="cash-list-filters"><div className="cash-segment">{[["open", "미처리"], ["late", "기한 지남"], ["done", "완료"], ["all", "전체"]].map(([id, text]) => <button key={id} aria-pressed={filter === id} className={filter === id ? "selected" : ""} onClick={() => setFilter(id)}>{text}</button>)}</div><select aria-label="입출금 방향" value={direction} onChange={e => setDirection(e.target.value)}><option value="">입금·출금 전체</option><option value="IN">입금</option><option value="OUT">출금</option></select><label className="cash-search"><Search /><input placeholder="거래처, 항목 검색" aria-label="계획 검색" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
        <section className="cash-panel"><div className="cash-panel-heading"><h2>{view === "bills" ? "월별 카드 결제예정" : "계획 목록"} <small>{visible.length}건</small></h2><span className="cash-muted">이전 달의 미처리 계획 포함</span></div><BankPlanTables accounts={accounts} plans={visible} onEdit={setEditor} onMatch={setMatching} empty={search ? "검색 조건에 맞는 계획이 없습니다." : "등록된 계획이 없습니다. 계획을 등록하면 달력에도 표시됩니다."} /></section>
      </>}
    </>}
    {detailDate && <CashDialog wide title={`${detailDate} 자금 상세`} onClose={() => setDetailDate(null)}>
      <div className="cash-day-detail cash-date-modal">
        <div className="cash-actions">
          <button type="button" onClick={() => setEditor("new")}><Plus />이 날짜에 등록</button>
          <button type="button" onClick={() => setEditor("batch")}>이 날짜에 여러 건 등록</button>
        </div>
        <section>
          <h3>입출금 계획</h3>
          {data.isError ? <p role="alert">{data.error.message}</p> : data.isPending ? <AccountingLoader /> :
            <BankPlanTables accounts={accounts} plans={plans.filter(p => p.planned_date === detailDate && p.status !== "VOID")}
              onEdit={setEditor} onMatch={setMatching} empty="등록된 계획이 없습니다." />}
        </section>
        {data.data && <section><h3>은행거래 실적</h3><DayTransactions date={detailDate} account={account} track={track} accounts={accounts} /></section>}
      </div>
    </CashDialog>}
    {editor === "batch" && <CashDialog wide title="입출금 계획 여러 건 등록" onClose={() => setEditor(null)}><BatchCashPlans date={view === "overview" || view === "calendar" ? selected : month === today.slice(0, 7) ? today : bounds.from} direction={direction} accountId={account} accounts={accounts} onSaved={saved} /></CashDialog>}
    {editor && editor !== "batch" && <CashDialog title={editor === "new" ? view === "bills" ? "카드 청구액 등록" : "입출금 계획 등록" : "계획 상세·수정"} onClose={() => setEditor(null)}><PlanEditor plan={editor === "new" ? null : editor} bill={view === "bills"} date={view === "calendar" || view === "overview" ? selected : `${month}-15`} accounts={accounts} onSaved={saved} /></CashDialog>}
    {matching && <CashDialog title="실제 은행거래 연결" onClose={() => setMatching(null)}><MatchEditor plan={matching} onChanged={() => { void data.refetch(); }} /></CashDialog>}
  </div>;
}

function DailyCashTable({ month, accounts, days, plans, balances }: { month: string; accounts: CashAccount[]; days: CashDay[]; plans: CashPlan[]; balances: CashBalance[] }) {
  const bounds = monthBounds(month);
  const dates = Array.from({ length: Number(bounds.to.slice(8)) }, (_, i) => shiftDate(bounds.from, i));
  const monthly = cashTotals(days.filter(d => d.date >= bounds.from && d.date <= bounds.to), plans.filter(p => p.planned_date >= bounds.from && p.planned_date <= bounds.to));
  return <section className="cash-panel"><div className="cash-panel-heading"><h2>{Number(month.slice(5))}월 일별 자금집계</h2><strong>월 순증감 {signedCashMoney(monthly.net)}</strong></div><p className="cash-guidance">순증감 = 외부 실적 입금 − 출금 + 잔여 입금예정 − 일반 출금예정 − 카드 출금예정. 내부이체 원금은 제외하고 수수료는 출금에 포함합니다. 기한이 지난 미처리 계획도 원래 예정일에 남습니다. 잔액은 해당 일까지 마지막으로 확인된 실적이며 예상잔액이 아닙니다.</p><div className="cash-table-scroll"><table className="cash-table cash-daily-table"><thead><tr><th>일자</th>{bankTracks.map(t => <th key={t.id} colSpan={4}>{t.label} 실적</th>)}<th>입금예정</th><th>일반 출금예정</th><th>카드 출금예정</th><th>자금 순증감</th></tr><tr><th /><>{bankTracks.flatMap(t => ["외부 입금", "외부 출금", "내부이체 순액", "확인 잔액"].map(h => <th key={`${t.id}-${h}`}>{h}</th>))}</><th colSpan={4}>예정액은 은행 실적과 연결한 금액을 제외한 잔여액입니다.</th></tr></thead><tbody>{dates.map(date => {
    const actual = days.filter(d => d.date === date);
    const total = cashTotals(actual, plans.filter(p => p.planned_date === date));
    return <tr key={date}><th>{date}</th>{bankTracks.map(t => {
      const ids = accounts.filter(a => accountTrack(a) === t.id).map(a => a.id);
      const rows = actual.filter(d => ids.includes(d.account_id));
      const balance = balances.filter(b => b.date === date && ids.includes(b.account_id));
      const known = ids.length > 0 && balance.length === ids.length && balance.every(b => b.balance != null);
      return <BankDailyCells key={t.id} rows={rows} balance={known ? balance.reduce((s, b) => s + Number(b.balance), 0) : null} />;
    })}{[total.plannedIn, total.plannedOut, total.cardOut, total.net].map((value, i) => <td className={`number ${i === 3 ? "cash-net" : ""}`} key={i}>{i === 3 ? signedCashMoney(value) : money(value)}</td>)}</tr>;
  })}</tbody><tfoot><tr><th>월 합계</th>{bankTracks.map(t => { const ids=accounts.filter(a=>accountTrack(a)===t.id).map(a=>a.id); const rows=days.filter(d=>d.date>=bounds.from&&d.date<=bounds.to&&ids.includes(d.account_id)); const closing=balances.filter(b=>b.date===bounds.to&&ids.includes(b.account_id)); const known=ids.length>0&&closing.length===ids.length&&closing.every(b=>b.balance!=null); return <BankDailyCells key={t.id} rows={rows} balance={known?closing.reduce((sum,b)=>sum+Number(b.balance),0):null}/>; })}{[monthly.plannedIn,monthly.plannedOut,monthly.cardOut,monthly.net].map((value,i)=><td className="number" key={i}>{i===3?signedCashMoney(value):money(value)}</td>)}</tr><tr><td colSpan={13}>입출금·예정액·순증감은 월 합계이며, 확인 잔액은 월말 기준입니다.</td></tr></tfoot></table></div></section>;
}

function BankDailyCells({ rows, balance }: { rows: CashDay[]; balance: number | null }) {
  return <>{[rows.reduce((s, d) => s + Number(d.income), 0), rows.reduce((s, d) => s + Number(d.expense), 0), rows.reduce((s, d) => s + Number(d.transfer), 0), balance].map((value, i) => <td className="number" key={i}>{money(value)}</td>)}</>;
}

function BankPlanTables({ accounts, plans, ...props }: { accounts: CashAccount[]; plans: CashPlan[]; onEdit: (p: CashPlan) => void; onMatch: (p: CashPlan) => void; empty: string }) {
  return <div className="cash-plan-tracks">{bankTracks.map(t => <section key={t.id}><h3>{t.label} <small>{t.card}</small></h3><PlanTable plans={plans.filter(p => planTrack(p,accounts) === t.id)} {...props} /></section>)}{plans.some(p => !planTrack(p,accounts)) && <section><h3>계좌 미지정 / 기타 은행</h3><PlanTable plans={plans.filter(p => !planTrack(p,accounts))} {...props} /></section>}</div>;
}

function PlanTable({ plans, onEdit, onMatch, empty }: { plans: CashPlan[]; onEdit: (p: CashPlan) => void; onMatch: (p: CashPlan) => void; empty: string }) {
  if (!plans.length) return <div className="cash-empty"><CalendarDays /><p>{empty}</p></div>;
  return <div className="cash-table-scroll"><table className="cash-table"><thead><tr><th>계획ID</th><th>구분</th><th>예정일 / 상태</th><th>항목 / 거래처</th><th>계좌</th><th>예정금액</th><th>실적 연결</th><th>남은 금액</th><th>메모</th><th>관리</th></tr></thead><tbody>{plans.map(p => <tr key={p.id}><td>{p.direction === "IN" ? "I" : "O"}{String(p.id).padStart(4, "0")}</td><td><span className={`cash-plan-direction ${p.direction === "IN" ? "in" : "out"}`}>{p.direction === "IN" ? "입금" : "출금"}</span></td><td>{p.planned_date}<small className={isOpenPlan(p) && p.planned_date < seoulToday() ? "cash-overdue" : ""}>{planStatus(p)}</small></td><td><button className="cash-text-button" onClick={() => onEdit(p)}>{p.title}</button><small>{p.counterparty_name || "거래처 미지정"} · {p.category_name || "미분류"}{p.card_issuer && ` · ${p.card_issuer === "HANA" ? "하나" : "BC"} ${p.billing_month?.slice(0, 7)}`}</small></td><td>{p.account_name || "미지정"}<small>{p.certainty === "CONFIRMED" ? "확정" : "추정"}</small></td><td className="number">{money(p.amount)}</td><td className="number">{money(p.settled)}</td><td className="number"><strong>{p.status === "VOID" ? "—" : money(p.remaining)}</strong></td><td className="cash-memo">{p.memo || "—"}</td><td><button disabled={p.status === "VOID"} onClick={() => onMatch(p)}><Link2 />연결</button></td></tr>)}</tbody></table></div>;
}

function CashCalendar({ accounts, start, month, selected, setSelected, onOpenDate, mode, plans, days }: { accounts: CashAccount[]; start: string; month: string; selected: string; setSelected: (d: string) => void; onOpenDate: (d: string) => void; mode: "month" | "week"; plans: CashPlan[]; days: CashDay[] }) {
  const weekStart = shiftDate(selected, -(new Date(`${selected}T12:00:00Z`).getUTCDay() + 6) % 7);
  const dates = Array.from({ length: mode === "month" ? 42 : 7 }, (_, i) => shiftDate(mode === "month" ? start : weekStart, i));
  const indexed = useMemo(() => {
    const actual = new Map<string, CashDay[]>(); const pending = new Map<string, CashPlan[]>();
    for (const d of days) actual.set(d.date, [...(actual.get(d.date) ?? []), d]);
    for (const p of plans) if (isOpenPlan(p)) pending.set(p.planned_date, [...(pending.get(p.planned_date) ?? []), p]);
    return { actual, pending };
  }, [days, plans]);
  return <><div className="cash-calendar-legend"><span>실제 거래</span><span>예정: 아직 연결되지 않은 금액</span><span>순 = 실적 입금 − 출금 + 잔여 입금예정 − 출금예정(카드 포함), 내부이체 제외</span>{mode === "week" && <div className="cash-actions"><button aria-label="이전 주" onClick={() => setSelected(shiftDate(selected, -7))}><ChevronLeft /></button><button aria-label="다음 주" onClick={() => setSelected(shiftDate(selected, 7))}><ChevronRight /></button></div>}</div><div className="cash-calendar-scroll"><div className={`cash-calendar ${mode}`}><div className="cash-weekdays">{["월", "화", "수", "목", "금", "토", "일"].map(d => <span key={d}>{d}</span>)}</div><div className="cash-date-grid">{dates.map(date => {
    const actual = indexed.actual.get(date) ?? []; const pending = indexed.pending.get(date) ?? [];
    const total = cashTotals(actual, pending);
    return <button key={date} aria-label={`${date} 상세`} aria-pressed={selected === date} className={`${selected === date ? "selected" : ""} ${date.slice(0, 7) !== month ? "outside" : ""}`} aria-haspopup="dialog" onClick={() => onOpenDate(date)}><span className="cash-day-number">{Number(date.slice(8))}{date === seoulToday() && <small>오늘</small>}</span>{bankTracks.map(t => { const a = actual.filter(d => accountTrack(accounts.find(account => account.id === d.account_id)) === t.id); const p = pending.filter(plan => planTrack(plan, accounts) === t.id); const incoming=a.reduce((s,d)=>s+Number(d.income),0), outgoing=a.reduce((s,d)=>s+Number(d.expense),0), plannedIn=p.filter(p=>p.direction==="IN").reduce((s,p)=>s+Number(p.remaining),0), plannedOut=p.filter(p=>p.direction==="OUT").reduce((s,p)=>s+Number(p.remaining),0); return <span className="cash-calendar-track" key={t.id}><b>{t.label}</b>{incoming>0 && <span>입 {money(incoming)}</span>}{outgoing>0 && <span>출 {money(outgoing)}</span>}{plannedIn>0 && <span>입 예정 {money(plannedIn)}</span>}{plannedOut>0 && <span>출 예정 {money(plannedOut)}</span>}</span>; })}<span className={`cash-net ${total.net < 0 ? "negative" : ""}`}>순 {signedCashMoney(total.net)}</span>{pending.some(p => !planTrack(p, accounts)) && <small>은행 미지정 계획 포함</small>}{actual.some(d => Number(d.transfer) !== 0) && <small>내부이체 있음</small>}{mode === "week" && pending.map(p => <span className="cash-week-item" key={p.id}>{p.title}<small>{p.counterparty_name || p.account_name}</small></span>)}</button>;
  })}</div></div></div></>;
}

function DayTransactions({ date, account, track, accounts }: { date: string; account: string; track: string; accounts: CashAccount[] }) {
  return <>{bankTracks.filter(t => !track || t.id === track).map(t => <section key={t.id}><h3>{t.label} 실제 거래</h3>{accounts.filter(a => accountTrack(a) === t.id && (!account || String(a.id) === account)).map(a => <AccountDayTransactions key={a.id} date={date} account={String(a.id)} />)}</section>)}</>;
}
function AccountDayTransactions({ date, account }: { date: string; account: string }) {
  const [page, setPage] = useState(1);
  const rows = useApiQuery<{ total: number; rows: { id: number; trans_at: string; description: string; user_memo?: string; counterparty_text: string; alias: string; deposit_amount: number; withdraw_amount: number; classification: string }[] }>(`/accounting/bank-transactions?from=${date}&to=${date}&page=${page}${account ? `&source=${account}` : ""}`);
  useEffect(() => { setPage(1); }, [date, account]);
  return <div className="cash-day-actual" aria-busy={rows.isFetching}><h4>실제 은행거래 {rows.data ? `${rows.data.total}건` : ""}</h4>{rows.isError && <p role="alert">{rows.error.message}</p>}{rows.data?.rows.map(r => <div key={r.id}><span>{r.description || r.counterparty_text || "은행거래"}{r.user_memo && <small className="bank-user-memo">{r.user_memo}</small>}<small>{r.alias} · {minute(r.trans_at)}{r.classification === "INTERNAL_TRANSFER" ? " · 내부이체" : ""}</small></span><strong>{Number(r.deposit_amount) > 0 ? "+" : "−"}{money(Number(r.deposit_amount) || Number(r.withdraw_amount))}</strong></div>)}{rows.data?.total === 0 && <p className="cash-muted">이 날짜에 수집된 거래가 없습니다.</p>}{!!rows.data && rows.data.total > 50 && <div className="cash-actions"><button disabled={page === 1} onClick={() => setPage(p => p - 1)}>이전</button><span>{page} / {Math.ceil(rows.data.total / 50)}</span><button disabled={page * 50 >= rows.data.total} onClick={() => setPage(p => p + 1)}>다음</button></div>}</div>;
}

function PlanEditor({ plan, bill, date, accounts, onSaved }: { plan: CashPlan | null; bill: boolean; date: string; accounts: CashAccount[]; onSaved: (message: string) => void }) {
  const [form, setForm] = useState({ title: plan?.title ?? (bill ? "법인카드 결제대금" : ""), direction: plan?.direction ?? "OUT", amount: String(plan?.amount ?? ""), plannedDate: plan?.planned_date ?? date, accountId: String(plan?.account_id ?? ""), counterparty: plan?.counterparty_name ?? "", category: plan?.category_name ?? "", certainty: plan?.certainty ?? "ESTIMATED", memo: plan?.memo ?? "", repeat: "once", endMonth: date.slice(0, 7), previousBusinessDay: !plan && !bill, cardIssuer: plan?.card_issuer ?? (bill ? "BC" : ""), billingMonth: plan?.billing_month?.slice(0, 7) ?? "" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [requestKey] = useState(() => crypto.randomUUID());
  const eligibleAccounts = useMemo(() => accounts.filter(a => !form.cardIssuer || accountTrack(a) === (form.cardIssuer === "BC" ? "IBK" : "HANA")), [accounts, form.cardIssuer]);
  useEffect(() => {
    if (form.cardIssuer && !eligibleAccounts.some(a => String(a.id) === form.accountId)) {
      setForm(f => ({ ...f, accountId: eligibleAccounts.length === 1 ? String(eligibleAccounts[0].id) : "" }));
    }
  }, [form.cardIssuer, form.accountId, eligibleAccounts]);
  const field = (key: keyof typeof form, value: string | boolean) => setForm(f => ({ ...f, [key]: value }));
  const months = planOccurrences(form);
  async function save(e: React.FormEvent) { e.preventDefault(); if (!Number.isInteger(months) || months < 1 || months > 200) { setError("종료월을 확인해주세요. 최대 200회차를 등록할 수 있습니다."); return; } setBusy(true); setError(""); try { await api(`/accounting/cash/plans${plan ? `/${plan.id}` : ""}`, { method: plan ? "PUT" : "POST", body: JSON.stringify({ ...form, amount: Number(form.amount), accountId: form.accountId ? Number(form.accountId) : null, months, monthEnd: form.repeat === "end", cardIssuer: form.cardIssuer || null, billingMonth: form.cardIssuer ? `${form.billingMonth || form.plannedDate.slice(0, 7)}-01` : null, version: plan?.version ?? 0, requestKey }) }); onSaved(plan ? "계획을 수정했습니다." : `${months}건의 계획을 등록했습니다.`); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  async function cancel() { if (!plan || !window.confirm("이 계획을 취소할까요? 기존 기록은 보존됩니다.")) return; setBusy(true); setError(""); try { await api(`/accounting/cash/plans/${plan.id}/cancel`, { method: "POST", body: JSON.stringify({ version: plan.version }) }); onSaved("계획을 취소했습니다."); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  return <form onSubmit={save} className="cash-form"><fieldset disabled={busy || plan?.status === "VOID"}><div className="cash-form-grid">
    <label className="wide">항목명<input required maxLength={255} value={form.title} onChange={e => field("title", e.target.value)} placeholder="예: 11월 유지보수료, 급여, 카드대금" /></label>
    <PlanChoice label="구분" value={form.direction} disabled={!!form.cardIssuer} options={[["IN", "입금"], ["OUT", "출금"]]} onChange={v => field("direction", v)} />
    <label>예정금액 (원)<PlanAmountInput value={form.amount} onChange={v => field("amount", v)} /></label>
    <div className="wide"><PlanScheduleFields value={form} single={!!plan} onChange={schedule => setForm(current => ({ ...current, ...schedule }))} /></div>
    {bill && <PlanChoice label="카드사" value={form.cardIssuer} options={[["BC", "BC카드"], ["HANA", "하나카드"]]} onChange={v => { field("cardIssuer", v); field("direction", "OUT"); }} />}
    <PlanChoice label="입출금 계좌" value={form.accountId} options={[["", form.cardIssuer ? "선택" : "미지정"], ...eligibleAccounts.map(a => [String(a.id), a.alias] as [string, string])]} onChange={v => field("accountId", v)} />
    <details className="wide cash-plan-details"><summary>추가 정보</summary><div className="cash-form-grid">
      <label>거래처<input maxLength={200} value={form.counterparty} onChange={e => field("counterparty", e.target.value)} /></label>
      <label>분류<input maxLength={100} value={form.category} onChange={e => field("category", e.target.value)} /></label>
      <PlanChoice label="금액 확인" value={form.certainty} options={[["ESTIMATED", "추정"], ["CONFIRMED", "확정"]]} onChange={v => field("certainty", v)} />
      {!bill && <PlanChoice label="카드 청구" value={form.cardIssuer} options={[["", "일반 입출금"], ["BC", "BC카드"], ["HANA", "하나카드"]]} onChange={v => { field("cardIssuer", v); if (v) field("direction", "OUT"); }} />}
      {form.cardIssuer && <label>결제월 변경<input type="month" value={form.billingMonth || form.plannedDate.slice(0, 7)} onChange={e => field("billingMonth", e.target.value)} /></label>}
      <label className="wide">메모<textarea rows={3} maxLength={5000} value={form.memo} onChange={e => field("memo", e.target.value)} /></label>
    </div></details>
  </div></fieldset>
  {plan && <p className="cash-muted">최초 계획 {plan.original_date} · {money(plan.original_amount)}<br />실적 연결 {money(plan.settled)} · 이 건만 수정합니다.</p>}
  {!plan && months > 1 && <p className="cash-muted">첫 달부터 {months}개월을 한 번에 등록합니다. 지정한 날짜가 없는 달은 말일을 기준으로 계산합니다.</p>}
  {form.previousBusinessDay && <p className="cash-muted">휴일 조정은 2030년까지 적용됩니다.</p>}
  {error && <p role="alert" className="cash-error">{error}</p>}<footer>{plan && <button type="button" className="accounting-cancel" disabled={busy || plan.status === "VOID" || Number(plan.settled) > 0} onClick={() => void cancel()}>계획 취소</button>}<button type="submit" className="cash-create" disabled={busy || plan?.status === "VOID"}>{busy ? "저장 중…" : plan ? "변경 저장" : "계획 등록"}</button></footer></form>;
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
