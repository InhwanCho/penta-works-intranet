"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useOfficePathname } from "./office-tab-context";
import { CashWorkflow } from "./cash-workflow";
import { dailyBankRows } from "@/lib/cash-daily";
import { CashDialog } from "./cash-dialog";
import { PlanAmountInput, PlanChoice, PlanScheduleFields, planOccurrences } from "./cash-plan-fields";
const BatchCashPlans = dynamic(() => import("./batch-cash-plans").then(m => m.BatchCashPlans));
import { AccountingLoader } from "./loading-indicator";
import { CalendarDays, ChevronLeft, ChevronRight, CreditCard, Landmark, Plus, RefreshCw, Search, X } from "lucide-react";
import { api, request } from "@/lib/api";
import { apiKey, staleTime } from "@/lib/query-client";
import { useApiQuery } from "@/lib/use-api-query";
import { accountTrack, planTrack, bankTracks, cashTotals, signedCashMoney, cashMoney as money, isOpenPlan, hasPendingAmount, needsIncomeCheck, monthBounds, planStatus, seoulToday, shiftDate, type CashBalance, type CashAccount, type CashData, type CashDay, type CashPlan } from "@/lib/cash-planning";
import { minute } from "@/lib/accounting-format";

type View = "overview" | "calendar" | "plans" | "bills" | "daily";
const labels = { overview: "대시보드", calendar: "자금달력", plans: "입출금 계획", bills: "카드 결제예정", daily: "일별 자금집계" };
const errorText = (e: unknown) => e instanceof Error ? e.message : "처리하지 못했습니다.";

export function CashWorkspace({ view }: { view: View }) {
  const pathname = usePathname();
  const active = useOfficePathname() === pathname;
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
  const [notice, setNotice] = useState("");
  const plansOnly = view === "plans" || view === "bills";
  const calendarView = view === "overview" || view === "calendar";
  const bounds = monthBounds(month);
  const gridStart = shiftDate(bounds.from, -(new Date(`${bounds.from}T12:00:00Z`).getUTCDay() + 6) % 7);
  const gridEnd = shiftDate(gridStart, 41);
  const data = useApiQuery<CashData>(
    `/accounting/cash?from=${calendarView ? gridStart : bounds.from}&to=${calendarView ? gridEnd : bounds.to}&view=${view}&includeEarlier=false`, active,
  );
  const ready = !!data.data;
  const historyPath = `/accounting/cash/earlier-plans?before=${bounds.from}&billsOnly=${view === "bills"}`;
  const history = useInfiniteQuery({
    queryKey: apiKey(historyPath),
    initialPageParam: null as CashPlan | null,
    enabled: active && ready && (view === "overview" || plansOnly),
    staleTime: staleTime(historyPath),
    queryFn: ({ pageParam, signal }) => request<{ plans: CashPlan[]; hasMore: boolean }>(
      pageParam ? `${historyPath}&afterDate=${pageParam.planned_date}&afterId=${pageParam.id}` : historyPath,
      { signal },
    ),
    getNextPageParam: page => page.hasMore ? page.plans.at(-1) : undefined,
  });
  const accounts = useMemo(() => data.data?.accounts ?? [], [data.data]);
  const accountFilter = useCallback((p: CashPlan) =>
    (!account || String(p.account_id) === account) && (!track || planTrack(p, accounts) === track), [account, track, accounts]);
  const plans = useMemo(() => (data.data?.plans ?? []).filter(accountFilter), [data.data, accountFilter]);
  const earlier = useMemo(() => history.data?.pages.flatMap(page => page.plans.filter(accountFilter)) ?? [], [history.data, accountFilter]);
  const days = useMemo(() => (data.data?.days ?? []).filter(d => (!account || String(d.account_id) === account) && (!track || accountTrack(accounts.find(a => a.id === d.account_id)) === track)), [data.data, account, track, accounts]);
  const monthPlans = useMemo(() => plans.filter(p => p.planned_date >= bounds.from && p.planned_date <= bounds.to), [plans, bounds.from, bounds.to]);
  const open = useMemo(() => view === "overview" ? monthPlans.filter(isOpenPlan) : [], [monthPlans, view]);
  const reviewPlans = useMemo(() => [...earlier, ...monthPlans], [earlier, monthPlans]);
  const dueInMonth = useMemo(() => view === "overview" ? reviewPlans.filter(p => isOpenPlan(p) && shiftDate(p.planned_date, p.match_days ?? 7) < today) : [], [reviewPlans, view, today]);
  const incomeAttention = useMemo(() => view === "overview" || view === "plans" ? reviewPlans.filter(p => needsIncomeCheck(p, today)) : [], [reviewPlans, view, today]);
  const listFilter = useCallback((p: CashPlan) => {
    if (direction && p.direction !== direction) return false;
    if (search && !`${p.title} ${p.counterparty_name} ${p.category_name}`.toLowerCase().includes(search.toLowerCase())) return false;
    switch (filter) {
      case "income-attention": return needsIncomeCheck(p, today);
      case "open": return isOpenPlan(p);
      case "late": return isOpenPlan(p) && shiftDate(p.planned_date, p.match_days ?? 7) < today;
      case "done": return planStatus(p, today) === "완료";
      default: return true;
    }
  }, [direction, search, filter, today]);
  const visible = useMemo(() => plansOnly ? monthPlans.filter(listFilter) : [], [monthPlans, plansOnly, listFilter]);
  const visibleEarlier = useMemo(() => plansOnly ? earlier.filter(listFilter) : [], [earlier, plansOnly, listFilter]);
  const historyPending = history.isFetching && !history.data;
  const partialHistory = history.isPending || history.isError || history.hasNextPage;
  function refresh() {
    void data.refetch();
    if (history.data) void history.refetch();
  }
  const historyControls = <>
    {historyPending && <p className="cash-guidance" role="status">이전 달 미처리 계획을 불러오는 중…</p>}
    {history.isError && <p className="cash-guidance" role="alert">{history.error.message} <button onClick={() => void (history.isFetchNextPageError ? history.fetchNextPage() : history.refetch())}>다시 불러오기</button></p>}
    {history.hasNextPage && !history.isFetchNextPageError && <div className="cash-panel-heading"><button type="button" disabled={history.isFetching} onClick={() => void history.fetchNextPage()}>{history.isFetchingNextPage ? "불러오는 중…" : "이전 계획 더 보기"}</button></div>}
  </>;
  const sum = (rows: CashPlan[], dir: string) => rows.filter(p => p.direction === dir).reduce((s, p) => s + Number(p.remaining), 0);
  function changeMonth(value: string) { if (!/^\d{4}-\d{2}$/.test(value)) return; setMonth(value); setSelected(`${value}-01`); }
  function move(amount: number) { const [y, m] = month.split("-").map(Number); changeMonth(new Date(Date.UTC(y, m - 1 + amount, 1)).toISOString().slice(0, 7)); }
  const selectDate = useCallback((date: string) => {
    setSelected(date);
    setMonth(date.slice(0, 7));
  }, []);
  const openDate = useCallback((date: string) => { selectDate(date); setDetailDate(date); }, [selectDate]);
  function saved(message: string) { setEditor(null); setNotice(message); }
  return <div className="cash-workspace accounting-office">
    <header className="cash-page-heading"><div><span className="cash-eyebrow">회계 · 자금관리</span><h1>{labels[view]}</h1></div><div className="cash-actions"><button onClick={refresh} disabled={!data.data || data.isFetching} aria-label="대시보드 새로고침"><RefreshCw /></button><button className="cash-create" disabled={!ready} onClick={() => setEditor("new")}><Plus />{view === "bills" ? "청구액 등록" : "계획 등록"}</button>{view !== "bills" && <button disabled={!ready} onClick={() => setEditor("batch")}>여러 건 등록</button>}</div></header>
    {view === "plans" && <CashWorkflow step="plans" />}
    {data.isError && <p role="alert" className="cash-error">{data.error.message}<button onClick={() => void data.refetch()}>다시 불러오기</button></p>}
    {data.isPending && <AccountingLoader />}
    {notice && <p className="cash-notice" role="status">{notice}<button aria-label="알림 닫기" onClick={() => setNotice("")}><X /></button></p>}
    {data.data && <>
      {plans.some(p => p.card_issuer && accountTrack(accounts.find(a => a.id === p.account_id)) !== planTrack(p, accounts)) && <p className="cash-guidance">카드 결제은행과 등록 계좌가 다른 계획이 있습니다. BC카드는 기업은행, 하나카드는 하나은행 계좌로 계획을 수정해주세요. 은행별 예정액은 카드 결제은행 기준입니다.</p>}
      <div className="cash-toolbar"><div className="cash-month"><button aria-label="이전 달" onClick={() => move(-1)}><ChevronLeft /></button><label><span className="sr-only">조회 월</span><input type="month" value={month} onChange={e => changeMonth(e.target.value)} /></label><button aria-label="다음 달" onClick={() => move(1)}><ChevronRight /></button><button onClick={() => { changeMonth(today.slice(0, 7)); setSelected(today); }}>이번 달</button></div><select aria-label="은행별 보기" value={track} onChange={e => { setTrack(e.target.value); setAccount(""); }}><option value="">전체 은행</option>{bankTracks.map(t => <option key={t.id} value={t.id}>{t.label} · {t.card}</option>)}</select><label className="cash-account-filter"><Landmark /><select aria-label="계좌 필터" value={account} onChange={e => setAccount(e.target.value)}><option value="">전체 계좌</option>{accounts.filter(a => !track || accountTrack(a) === track).map(a => <option key={a.id} value={a.id}>{a.alias}</option>)}</select></label></div>
      {view === "daily" && <DailyCashTable month={month} accounts={accounts.filter(a => (!account || String(a.id) === account) && (!track || accountTrack(a) === track))} days={days} plans={plans} balances={data.data.balances ?? []} />}
      {(view === "overview" || view === "plans") && incomeAttention.length > 0 && <section className="cash-income-alert" aria-label="입금 확인 필요">
        <div>
          <strong>입금 확인 필요 {incomeAttention.length}건{partialHistory && <small> · 현재 조회 기준</small>}</strong>
          <span>기한 경과 {incomeAttention.filter(p => shiftDate(p.planned_date, p.match_days ?? 7) < today).length}건 · 오늘 예정 {incomeAttention.filter(p => p.planned_date === today).length}건</span>
          <small>은행거래에서 확인한 금액 기준</small>
        </div>
        <div><strong>남은 입금 {money(sum(incomeAttention, "IN"))}</strong>
          {view === "plans" ? <button type="button" onClick={() => { setFilter("income-attention"); setDirection(""); setSearch(""); }}>확인 필요한 입금 보기</button> :
            <a href="#cash-priority-plans">확인할 계획 보기 ↓</a>}
        </div>
      </section>}
      {(view === "calendar" || view === "overview") && <section className="cash-panel cash-calendar-panel"><div className="cash-panel-heading"><div><h2>{view === "overview" ? "이번 달 자금흐름" : "자금 일정"}</h2></div><div className="cash-segment" aria-label="달력 보기">{(["month", "week"] as const).map(m => <button key={m} aria-pressed={mode === m} className={mode === m ? "selected" : ""} onClick={() => setMode(m)}>{m === "month" ? "월간" : "주간"}</button>)}</div></div><CashCalendar accounts={accounts} start={gridStart} month={month} selected={selected} setSelected={selectDate} onOpenDate={openDate} mode={mode} plans={plans} days={days} />

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
        <section className="cash-panel" id="cash-priority-plans"><div className="cash-panel-heading"><h2>먼저 확인할 계획</h2><Link href="/accounting/review">입출금 확인 메뉴로 →</Link></div><BankPlanTables accounts={accounts} plans={[...incomeAttention, ...dueInMonth.filter(p => p.direction !== "IN"), ...open.filter(p => p.planned_date >= today && !needsIncomeCheck(p, today))].slice(0, 5)} onEdit={setEditor} empty={partialHistory ? "현재 조회한 계획 중 확인할 항목이 없습니다." : "기한이 지났거나 처리가 필요한 계획이 없습니다."} />{historyControls}</section>
      </>}
      {(view === "plans" || view === "bills") && <>
        {view === "bills" && <div className="cash-guidance"><CreditCard /><div><strong>사용내역과 결제예정액은 따로 관리합니다.</strong><p>청구서를 확인한 금액만 ‘확정’으로 등록하세요. 승인내역 합계는 자동으로 청구액이 되지 않습니다. 카드사별 결제월 합계로 등록하며, 은행 출금 내역을 확인하면 중복 집계하지 않습니다.</p></div><Link href="/accounting/cards/upload">사용내역 업로드 →</Link></div>}
        <div className="cash-list-filters"><div className="cash-segment">{[["open", "미처리"], ...(view === "plans" ? [["income-attention", "입금 확인 필요"]] : []), ["late", "거래 미확인"], ["done", "완료"], ["all", "전체"]].map(([id, text]) => <button key={id} aria-pressed={filter === id} className={filter === id ? "selected" : ""} onClick={() => setFilter(id)}>{text}</button>)}</div><select aria-label="입출금 방향" value={direction} onChange={e => setDirection(e.target.value)}><option value="">입금·출금 전체</option><option value="IN">입금</option><option value="OUT">출금</option></select><label className="cash-search"><Search /><input placeholder="거래처, 항목 검색" aria-label="계획 검색" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
        <section className="cash-panel"><div className="cash-panel-heading"><h2>{view === "bills" ? "월별 카드 결제예정" : "계획 목록"} <small>{visible.length}건</small></h2><span className="cash-muted">{month}</span></div><BankPlanTables accounts={accounts} plans={visible} onEdit={setEditor} empty={search ? "검색 조건에 맞는 계획이 없습니다." : "등록된 계획이 없습니다. 계획을 등록하면 달력에도 표시됩니다."} /></section>
        {filter !== "done" && (earlier.length > 0 || historyPending || history.isError || history.hasNextPage) && <section className="cash-panel">
          <div className="cash-panel-heading"><h2>이전 달 미처리 계획 <small>{visibleEarlier.length}건</small></h2></div>
          {(visibleEarlier.length > 0 || (!historyPending && !history.isError)) && <BankPlanTables accounts={accounts} plans={visibleEarlier} onEdit={setEditor} empty="현재 조회한 이전 계획 중 조건에 맞는 항목이 없습니다." />}
          {historyControls}
        </section>}
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
              onEdit={setEditor} empty="등록된 계획이 없습니다." />}
        </section>
        {data.data && <section><h3>은행거래 실적</h3><DayTransactions date={detailDate} account={account} track={track} accounts={accounts} /></section>}
      </div>
    </CashDialog>}
    {editor === "batch" && <CashDialog wide title="입출금 계획 여러 건 등록" onClose={() => setEditor(null)}><BatchCashPlans date={view === "overview" || view === "calendar" ? selected : month === today.slice(0, 7) ? today : bounds.from} direction={direction} accountId={account} accounts={accounts} onSaved={saved} /></CashDialog>}
    {editor && editor !== "batch" && <CashDialog title={editor === "new" ? view === "bills" ? "카드 청구액 등록" : "입출금 계획 등록" : "계획 상세·수정"} onClose={() => setEditor(null)}><PlanEditor plan={editor === "new" ? null : editor} bill={view === "bills"} date={view === "calendar" || view === "overview" ? selected : `${month}-15`} accounts={accounts} onSaved={saved} /></CashDialog>}
  </div>;
}

function groupByDate<T>(rows: T[], date: (row: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = date(row), entries = grouped.get(key);
    if (entries) entries.push(row); else grouped.set(key, [row]);
  }
  return grouped;
}

function DailyCashTable({ month, accounts, days, plans, balances }: { month: string; accounts: CashAccount[]; days: CashDay[]; plans: CashPlan[]; balances: CashBalance[] }) {
  const [showAll, setShowAll] = useState(false);
  const bounds = monthBounds(month);
  const dates = Array.from({ length: Number(bounds.to.slice(8)) }, (_, i) => shiftDate(bounds.from, i));
  const monthlyDays = days.filter(d => d.date >= bounds.from && d.date <= bounds.to);
  const monthlyPlans = plans.filter(p => p.planned_date >= bounds.from && p.planned_date <= bounds.to);
  const monthly = cashTotals(monthlyDays, monthlyPlans);
  const visibleDates = dates.filter(date => showAll || days.some(d => d.date === date) || plans.some(p => p.planned_date === date && isOpenPlan(p)));
  const closing = dailyBankRows(accounts, monthlyDays, monthlyPlans, balances, bounds.to);
  const bankCells = (row: ReturnType<typeof dailyBankRows>[number]) => <><td className="number">{money(row.income)}</td><td className="number">{money(row.expense)}</td><td className="number">{signedCashMoney(row.transfer)}</td><td className="number">{money(row.balance)}</td><td className="number">{money(row.plannedIn)}</td><td className="number">{money(row.plannedOut + row.cardOut)}{row.cardOut > 0 && <small>카드 {money(row.cardOut)} 포함</small>}</td><td className="number cash-net">{signedCashMoney(row.net)}</td></>;
  return <section className="cash-panel"><div className="cash-panel-heading"><h2>{Number(month.slice(5))}월 일별 자금집계</h2><strong>월 순증감 {signedCashMoney(monthly.net)}</strong></div>
    <p className="cash-guidance">은행별 실적과 남은 계획을 한 줄씩 보여줍니다. 순증감은 실제 입출금과 남은 계획을 합친 금액이며, 확인 잔액은 통장에서 마지막으로 확인한 잔액입니다.</p>
    <label className="cash-daily-toggle"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> 거래·계획이 없는 날짜도 보기</label>
    <div className="cash-table-scroll"><table className="cash-table cash-daily-table"><thead><tr>{["일자", "은행", "실제 입금", "실제 출금", "내부이체", "확인 잔액", "남은 입금계획", "남은 출금계획", "순증감"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{visibleDates.flatMap(date => {
      const actual = days.filter(d => d.date === date), pending = plans.filter(p => p.planned_date === date);
      const rows = dailyBankRows(accounts, actual, pending, balances, date);
      const total = cashTotals(actual, pending);
      const known = rows.filter(r => r.key !== "unassigned");
      const balance = known.length > 0 && known.every(r => r.balance != null) ? known.reduce((sum, r) => sum + Number(r.balance), 0) : null;
      return [...rows.map((row, i) => <tr key={`${date}-${row.key}`} className={i === 0 ? "cash-day-start" : ""}><th>{i === 0 ? date : ""}</th><td>{row.label}</td>{bankCells(row)}</tr>), <tr key={`${date}-total`} className="cash-day-total"><th>{rows.length ? "" : date}</th><th>하루 합계</th>{bankCells({key:"total",label:"하루 합계",...total,transfer:rows.reduce((sum,r)=>sum+r.transfer,0),balance})}</tr>];
    })}</tbody><tfoot>{closing.map((row,i) => <tr key={row.key}><th>{i === 0 ? "월 합계" : ""}</th><th>{row.label}</th>{bankCells(row)}</tr>)}</tfoot></table>{!visibleDates.length && <p className="cash-empty">이 달에는 거래와 미완료 계획이 없습니다.</p>}</div>
    <p className="cash-muted">출금계획에는 카드대금을 포함합니다. 내부이체 원금은 순증감에서 제외하고 수수료만 실제 출금에 포함합니다. 월 합계의 확인 잔액은 월말 기준입니다.</p>
  </section>;
}

function BankPlanTables({ plans, onEdit, empty }: { accounts: CashAccount[]; plans: CashPlan[]; onEdit: (p: CashPlan) => void; empty: string }) {
  return <PlanTable plans={plans} onEdit={onEdit} empty={empty} />;
}

function PlanTable({ plans, onEdit, empty }: { plans: CashPlan[]; onEdit: (p: CashPlan) => void; empty: string }) {
  if (!plans.length) return <div className="cash-empty"><CalendarDays /><p>{empty}</p></div>;
  const today = seoulToday();
  return <div className="cash-table-scroll"><table className="cash-table"><thead><tr><th>예정일 / 상태</th><th>입출금</th><th>계획 / 거래처</th><th>계좌</th><th>예상 금액</th><th>실제 입출금</th><th>관리</th></tr></thead><tbody>{plans.map(p => <tr key={p.id}><td>{p.planned_date}<small>{planStatus(p,today)}</small></td><td><span className={`cash-plan-direction ${p.direction === "IN" ? "in" : "out"}`}>{p.direction === "IN" ? "입금" : "출금"}</span></td><td><strong>{p.title}</strong><small>{p.counterparty_name || p.category_name || "—"}</small>{p.memo && <small className="cash-memo">{p.memo}</small>}</td><td>{p.account_name || "미지정"}</td><td className="number">{hasPendingAmount(p) ? "금액 미정" : money(p.amount)}</td><td className="number">{Number(p.settled) > 0 ? money(p.settled) : "아직 없음"}</td><td><div className="cash-actions"><button onClick={() => onEdit(p)}>계획 수정</button></div></td></tr>)}</tbody></table></div>;
}

const CashCalendar = memo(function CashCalendar({ accounts, start, month, selected, setSelected, onOpenDate, mode, plans, days }: { accounts: CashAccount[]; start: string; month: string; selected: string; setSelected: (d: string) => void; onOpenDate: (d: string) => void; mode: "month" | "week"; plans: CashPlan[]; days: CashDay[] }) {
  const today = seoulToday();
  const weekStart = shiftDate(selected, -(new Date(`${selected}T12:00:00Z`).getUTCDay() + 6) % 7);
  const dates = Array.from({ length: mode === "month" ? 42 : 7 }, (_, i) => shiftDate(mode === "month" ? start : weekStart, i));
  const indexed = useMemo(() => {
    return { actual: groupByDate(days, d => d.date), pending: groupByDate(plans.filter(isOpenPlan), p => p.planned_date) };
  }, [days, plans]);
  return <><div className="cash-calendar-legend"><span>실제 거래</span><span>예정: 아직 확인하지 않은 예정액</span><span>순 = 실적 입금 − 출금 + 잔여 입금예정 − 출금예정(카드 포함), 내부이체 제외</span>{mode === "week" && <div className="cash-actions"><button aria-label="이전 주" onClick={() => setSelected(shiftDate(selected, -7))}><ChevronLeft /></button><button aria-label="다음 주" onClick={() => setSelected(shiftDate(selected, 7))}><ChevronRight /></button></div>}</div><div className="cash-calendar-scroll"><div className={`cash-calendar ${mode}`}><div className="cash-weekdays">{["월", "화", "수", "목", "금", "토", "일"].map(d => <span key={d}>{d}</span>)}</div><div className="cash-date-grid">{dates.map(date => {
    const actual = indexed.actual.get(date) ?? []; const pending = indexed.pending.get(date) ?? [];
    const total = cashTotals(actual, pending);
    const incomeToCheck = pending.filter(p => needsIncomeCheck(p, today));
    return <button key={date} aria-label={`${date} 상세`} aria-pressed={selected === date} className={`${selected === date ? "selected" : ""} ${date.slice(0, 7) !== month ? "outside" : ""}`} aria-haspopup="dialog" onClick={() => onOpenDate(date)}><span className="cash-day-number">{Number(date.slice(8))}{date === today && <small>오늘</small>}</span>{bankTracks.map(t => { const a = actual.filter(d => accountTrack(accounts.find(account => account.id === d.account_id)) === t.id); const p = pending.filter(plan => planTrack(plan, accounts) === t.id); const incoming=a.reduce((s,d)=>s+Number(d.income),0), outgoing=a.reduce((s,d)=>s+Number(d.expense),0), plannedIn=p.filter(p=>p.direction==="IN").reduce((s,p)=>s+Number(p.remaining),0), plannedOut=p.filter(p=>p.direction==="OUT").reduce((s,p)=>s+Number(p.remaining),0); return <span className="cash-calendar-track" key={t.id}><b>{t.label}</b>{incoming>0 && <span>입 {money(incoming)}</span>}{outgoing>0 && <span>출 {money(outgoing)}</span>}{plannedIn>0 && <span>입 예정 {money(plannedIn)}</span>}{plannedOut>0 && <span>출 예정 {money(plannedOut)}</span>}{p.some(hasPendingAmount) && <span>금액 미정 {p.filter(hasPendingAmount).length}건</span>}</span>; })}<span className={`cash-net ${total.net < 0 ? "negative" : ""}`}>순 {signedCashMoney(total.net)}</span>{incomeToCheck.length > 0 && <span className={`cash-income-badge ${date === today ? "today" : ""}`}>{date === today ? "입금 확인" : "입금 지연"} {incomeToCheck.length}건</span>}{pending.some(p => !planTrack(p, accounts)) && <small>은행 미지정 계획 포함</small>}{actual.some(d => Number(d.transfer) !== 0) && <small>내부이체 있음</small>}{mode === "week" && pending.map(p => <span className="cash-week-item" key={p.id}>{p.title}<small>{p.counterparty_name || p.account_name}</small></span>)}</button>;
  })}</div></div></div></>;
});

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
  const [form, setForm] = useState({ title: plan?.title ?? (bill ? "법인카드 결제대금" : ""), direction: plan?.direction ?? "OUT", amount: String(plan?.amount || ""), amountPending: !!plan && hasPendingAmount(plan), plannedDate: plan?.planned_date ?? date, accountId: String(plan?.account_id ?? ""), counterparty: plan?.counterparty_name ?? "", category: plan?.category_name ?? "", certainty: plan?.certainty ?? "ESTIMATED", memo: plan?.memo ?? "", repeat: "once", endMonth: date.slice(0, 7), previousBusinessDay: !plan && !bill, cardIssuer: plan?.card_issuer ?? (bill ? "BC" : ""), billingMonth: plan?.billing_month?.slice(0, 7) ?? "" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [requestKey] = useState(() => crypto.randomUUID());
  const eligibleAccounts = useMemo(() => accounts.filter(a => !form.cardIssuer || accountTrack(a) === (form.cardIssuer === "BC" ? "IBK" : "HANA")), [accounts, form.cardIssuer]);
  useEffect(() => {
    if (form.cardIssuer && !eligibleAccounts.some(a => String(a.id) === form.accountId)) {
      setForm(f => ({ ...f, accountId: eligibleAccounts.length === 1 ? String(eligibleAccounts[0].id) : "" }));
    }
  }, [form.cardIssuer, form.accountId, eligibleAccounts]);
  const field = (key: keyof typeof form, value: string | boolean) => setForm(f => ({ ...f, [key]: value }));
  const months = planOccurrences(form);
  async function save(e: React.FormEvent) { e.preventDefault(); if (!Number.isInteger(months) || months < 1 || months > 200) { setError("종료월을 확인해주세요. 최대 200회차를 등록할 수 있습니다."); return; } setBusy(true); setError(""); try { await api(`/accounting/cash/plans${plan ? `/${plan.id}` : ""}`, { method: plan ? "PUT" : "POST", body: JSON.stringify({ ...form, amount: form.direction === "OUT" && form.amountPending ? null : Number(form.amount), accountId: form.accountId ? Number(form.accountId) : null, months, monthEnd: form.repeat === "end", cardIssuer: form.cardIssuer || null, billingMonth: form.cardIssuer ? `${form.billingMonth || form.plannedDate.slice(0, 7)}-01` : null, version: plan?.version ?? 0, requestKey }) }); onSaved(plan ? "계획을 수정했습니다." : `${months}건의 계획을 등록했습니다.`); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  async function cancel() { if (!plan || !window.confirm("이 계획을 취소할까요? 기존 기록은 보존됩니다.")) return; setBusy(true); setError(""); try { await api(`/accounting/cash/plans/${plan.id}/cancel`, { method: "POST", body: JSON.stringify({ version: plan.version }) }); onSaved("계획을 취소했습니다."); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  return <form onSubmit={save} className="cash-form"><fieldset disabled={busy || plan?.status === "VOID"}><div className="cash-form-grid">
    <label className="wide">항목명<input required maxLength={255} value={form.title} onChange={e => field("title", e.target.value)} placeholder="예: 11월 유지보수료, 급여, 카드대금" /></label>
    <PlanChoice label="구분" value={form.direction} disabled={!!form.cardIssuer} options={[["IN", "입금"], ["OUT", "출금"]]} onChange={v => field("direction", v)} />
    <div>
      {!(form.direction === "OUT" && form.amountPending) && <label>예정금액 (원)<PlanAmountInput value={form.amount} onChange={v => field("amount", v)} /></label>}
      {form.direction === "OUT" && <label className="cash-check"><input type="checkbox" checked={form.amountPending}
        disabled={!!plan && Number(plan.settled) > 0} onChange={e => { field("amountPending", e.target.checked); if (e.target.checked) field("certainty", "ESTIMATED"); }} />금액 미정</label>}
    </div>
    <div className="wide"><PlanScheduleFields value={form} single={!!plan} onChange={schedule => setForm(current => ({ ...current, ...schedule }))} /></div>
    {bill && <PlanChoice label="카드사" value={form.cardIssuer} options={[["BC", "BC카드"], ["HANA", "하나카드"]]} onChange={v => { field("cardIssuer", v); field("direction", "OUT"); }} />}
    <PlanChoice label="입출금 계좌" value={form.accountId} options={[["", form.cardIssuer ? "선택" : "미지정"], ...eligibleAccounts.map(a => [String(a.id), a.alias] as [string, string])]} onChange={v => field("accountId", v)} />
    <details className="wide cash-plan-details"><summary>추가 정보</summary><div className="cash-form-grid">
      <label>거래처<input maxLength={200} value={form.counterparty} onChange={e => field("counterparty", e.target.value)} /></label>
      <label>분류<input maxLength={100} value={form.category} onChange={e => field("category", e.target.value)} /></label>
      <PlanChoice label="금액 확인" value={form.certainty} disabled={form.direction === "OUT" && form.amountPending} options={[["ESTIMATED", "추정"], ["CONFIRMED", "확정"]]} onChange={v => field("certainty", v)} />
      {!bill && <PlanChoice label="카드 청구" value={form.cardIssuer} options={[["", "일반 입출금"], ["BC", "BC카드"], ["HANA", "하나카드"]]} onChange={v => { field("cardIssuer", v); if (v) field("direction", "OUT"); }} />}
      {form.cardIssuer && <label>결제월 변경<input type="month" value={form.billingMonth || form.plannedDate.slice(0, 7)} onChange={e => field("billingMonth", e.target.value)} /></label>}
      <label className="wide">메모<textarea rows={3} maxLength={5000} value={form.memo} onChange={e => field("memo", e.target.value)} /></label>
    </div></details>
  </div></fieldset>
  {plan && <p className="cash-muted">최초 계획 {plan.original_date} · {Number(plan.original_amount) === 0 ? "금액 미정" : money(plan.original_amount)}<br />확인된 금액 {money(plan.settled)} · 이 건만 수정합니다.</p>}
  {!plan && months > 1 && <p className="cash-muted">첫 달부터 {months}개월을 한 번에 등록합니다. 지정한 날짜가 없는 달은 말일을 기준으로 계산합니다.</p>}
  {form.previousBusinessDay && <p className="cash-muted">휴일 조정은 2030년까지 적용됩니다.</p>}
  {error && <p role="alert" className="cash-error">{error}</p>}<footer>{plan && <button type="button" className="accounting-cancel" disabled={busy || plan.status === "VOID" || Number(plan.settled) > 0} onClick={() => void cancel()}>계획 취소</button>}<button type="submit" className="cash-create" disabled={busy || plan?.status === "VOID"}>{busy ? "저장 중…" : plan ? "변경 저장" : "계획 등록"}</button></footer></form>;
}
