"use client";
import { useResetListFilters } from "@/lib/use-reset-list-filters";
import { useDebouncedValue } from "@/lib/use-debounced-value";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOfficePathname } from "./office-tab-context";
import { InvoiceDetail } from "./invoice-detail";
import { createPortal } from "react-dom";
import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Check, CircleHelp, FileText, Pencil, Plus, Printer, RefreshCw, Search, Settings2, Trash2, X } from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api, request } from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";
import { earliestInvoiceScheduleDate, emptyItem, emptyParty, grossPriceText, invoiceMoney, invoiceDisplayStatus, invoiceStatuses, invoiceStatusDetail, koreaToday, lineAmounts, newDocument, type Invoice, type InvoiceDocument, type InvoiceItem, type InvoiceSettings, type Party } from "@/lib/tax-invoices";

import { AccountingLoader } from "./loading-indicator";

import { TableColumnFilter, emptyColumnFilter, type ColumnFilterValue } from "./table-column-filter";

const base = "/accounting/tax-invoices";
type Customer = { id: string; party?: Party; name: string; business_no: string | null; source?: "saved" | "history" | "directory"; version?: number };
function recipientRegion(address?: string) {
  const parts = address?.trim().split(/\s+/) ?? [];
  return parts.slice(0, 3).filter((part, index) => index === 0 || /[시군구]$/.test(part)).join(" ");
}
type CustomerPage = { rows: Customer[]; total: number; page: number; pageSize: number };
type Action = (fn: () => Promise<void>) => Promise<void>;

export function TaxInvoices() {
  const settings = useApiQuery<InvoiceSettings>(`${base}/settings`);
  const router = useRouter();
  const pathname = useOfficePathname();
  const isDetail = pathname.startsWith(base + "/");
  const detail = useApiQuery<Invoice>(pathname, isDetail);
  const [localSelection, setSelected] = useState<Invoice | "new" | null>(null);
  const selected = isDetail ? detail.data ?? null : localSelection;
  const autoSyncPath = useRef("");
  const [syncingPath, setSyncingPath] = useState("");
  const syncTarget = isDetail && selected && selected !== "new" && selected.status === "ISSUED" && !["4","5"].includes(String(selected.nts_state)) ? pathname : "";
  useEffect(() => {
    if (!isDetail) { autoSyncPath.current = ""; return; }
    if (!syncTarget || autoSyncPath.current === syncTarget) return;
    autoSyncPath.current = syncTarget;
    setSyncingPath(syncTarget);
    void api<Invoice>(syncTarget + "/sync", {method:"POST"})
      .catch(() => undefined)
      .finally(() => setSyncingPath(current => current === syncTarget ? "" : current));
  }, [isDetail, syncTarget]);
  const syncing = syncingPath === pathname;
  const [correctId,setCorrectId] = useState<number|null>(null);
  const [reschedule, setReschedule] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const writing = localSelection === "new" || editingId !== null;
  useLayoutEffect(() => {
    const panel = workspace.current?.closest<HTMLElement>(".office-tab-panel");
    if (panel?.hidden) return;
    panel?.scrollTo({top: 0, behavior: "instant"});
    window.scrollTo({top: 0, behavior: "instant"});
  }, [pathname, writing]);
  const draftDetail = isDetail && selected !== "new" && selected?.id !== editingId;
  const [toast, setToast] = useState<{text: string; tone: "success" | "failure" | "warning"} | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const [customerManager, setCustomerManager] = useState(false);
  const [profile, setProfile] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [from, setFrom] = useState(() => `${koreaToday().slice(0, 7)}-01`);
  const [to, setTo] = useState(koreaToday);
  const [keyword, setKeyword] = useState("");
  const [condition, setCondition] = useState("corpName");
  const listKeyword = useDebouncedValue(keyword.trim());
  const [status, setStatus] = useState<ColumnFilterValue>(emptyColumnFilter);
  const [sort, setSort] = useState<ColumnFilterValue["sort"]>("");
  const today = koreaToday();
  const monthStart = today.slice(0, 7) + "-01";
  const [page, setPage] = useState(1);
  const active = useResetListFilters(() => {
    const date = koreaToday();
    setFrom(`${date.slice(0,7)}-01`); setTo(date); setKeyword(""); setCondition("corpName");
    setStatus(emptyColumnFilter); setSort(""); setPage(1);
  });
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  const validDates = days >= 0 && days < 200;
  const list = useApiQuery<{ rows: Invoice[]; total: number }>(`${base}?${new URLSearchParams({ from, to, keyword: listKeyword, condition, states: status.selected === null ? "" : status.selected.join(",") || "NONE", ascending: String(sort === "asc"), page: String(page) })}`, validDates && !selected && !isDetail);
  async function act(action: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "처리하지 못했습니다."); } finally { setBusy(false); }
  }
  function closeEditor() {
    if (editorDirty && !window.confirm("작성 중인 내용을 닫을까요?")) return;
    if (isDetail) router.replace(base);
    setEditingId(null); setSelected(null); setEditorDirty(false);  setError(""); setMessage("");
  }
  function create() { setEditingId(null); setSelected("new");  setError(""); setMessage(""); }
  return <div ref={workspace} className="accounting-dashboard tax-workspace accounting-office" data-unsaved={editorDirty} data-navigation-busy={busy}>
    {toast && <div className={`tax-result-toast ${toast.tone}`} role={toast.tone === "success" ? "status" : "alert"}><span>{toast.text}</span><button type="button" onClick={() => setToast(null)} aria-label="알림 닫기"><X size={16} /></button></div>}
    <header className="cash-page-heading cash-plan-heading tax-page-heading"><div><h2 className="tax-page-title">{selected || isDetail ? selected === "new" || (selected?.status === "DRAFT" && !draftDetail) ? "세금계산서 발행" : selected?.status === "SCHEDULED" && !draftDetail ? "예약 내용 수정" : "세금계산서 상세" : "세금계산서"}</h2></div>{selected || isDetail ? <button className="tax-back" onClick={closeEditor} disabled={busy}><ArrowLeft size={16} />목록으로</button> : <div className="tax-actions"><button onClick={() => setCustomerManager(true)}>거래처 관리</button><button disabled={!settings.data || busy} onClick={() => setProfile(true)}><Settings2 size={15} />공급자 설정</button></div>}</header>
    {settings.data?.environment === "test" && <p className="tax-notice">바로빌 테스트 환경입니다.</p>}
    {settings.isError && <p className="error" role="alert">{settings.error.message}</p>}{error && <p className="error" role="alert">{error}</p>}{message && <p className="tax-success" role="status">{message}</p>}{busy && <AccountingLoader label="처리 중" />}
    {customerManager && <CustomerBook close={() => setCustomerManager(false)} />}
    {profile && settings.data && <IssuerSettings settings={settings.data} busy={busy} error={error} close={() => setProfile(false)} act={act} saved={() => { setProfile(false); setMessage("공급자 기본정보를 저장했습니다."); }} />}
    {isDetail && detail.isError && <p role="alert">{detail.error.message}</p>}
    {isDetail && detail.isLoading && <AccountingLoader label="세금계산서를 불러오는 중" />}
    {selected && selected !== "new" && (!["DRAFT","SCHEDULED"].includes(selected.status) || draftDetail) ? <>
      <div className="cash-actions invoice-actions">
        <a href="https://www.hometax.go.kr/" target="_blank" rel="noopener noreferrer">홈택스 열기 ↗</a>
        {selected.status === "SCHEDULED" ? <>
          <button disabled={busy} onClick={() => setEditingId(selected.id)}>예약 내용 수정</button>
          <button disabled={busy} onClick={() => setReschedule([String(selected.scheduled_date).slice(0,10), earliestInvoiceScheduleDate()].sort()[1])}>예약일 변경</button>
          <button disabled={busy} onClick={() => void act(async () => {
            if (!window.confirm("예약을 삭제할까요? 이 계산서는 발송되지 않습니다.")) return;
            await api(base + "/" + selected.id + "/reservation?version="+selected.version, {method:"DELETE"});
            router.replace(base); setToast({tone:"success",text:"발급 예약을 삭제했습니다."});
          })}>예약 삭제</button>
        </> : selected.status === "DRAFT" ? <button onClick={() => setEditingId(selected.id)}>이어서 작성</button> :
          <button disabled={busy || syncing} onClick={() => void act(async () => { await api<Invoice>(`${base}/${selected.id}/sync`, { method: "POST" }); await detail.refetch(); })}><RefreshCw size={16} />{syncing ? "상태 조회 중" : "상태 조회"}</button>}
        {["FAILED","CANCELLED"].includes(selected.status) && <button disabled={busy || syncing} onClick={()=>void act(async()=>{
          if(!window.confirm("이 세금계산서를 인트라넷 목록에서 삭제할까요? 발급 이력은 보존됩니다.")) return;
          await api(base+"/"+selected.id+"?version="+selected.version,{method:"DELETE"});
          setSelected(null); setEditingId(null); router.replace(base); setToast({tone:"success",text:"세금계산서를 삭제했습니다."});
        })}>삭제</button>}
        {selected.status==="ISSUED" && selected.remote_state==="3014" && String(selected.nts_state)==="1" && <button disabled={busy || syncing} onClick={() => void act(async () => {
          if(!window.confirm("바로빌 발급을 취소할까요? 취소되면 목록에서 자동으로 삭제됩니다.")) return;
          const row=await api<Invoice>(base+"/"+selected.id+"/cancel",{method:"POST",body:JSON.stringify({version:selected.version})});
          if (row.status === "CANCELLED") {
            setSelected(null);
            setEditingId(null);
            router.replace(base);
            setToast({tone:"success", text:"바로빌 발급을 취소하고 목록에서 삭제했습니다."});
          } else {
            await detail.refetch();
            setToast({tone:"warning", text:row.error_message || "취소 결과를 확인해주세요."});
          }
        })}>발급취소</button>}
        {selected.status==="ISSUED" && String(selected.nts_state)==="4" && selected.correction_sign!==-1 && <button disabled={busy} onClick={()=>setCorrectId(selected.id)}>수정발급</button>}
        <button onClick={() => window.print()}><Printer size={16} />인쇄 / PDF 저장</button>
      </div>
      {selected.status === "SCHEDULED" && reschedule !== null && <Modal title="예약일 변경" close={() => setReschedule(null)} actions={<button disabled={busy || reschedule < earliestInvoiceScheduleDate()} type="button" onClick={() => void act(async () => {
        await api(base + "/" + selected.id + "/schedule", {method:"PUT", body:JSON.stringify({version:selected.version,date:reschedule})});
        await detail.refetch(); setReschedule(null); setMessage("예약일을 변경했습니다.");
      })}>변경 저장</button>}>
        <label>발급일 <input type="date" min={earliestInvoiceScheduleDate()} value={reschedule} onChange={e => setReschedule(e.target.value)} /></label>
        <p>내일부터 예약할 수 있으며, 선택한 날짜 오전 2시(한국시간)에 자동 발급합니다.</p>{error && <p role="alert">{error}</p>}
      </Modal>}
      {correctId===selected.id && <CorrectionForm key={selected.id} invoice={selected} close={()=>setCorrectId(null)} done={()=>{setCorrectId(null);void detail.refetch();}}/>}
      {selected.original_id && <Link href={base+"/"+selected.original_id}>원본 세금계산서 보기</Link>}
      {!!selected.corrections?.length && <section><h3>수정발급 내역</h3>{Array.from(new Set(selected.corrections.map(r=>r.correction_group))).map(group=>{
        const parts=selected.corrections!.filter(r=>r.correction_group===group);const next=parts.find(p=>p.status!=="ISSUED");
        return <div key={group}><strong>{correctionLabels[parts[0].correction_code]} · {parts.filter(p=>p.status==="ISSUED").length}/{parts.length}장 바로빌 발급 완료</strong>
          {parts.map(p=><p key={p.id}>{p.deleted ? <span>{p.correction_part}번 · {invoiceMoney(p.total_amount)} · {invoiceStatuses[p.status]} (삭제됨)</span> : <Link href={base+"/"+p.id}>{p.correction_part}번 · {invoiceMoney(p.total_amount)} · {invoiceStatuses[p.status]} ↗</Link>}</p>)}
          {next && ["CORRECTION_READY","FAILED"].includes(next.status) && <button disabled={busy} onClick={()=>void act(async()=>{await api(base+"/"+selected.id+"/corrections/"+group+"/resume",{method:"POST"});await detail.refetch();})}>남은 문서 발급</button>}
        </div>;
      })}</section>}
      <p className="invoice-lookup-help">홈택스 로그인 후 ‘전자(세금)계산서 조회 → 발급 목록조회’에서 매출을 선택하고 작성일자로 조회하세요.</p>
      <InvoiceDetail invoice={selected} />
      {active && createPortal(<div className="invoice-print"><InvoiceDetail invoice={selected} /></div>, window.document.body)}
    </> : selected && settings.data ? <InvoiceEditor
      key={typeof selected === "string" ? "new" : `${selected.id}-${selected.version}`}
      invoice={selected === "new" ? null : selected} settings={settings.data} busy={busy} act={act} onDirty={setEditorDirty}
      close={closeEditor} error={error}
      onSaved={row => { if (isDetail) void detail.refetch(); else setSelected(row); setEditingId(null); setEditorDirty(false); setMessage("예약 내용을 수정했습니다."); }}
      onIssueError={text => setToast({ tone: "warning", text })}
      onIssued={row => {

        if (row.status === "ISSUED" || row.status === "SCHEDULED") {
          if (isDetail) router.replace(base);
          setEditingId(null); setSelected(null); setEditorDirty(false);
          setToast({ tone: "success", text: row.status === "SCHEDULED" ? `${row.scheduled_date} 오전 2시로 발급을 예약했습니다.` : "바로빌에서 세금계산서를 발급했습니다." });
        } else {
          setSelected(null); setEditorDirty(false); setEditingId(null);
          if (isDetail) void detail.refetch(); else router.push(base + "/" + row.id);
          setToast({ tone: row.status === "FAILED" ? "failure" : "warning", text: [invoiceStatuses[row.status], invoiceStatusDetail(row)].filter(Boolean).join(" · ") });
        }
      }}
    /> : !selected && !isDetail && <>
      <form className="accounting-filter-bar accounting-filter-spaced cash-plan-filter-card" onSubmit={e => e.preventDefault()}>
        <label>검색 조건<select aria-label="검색 조건" value={condition} onChange={e => { setCondition(e.target.value); setPage(1); }}><option value="corpName">상호</option><option value="corpNum">사업자번호</option><option value="mgtNum">관리번호</option></select></label>
        <label>검색어<div className="tax-search-input"><Search size={16} /><input aria-label="검색어" placeholder="검색어" value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1); }} maxLength={200} /></div></label>
        <label>작성일 시작<input aria-label="작성일 시작" type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} /></label>
        <label>작성일 종료<input aria-label="작성일 종료" type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} /></label>
        <span className="tax-toolbar-spacer" />
        <button type="button" className="tax-green" disabled={!settings.data || busy} onClick={create}><Plus size={16} />세금계산서 발행</button>
      </form>
      {!validDates && <p className="error" role="alert">조회 기간을 200일 이내로 선택해주세요.</p>}{list.isError && <p className="error" role="alert">{list.error.message}</p>}{list.isLoading && validDates && <AccountingLoader label="세금계산서를 불러오는 중" />}
      {list.data && validDates && <><div className="tax-list"><div className="tax-list-scroll"><table><thead><tr><th scope="col">번호</th><th>공급받는자</th><th>합계금액</th>
        <th><TableColumnFilter label="상태" value={status} options={[...Object.entries(invoiceStatuses).filter(([id]) => id !== "CANCELLED"), ["TRANSMITTED","국세청 전송 완료"]].map(([value,label]) => ({value,label}))} onChange={value => { setStatus(value); setPage(1); }} /></th>
        <th><TableColumnFilter label="작성일자" dates options={[]} value={{...emptyColumnFilter, from: from === monthStart ? "" : from, to: to === today ? "" : to, sort}} onChange={value => { setFrom(value.from || monthStart); setTo(value.to || today); setSort(value.sort); setPage(1); }} /></th>
        <th>상세</th></tr></thead><tbody>{list.data.rows.map((row, index) => <tr key={row.id} onDoubleClick={event => { if (!(event.target as Element).closest("a")) { setEditingId(null); router.push(base + "/" + row.id); } }}><td className="invoice-sequence">{sort === "asc" ? (page - 1) * 30 + index + 1 : list.data!.total - (page - 1) * 30 - index}</td><td>{row.customer_name}{row.customer_address && <small>{recipientRegion(row.customer_address)}</small>}<small>{formatBusinessNo(row.customer_business_no ?? "")}</small></td><td className="number">{invoiceMoney(row.total_amount)}</td><td className="tax-status-cell"><span className={`tax-badge ${row.status.toLowerCase()}`}>{row.original_id?"수정 · ":""}{invoiceDisplayStatus(row)}</span>{row.status === "SCHEDULED" && <small>{row.scheduled_date} 오전 2시</small>}{invoiceStatusDetail(row) && <small>{invoiceStatusDetail(row)}</small>}{row.environment === "test" && <small>테스트</small>}</td><td>{row.created_minute}{row.nts_expected && <small title="바로빌 익영업일 자동전송 설정 기준">국세청 전송 예정 {row.nts_expected}</small>}</td><td><Link href={base + "/" + row.id} onClick={() => setEditingId(null)}>상세보기</Link></td></tr>)}</tbody></table></div>
        {!list.data.total && <div className="tax-empty"><FileText size={24} /><strong>발행된 세금계산서가 없습니다</strong><p>‘세금계산서 발행’으로 작성을 시작하세요.</p></div>}
        <div className="tax-pagination"><span>총 {list.data.total.toLocaleString()}건</span><div><button disabled={page <= 1 || busy} onClick={() => setPage(p => p - 1)}>이전</button><span>{page} / {Math.max(1, Math.ceil(list.data.total / 30))}</span><button disabled={page * 30 >= list.data.total || busy} onClick={() => setPage(p => p + 1)}>다음</button></div></div>
      </div></>}
    </>}
  </div>;
}

function CustomerBook({ close, onSelect, initialSearch = "" }: { close: () => void; onSelect?: (party: Party) => void; initialSearch?: string }) {
  const [keyword, setKeyword] = useState(initialSearch);
  const query = useDebouncedValue(keyword.trim());
  const [draft, setDraft] = useState<Party | null>(null);
  const [version, setVersion] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const scrollBox = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const rows = useInfiniteQuery({
    queryKey: ["api", base + "/customers/scroll", query],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => request<CustomerPage>(base + "/customers?" + new URLSearchParams({ keyword: query, page: String(pageParam) }), { signal }),
    getNextPageParam: last => last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });
  const { hasNextPage, isFetching, isFetchNextPageError, fetchNextPage } = rows;
  useEffect(() => { scrollBox.current?.scrollTo(0, 0); }, [query]);
  useEffect(() => {
    if (!end.current || !hasNextPage || isFetching || isFetchNextPageError) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void fetchNextPage({ cancelRefetch: false });
    }, { root: scrollBox.current, rootMargin: "0px 0px 100px" });
    observer.observe(end.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetching, isFetchNextPageError, fetchNextPage, query]);
  async function save() {
    if (!draft || busy) return;
    if (!/^[0-9]{10}$/.test(draft.corpNum)) {
      setError("사업자번호를 숫자 10자리로 입력해주세요.");
      return;
    }
    setBusy(true); setError("");
    try { await api(`${base}/customers`, { method: "POST", body: JSON.stringify({ party: draft, version }) }); await rows.refetch(); setDraft(null); setMessage("거래처를 저장했습니다."); }
    catch(e) { setError(e instanceof Error ? e.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <><Modal title="거래처 · 자주 사용하는 수신자" close={close} actions={<button type="button" onClick={close}>닫기</button>}>
    <div className="tax-customer-search" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); } }}><input data-initial-focus aria-label="사업자번호 또는 거래처명" placeholder="사업자번호 또는 거래처명" value={keyword} onChange={e => setKeyword(e.target.value)} maxLength={200} /><button type="button" onClick={() => { setDraft(emptyParty()); setVersion(undefined); setError(""); }}>수신자 등록</button></div>
    <p>등록한 거래처와 이전 세금계산서의 최근 수신자 정보를 검색합니다. 사업자번호는 하이픈 없이도 검색할 수 있습니다.</p>
    {!draft && error && <p className="error" role="alert">{error}</p>}{rows.isError && <p role="alert">{rows.error.message}</p>}{message && <p role="status">{message}</p>}
    {rows.isLoading && <AccountingLoader label="거래처를 불러오는 중" />}
    <div ref={scrollBox} className="tax-picker-table tax-recipient-scroll"><table><thead><tr><th>구분</th><th>상호 / 사업자번호</th><th>수신자 / 이메일</th><th>관리</th></tr></thead><tbody>{rows.data?.pages.flatMap(page => page.rows).map(customer => {
      const c = customer.source === "history" && customer.party && !customer.party.contactName ? { ...customer, party: { ...customer.party, contactName: "담당자" } } : customer;
      return <tr key={c.id}><td>{c.source === "saved" ? "등록 거래처" : c.source === "directory" ? "기존 거래처" : "이전 발행 정보"}</td><td>{c.name}{c.party?.addr && <small>{recipientRegion(c.party.addr)}</small>}<small>{formatBusinessNo(c.business_no ?? "")}</small></td><td>{c.party?.contactName}<small>{c.party?.email}</small></td><td><div className="tax-actions">{onSelect && c.party && <button type="button" onClick={() => onSelect(c.party!)}>불러오기</button>}<button type="button" onClick={() => { setDraft(c.party ?? emptyParty()); setVersion(c.source === "saved" ? c.version : undefined); setError(""); }}>{c.source === "saved" ? "수정" : "수신자로 등록"}</button></div></td></tr>; })}</tbody></table>
      <div ref={end} aria-hidden="true" />
      {rows.isFetchingNextPage && <AccountingLoader label="거래처를 더 불러오는 중" />}
      {rows.isFetchNextPageError && <button type="button" onClick={() => void rows.fetchNextPage()}>다시 불러오기</button>}
    </div>
    {!rows.isFetching && rows.data?.pages[0]?.total === 0 && <p>일치하는 거래처가 없습니다. 수신자를 등록하거나 발행 화면에서 직접 입력해주세요.</p>}
  </Modal>
    {draft && <Modal title={version === undefined ? "수신자 등록" : "수신자 수정"} close={() => { if (!busy) setDraft(null); }} actions={<>
      <button type="button" disabled={busy} onClick={() => setDraft(null)}>취소</button>
      <button type="button" className="tax-primary" disabled={busy} onClick={() => void save()}>거래처 저장</button>
    </>}>
      {error && <p className="error" role="alert">{error}</p>}
      <fieldset disabled={busy}><PartyCard title="공급받는자" tone="customer" value={draft} onChange={value => { setDraft(value); if (value.corpNum !== draft.corpNum || value.taxRegId !== draft.taxRegId) setVersion(undefined); }} /></fieldset>
    </Modal>}
  </>;
}

function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return <header className="tax-section-head"><h3>{title}</h3>{action}</header>;
}
function RequiredMark() {
  return <span className="tax-required" aria-hidden="true"> *</span>;
}
function IssueTimingHelp() {
  return <details className="tax-transmission-help">
    <summary><span aria-hidden="true">?</span> 발급·국세청 전송 시점</summary>
    <p><strong>즉시 발급</strong>은 마지막 단계에서 ‘확인 후 발급’을 누르면 바로빌에 발급을 요청합니다.</p>
    <p><strong>예약 발급</strong>은 선택한 날짜 오전 2시(한국시간)에 바로빌에 발급을 요청합니다.</p>
    <p><strong>국세청 전송</strong>은 바로빌 기본 설정 기준으로 실제 발급일의 다음 영업일 오후 2시부터 순차적으로 진행됩니다.</p>
  </details>;
}

function PurposeHelp() {
  const id = useId();
  const [open, setOpen] = useState(false);
  return <span className={`tax-help${open ? " is-open" : ""}`} onMouseLeave={() => setOpen(false)}>
    <button type="button" aria-label="청구와 영수 선택 안내" aria-describedby={id} aria-expanded={open} onClick={() => setOpen(true)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={e => { if (e.key === "Escape") { setOpen(false); e.stopPropagation(); } }}><CircleHelp size={15} /></button>
    <span id={id} role="tooltip" className="tax-help-tooltip"><strong>어떤 것을 선택하나요?</strong><span><b>청구</b> · 아직 대금을 받지 않았을 때</span><span><b>영수</b> · 이미 대금을 받았을 때</span><span>계산서 발행 후 입금받는 거래라면 ‘청구’를 선택하세요.</span></span>
  </span>;
}
function RadioField({ label, value, options, onChange, help }: { label: string; value: number; options: { value: number; label: string; disabled?: boolean }[]; onChange?: (value: number) => void; help?: ReactNode }) {
  return <div className="tax-labeled"><span className="tax-option-label">{label}{onChange && <RequiredMark />}{help}</span><div className="tax-radio-options" role="radiogroup" aria-label={label} aria-required={!!onChange}>{options.map(option => <label key={option.value} title={option.disabled ? "현재 지원하지 않는 발행 방식입니다." : undefined}><input type="radio" name={label} value={option.value} checked={value === option.value} disabled={option.disabled} onChange={() => onChange?.(option.value)} />{option.label}</label>)}</div></div>;
}
const requiredPartyFields = new Set<keyof Party>(["corpNum", "corpName", "ceoName", "addr", "bizType", "bizClass", "contactName", "email"]);
const partyRows: { key: keyof Party; label: string; placeholder?: string; type?: string }[][] = [
  [{ key: "corpNum", label: "사업자번호", placeholder: "숫자 10자리" }, { key: "taxRegId", label: "종사업장", placeholder: "예) 0001" }],
  [{ key: "corpName", label: "상호", placeholder: "법인명" }, { key: "ceoName", label: "대표자" }],
  [{ key: "addr", label: "주소" }],
  [{ key: "bizType", label: "업태" }, { key: "bizClass", label: "종목" }],
  [{ key: "contactName", label: "담당자" }, { key: "email", label: "이메일", type: "email" }],
  [{ key: "tel", label: "연락처", placeholder: "02-1234-1234", type: "tel" }, { key: "hp", label: "휴대폰", placeholder: "010-0000-0000", type: "tel" }],
];
function formatBusinessNo(value: string) {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 10);
  return [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5)].filter(Boolean).join("-");
}

function PartyCard({ value, onChange, title, tone, locked = false }: { value: Party; onChange?: (value: Party) => void; title: string; tone: string; locked?: boolean }) {
  const fieldId = useId();
  return <section className={`tax-party ${tone}`} aria-label={title}>
    <div className="tax-party-vertical" aria-hidden="true">{[...title].map((character, i) => <span key={i}>{character}</span>)}</div>
    <div className="tax-party-body">{partyRows.map((row, ri) => <div className="tax-party-row" key={ri}>{row.map(field => <Fragment key={field.key}><label className="tax-party-label" htmlFor={`${fieldId}-${field.key}`}>{field.label}{requiredPartyFields.has(field.key) && <RequiredMark />}</label><div className="tax-party-value"><input aria-required={requiredPartyFields.has(field.key)} id={`${fieldId}-${field.key}`} aria-label={`${title} ${field.label}`} readOnly={locked} type={field.type || "text"} inputMode={field.key === "corpNum" ? "numeric" : undefined} maxLength={field.key === "corpNum" ? undefined : 200}
      value={field.key === "corpNum" ? formatBusinessNo(value.corpNum) : value[field.key] || ""}
      onKeyDown={e => { if (field.key === "corpNum" && e.key === "-") e.preventDefault(); }}
      onChange={e => onChange?.({ ...value, [field.key]: field.key === "corpNum" ? e.target.value.replace(/[^0-9]/g, "").slice(0, 10) : e.target.value })} placeholder={locked ? undefined : field.placeholder} /></div></Fragment>)}</div>)}</div>
  </section>;
}
function Modal({ title, close, children, actions }: {
  title: string; close: () => void; children: ReactNode; actions?: ReactNode;
}) {
  const backdropPressed = useRef(false);
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (ref.current?.querySelector<HTMLElement>("[data-initial-focus]") ?? ref.current)?.focus();
    const listener = (event: KeyboardEvent) => {
      if (!ref.current?.contains(document.activeElement)) return;
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]');
        if (!nodes?.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", listener);
    return () => { document.removeEventListener("keydown", listener); previouslyFocused?.focus(); };
  }, []);
  return <div className="tax-modal-backdrop"
    onPointerDown={event => { backdropPressed.current = event.target === event.currentTarget; }}
    onClick={event => {
      if (backdropPressed.current && event.target === event.currentTarget) close();
      backdropPressed.current = false;
    }}><section ref={ref} tabIndex={-1} className="tax-modal" onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault(); }} role="dialog" aria-modal="true" aria-label={title}><header><h3>{title}</h3><button type="button" className="modal-close-button" onClick={close} aria-label="닫기"><X aria-hidden /></button></header><div className="tax-modal-body">{children}</div>{actions && <footer className="tax-actions">{actions}</footer>}</section></div>;
}
const correctionLabels = ["","기재사항 착오정정","공급가액 변동","재화의 환입","계약의 해제","내국신용장 등 사후개설","착오에 의한 이중발급"];
type PreviewPart = { document: InvoiceDocument; supply: number; tax: number };

function CorrectionForm({invoice, close, done}: {invoice: Invoice; close: () => void; done: () => void}) {
  const [code,setCode] = useState(1);
  const [date,setDate] = useState(koreaToday);
  const [decrease,setDecrease] = useState(false);
  const [gross,setGross] = useState("");
  const [quantities,setQuantities] = useState(invoice.document.items.map(() => "0"));
  const [replacement,setReplacement] = useState(invoice.document);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [preview,setPreview] = useState<PreviewPart[] | null>(null);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const currentTotal = (invoice.corrections ?? []).reduce(
    (total, correction) => correction.status === "ISSUED" ? total + BigInt(correction.total_amount) : total,
    BigInt(invoice.total_amount)
  );
  const difference = BigInt(gross || "0");
  const adjustedTotal = decrease ? currentTotal - difference : currentTotal + difference;
  const adjustmentSummary = <div className="invoice-adjustment-summary" role="status">
    <span>변경 전 합계 {invoiceMoney(currentTotal)} {decrease ? "−" : "+"} 변동 차액 {invoiceMoney(difference)}</span>
    <strong>변경 후 합계 (부가세 포함) {invoiceMoney(adjustedTotal)}</strong>
    {adjustedTotal < BigInt(0) && <span className="error">감액 금액이 변경 전 합계를 초과합니다.</span>}
  </div>;
  async function submit() {
    setBusy(true); setError("");
    try {
      const body=JSON.stringify({version:invoice.version,code,date,decrease,gross:code===2?gross:null,quantities,replacement:code===1?replacement:null,requestKey});
      const url=base+"/"+invoice.id+"/corrections";
      if(preview) { await api(url,{method:"POST",body}); done(); }
      else setPreview(await api<PreviewPart[]>(url+"/preview",{method:"POST",body}));
    } catch(e) { setError(e instanceof Error?e.message:"수정발급 결과를 확인해주세요."); }
    finally { setBusy(false); }
  }
  return <Modal title="수정세금계산서 발급" close={() => {if(!busy) close();}} actions={<>
    {preview && <button disabled={busy} onClick={() => setPreview(null)}>내용 수정</button>}
    <button className="tax-primary" disabled={busy || code===0 || (code===2 && (difference===BigInt(0) || adjustedTotal<BigInt(0)))} onClick={() => void submit()}>{busy?"처리 중…":preview?`수정세금계산서 ${preview.length}장 발급`:"발급 내용 확인"}</button></>}>
    <p>{invoice.customer_name} · 원본 승인번호 {invoice.nts_key} · {invoiceMoney(invoice.total_amount)}</p>
    {preview ? <><h4>{correctionLabels[code]}</h4>{code===2 && adjustmentSummary}{preview.map((p,i)=><p key={i}>{i+1}번 · {p.document.writeDate} · {p.document.customer.corpName} · 공급가액 {invoiceMoney(p.supply)} · 세액 {invoiceMoney(p.tax)} · 합계 {invoiceMoney(BigInt(p.supply)+BigInt(p.tax))}</p>)}</> :
    <fieldset disabled={busy} className="invoice-correction-form"><label>수정 사유<select data-initial-focus value={[3,5,6].includes(code)?0:code} onChange={e=>{setCode(Number(e.target.value)); setError("");}}>
      <option value={1}>처음 발급한 내용을 잘못 입력했어요 (기재사항 착오정정)</option>
      <option value={2}>발급 후 거래 금액이 바뀌었어요 (공급가액 변동)</option>
      <option value={4}>계약이 해제됐어요 (계약의 해제)</option>
      <option value={0}>기타 사유</option>
      </select></label>
    {[0,3,5,6].includes(code) && <label>기타 수정 사유<select value={code} onChange={e=>{setCode(Number(e.target.value)); setError("");}}>
      <option value={0} disabled>사유를 선택하세요</option>
      {[3,5,6].map(reason=><option key={reason} value={reason}>{correctionLabels[reason]}</option>)}
    </select></label>}
    {code===4 && <p>원본 금액 전액을 음수로 발급합니다. 실제 계약이 해제된 날짜를 입력하세요.</p>}
    {code>=2 && code<=5 && <label>{["","","변동일","반품일","계약 해제일","개설·발급일"][code]}<input type="date" min={invoice.document.writeDate} max={koreaToday()} value={date} onChange={e=>setDate(e.target.value)}/></label>}
    {code>=2 && code<=4 && /^\d{4}-\d{2}-\d{2}$/.test(date) && <p>발급기한 {new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7)),10)).toISOString().slice(0,10)}</p>}
    {code===2 && <><label>증감 구분<select value={decrease?"minus":"plus"} onChange={e=>setDecrease(e.target.value==="minus")}><option value="plus">증액</option><option value="minus">감액</option></select></label><label>변동 차액 (부가세 포함)<input inputMode="numeric" value={gross && Number(gross).toLocaleString("ko-KR")} onChange={e=>setGross(e.target.value.replace(/[^0-9]/g,"").slice(0,14))}/></label>{adjustmentSummary}<div>
      <strong>변동 차액 입력 방법</strong>
      <ol>
        <li>거래 금액이 실제로 변경된 날짜를 변동일에 입력하세요.</li>
        <li>변경 전후의 부가세 포함 합계를 비교해 증액 또는 감액을 선택하세요.</li>
        <li>전체 수량에 대해 달라진 금액만 원 단위로 입력하세요. 감액도 양수로 입력하면 자동으로 음수가 적용됩니다.</li>
      </ol>
      <p>증액 예시 · 합계가 110,000원에서 132,000원이 되면 ‘증액’을 선택하고 22,000원을 입력합니다.</p>
      <p>감액 예시 · 합계가 110,000원에서 88,000원이 되면 ‘감액’을 선택하고 22,000원을 입력합니다.</p>
      <p>‘발급 내용 확인’을 누르면 차액의 공급가액과 세액을 확인할 수 있습니다. 10% 과세 거래에서 위 감액 예시는 공급가액 −20,000원, 세액 −2,000원으로 표시됩니다.</p>
    </div></>}
    {(code===3 || code===5) && invoice.document.items.map((item,i)=><label key={i}>{item.name} · 대상 수량 (원본 {item.quantity})<input type="number" min="0" step="any" max={item.quantity} value={quantities[i]} onChange={e=>setQuantities(quantities.map((v,j)=>i===j?e.target.value:v))}/></label>)}
    {code===6 && <p>중복 발급된 이 원본을 음수 1장으로 상쇄합니다.</p>}
    {code===1 && <>
      <PartyCard title="공급받는자" tone="customer" value={replacement.customer} onChange={customer=>setReplacement({...replacement,customer})}/>
      <label>비고<input value={replacement.remark||""} onChange={e=>setReplacement({...replacement,remark:e.target.value})}/></label>
      <label>과세 유형<select value={replacement.taxType} onChange={e=>setReplacement({...replacement,taxType:Number(e.target.value)})}>{(invoice.document.taxType===3?[3]:[1,2]).map(t=><option key={t} value={t}>{["","과세","영세율","면세"][t]}</option>)}</select></label>
      {replacement.items.map((item,i)=><div className="invoice-correction-item" key={i}>
        {(["date","name","specification","quantity",item.grossUnitPrice!=null?"grossUnitPrice":"unitPrice","note"] as const).map(k=><label key={k}>{{date:"공급일자",name:"품목",specification:"규격",quantity:"수량",grossUnitPrice:"세금 포함 단가",unitPrice:"단가",note:"비고"}[k]}<input type={k==="date"?"date":"text"} value={item[k]??""} onChange={e=>setReplacement({...replacement,items:replacement.items.map((v,j)=>i===j?{...v,[k]:e.target.value}:v)})}/></label>)}
        {replacement.items.length>1 && <button onClick={()=>setReplacement({...replacement,items:replacement.items.filter((_,j)=>i!==j)})}>품목 삭제</button>}
      </div>)}<button onClick={()=>setReplacement({...replacement,items:[...replacement.items,emptyItem(replacement.writeDate)]})}>품목 추가</button>
    </>}</fieldset>}
    {error && <p role="alert" className="error">{error}</p>}
  </Modal>;
}

function IssuerSettings({ settings, busy, error, close, act, saved }: { settings: InvoiceSettings; busy: boolean; error: string; close: () => void; act: Action; saved: () => void }) {
  const [issuer, setIssuer] = useState(settings.issuer);
  return <Modal title="공급자 기본정보" close={() => { if (!busy) close(); }} actions={<><button className="accounting-cancel" disabled={busy} onClick={close}>취소</button><button disabled={busy || !settings.issueReady} onClick={() => void act(async () => { await api(`${base}/settings/import`, { method: "POST", body: JSON.stringify({ version: settings.version }) }); saved(); })}><RefreshCw size={16} />바로빌 정보 가져오기</button><button disabled={busy} className="tax-primary" onClick={() => void act(async () => { await api(`${base}/settings`, { method: "PUT", body: JSON.stringify({ issuer, version: settings.version }) }); saved(); })}>저장</button></>}>
    {error && <p className="error" role="alert">{error}</p>}<p>펜타웍스 공급자 정보는 작성 시 자동으로 입력됩니다.</p><fieldset disabled={busy}><PartyCard value={issuer} onChange={setIssuer} title="공급자" tone="supplier" /></fieldset>
  </Modal>;
}

function InvoiceEditor({ invoice, settings, busy, act, onSaved, onIssued, onIssueError, onDirty, close, error }: {
  invoice: Invoice | null; settings: InvoiceSettings; busy: boolean; act: Action; onSaved: (row: Invoice) => void;
  onIssued: (row: Invoice) => void; onIssueError: (text: string) => void;
  onDirty: (dirty: boolean) => void; close: () => void; error: string;
}) {
  const [document, setDocument] = useState<InvoiceDocument>(() => invoice?.document || newDocument());
  const [requestKey] = useState(() => crypto.randomUUID());
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [review, setReview] = useState(false);
  const [issuer, setIssuer] = useState<Party>(() => invoice?.issuer || settings.issuer);
  const [issuerDraft, setIssuerDraft] = useState<Party>(issuer);
  const [issuerEditing, setIssuerEditing] = useState(false);
  const [picker, setPicker] = useState(false);
  const [productPicker, setProductPicker] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const debouncedProductSearch=useDebouncedValue(productSearch);
  const [pickedProducts, setPickedProducts] = useState<number[]>([]);
  const [dirty, setDirty] = useState(!invoice);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    onDirty(dirty || issuerEditing);
    if (!dirty && !issuerEditing) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, issuerEditing, onDirty]);
  const editable = !invoice || ["DRAFT","SCHEDULED"].includes(invoice.status);
  const amounts = useMemo(() => document.items.map(item => lineAmounts(item, document.taxType)), [document.items, document.taxType]);
  const totals = useMemo(() => {
    const supply = amounts.reduce((sum, row) => sum + row.supply, BigInt(0));
    const tax = amounts.reduce((sum, row) => sum + row.tax, BigInt(0));
    return { supply, tax, total: supply + tax };
  }, [amounts]);
  const products = useApiQuery<InvoiceItem[]>(`${base}/products?keyword=${encodeURIComponent(debouncedProductSearch)}`, productPicker);
  const monthStart = `${document.writeDate.slice(0, 7)}-01`;
  const monthEnd = document.writeDate ? `${document.writeDate.slice(0, 7)}-${String(new Date(Number(document.writeDate.slice(0, 4)), Number(document.writeDate.slice(5, 7)), 0).getDate()).padStart(2, "0")}` : "";
  const update = (next: InvoiceDocument) => { setDocument(next); setDirty(true); setReview(false); };
  const setItem = (i: number, key: keyof InvoiceItem, value: string) => update({ ...document, items: document.items.map((item, j) => j === i ? { ...item, [key]: value } : item) });
  function changeWriteDate(writeDate: string) {
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(writeDate);
    if (!match) { update({ ...document, writeDate }); return; }
    const month = writeDate.slice(0, 7);
    const lastDay = new Date(Number(match[1]), Number(match[2]), 0).getDate();
    update({ ...document, writeDate, items: document.items.map(item => item.date && item.date.slice(0, 7) !== month
      ? { ...item, date: `${month}-${String(Math.min(Number(item.date.slice(8, 10)), lastDay)).padStart(2, "0")}` } : item) });
  }
  const pendingInvoice = useRef(invoice);
  async function persist() {
    const current = pendingInvoice.current;
    const saved = await api<Invoice>(current ? `${base}/${current.id}` : base, { method: current ? "PUT" : "POST", body: JSON.stringify({ requestKey, version: current?.version || 0, document, issuer }) });
    pendingInvoice.current = saved;
    return saved;
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || issuerEditing || !editable || !formRef.current?.reportValidity()) return;
    if (invoice?.status === "SCHEDULED") void act(async () => onSaved(await persist()));
    else if (settings.issueReady) setReview(true);
  }
  function addProducts() {
    const rows = pickedProducts.map(i => products.data?.[i]).filter((row): row is InvoiceItem => !!row).map(row => ({ ...row, date: document.writeDate, quantity: "1", grossUnitPrice: grossPriceText(row, document.taxType), unitPrice: "", note: "" }));
    const items = [...document.items];
    if (rows.length && items.length === 1 && !items[0].name && !items[0].unitPrice && !items[0].grossUnitPrice) items.splice(0, 1);
    update({ ...document, items: [...items, ...rows].slice(0, 99) }); setProductPicker(false); setPickedProducts([]);
  }
  return <form ref={formRef} onSubmit={submit} className="tax-editor">
    <fieldset className="tax-sheet" disabled={busy || !editable}>
      <section className="tax-section">
        <SectionHead title="발행 옵션" action={<span className="tax-required-note"><RequiredMark /> 발급 시 필수 항목</span>} />
        <IssueTimingHelp />
        <div className="tax-option-top">
          <label>작성일자 <span className="tax-required">*</span><input type="date" aria-label="작성일자" required max={koreaToday()} value={document.writeDate} onChange={e => changeWriteDate(e.target.value)} /></label>
          <div className="tax-labeled"><span>거래처 <span className="tax-required">*</span></span><button className="tax-client-trigger" type="button" onClick={() => setPicker(true)}><span className={document.customer.corpName ? "" : "placeholder"}>{document.customer.corpName || "사업자번호로 거래처 검색"}</span><Search size={16} /></button></div>
        </div>
        <div className="tax-option-radios">
          <RadioField label="발급 유형" value={1} options={[{ value: 1, label: "바로빌 즉시 발급" }, { value: 2, label: "바로빌 전송", disabled: true }]} />
          <RadioField label="청구 / 영수" help={<PurposeHelp />} value={document.purposeType} options={[{ value: 2, label: "청구" }, { value: 1, label: "영수" }]} onChange={purposeType => update({ ...document, purposeType })} />
          <RadioField label="과세 유형" value={document.taxType} options={[{ value: 1, label: "과세" }, { value: 2, label: "영세" }, { value: 3, label: "면세" }]} onChange={taxType => update({ ...document, taxType })} />
          <RadioField label="계산서 유형" value={1} options={[{ value: 1, label: "일반" }, { value: 2, label: "수정", disabled: true }]} />
          <RadioField label="발행 방향" value={1} options={[{ value: 1, label: "정발행" }, { value: 2, label: "역발행", disabled: true }]} />
        </div>
        <label className="tax-memo">메모<textarea value={document.remark} maxLength={150} rows={2} onChange={e => update({ ...document, remark: e.target.value })} placeholder="상단 비고 (선택)" /></label>
      </section>
      <section className="tax-section"><SectionHead title="공급자 / 공급받는자" action={editable && <div className="tax-actions tax-issuer-actions"><span>공급자</span>{issuerEditing ? <><button className="accounting-cancel" type="button" onClick={() => setIssuerEditing(false)}>취소</button><button type="button" onClick={() => { setIssuer(issuerDraft); setIssuerEditing(false); setDirty(true); setReview(false); }}><Check size={14} />적용</button></> : <button type="button" aria-label="공급자 수정" onClick={() => { setIssuerDraft({ ...issuer }); setIssuerEditing(true); setReview(false); }}><Pencil size={14} />수정</button>}</div>} />{issuerEditing && <p className="tax-issuer-edit-note">수정한 공급자 정보는 이 세금계산서에만 적용됩니다. 수정 후 ‘적용’을 눌러주세요.</p>}<div className="tax-parties"><PartyCard title="공급자" tone="supplier" value={issuerEditing ? issuerDraft : issuer} onChange={setIssuerDraft} locked={!editable || !issuerEditing} /><PartyCard title="공급받는자" tone="customer" value={document.customer} onChange={customer => update({ ...document, customer })} locked={!editable} /></div></section>
      <section className="tax-section tax-items">
        <SectionHead title="품목" action={editable && <div className="tax-actions"><button type="button" onClick={() => { setProductPicker(true); setPickedProducts([]); }}><Search size={16} />제품 선택</button><button type="button" disabled={document.items.length >= 99} onClick={() => update({ ...document, items: [...document.items, emptyItem(document.writeDate)] })}><Plus size={16} />품목 추가</button></div>} />
        <p className="tax-item-note">※ 공급일자는 작성일자와 동일한 월({document.writeDate.slice(0, 7)})의 날짜만 선택할 수 있습니다.</p>
        <div className="tax-items-scroll"><table><thead><tr>{["순번", "공급일자", "품목명", "규격", "수량", "세금 포함 단가", "공급가액", "세액", "비고", ""].map((h, i) => <th key={i}>{h}{["공급일자", "품목명", "수량", "세금 포함 단가"].includes(h) && <RequiredMark />}</th>)}</tr></thead><tbody>{document.items.map((item, i) => {
          const amount = amounts[i];
          return <tr key={i}><td className="tax-line-number">{i + 1}</td><td><input aria-label={`${i + 1}번 공급일자`} type="date" required min={monthStart} max={monthEnd} value={item.date} onChange={e => setItem(i, "date", e.target.value)} /></td><td><input aria-label={`${i + 1}번 품목명`} required maxLength={100} value={item.name} onChange={e => setItem(i, "name", e.target.value)} placeholder="품목명" /></td><td><input aria-label={`${i + 1}번 규격`} maxLength={100} value={item.specification} onChange={e => setItem(i, "specification", e.target.value)} placeholder="EA" /></td><td><input aria-label={`${i + 1}번 수량`} type="number" min={Number(item.quantity) % 1 || 1} step="1" onKeyDown={e => { if (["-", "+", "e", "E"].includes(e.key)) e.preventDefault(); }} required value={item.quantity} onChange={e => { if (/^\d*(?:\.\d{0,4})?$/.test(e.target.value)) setItem(i, "quantity", e.target.value); }} /></td><td><input aria-label={`${i + 1}번 세금 포함 단가`} type="text" inputMode="numeric" required value={grossPriceText(item, document.taxType).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} onKeyDown={e => { if (e.key === ",") e.preventDefault(); }} onPaste={e => { if (!/^\d+$/.test(e.clipboardData.getData("text"))) e.preventDefault(); }} onChange={e => {
            const digits = e.target.value.replaceAll(",", "");
            if (/^\d{0,14}$/.test(digits)) setItem(i, "grossUnitPrice", digits);
          }} placeholder="0" /></td><td className="number">{invoiceMoney(amount.supply)}</td><td className="number">{invoiceMoney(amount.tax)}</td><td><input aria-label={`${i + 1}번 비고`} maxLength={100} value={item.note} onChange={e => setItem(i, "note", e.target.value)} placeholder="비고" /></td><td>{editable && document.items.length > 1 && <button className="tax-remove" type="button" aria-label={`${i + 1}번 품목 삭제`} onClick={() => update({ ...document, items: document.items.filter((_, j) => j !== i) })}><Trash2 size={16} /></button>}</td></tr>;
        })}</tbody><tfoot><tr><td colSpan={6} className="number">합계</td><td className="number">{invoiceMoney(totals.supply)}</td><td className="number">{invoiceMoney(totals.tax)}</td><td colSpan={2} className="number tax-total">총액 {invoiceMoney(totals.total)}</td></tr></tfoot></table></div>
      </section>
    </fieldset>
    <footer className="tax-editor-footer"><button className="accounting-cancel" type="button" onClick={close} disabled={busy}>취소</button><button type="submit" className="tax-primary" disabled={busy || issuerEditing || (invoice?.status !== "SCHEDULED" && !settings.issueReady)}>{invoice?.status === "SCHEDULED" ? "예약 내용 저장" : "발행 / 예약"}</button></footer>
    {picker && <CustomerBook close={() => setPicker(false)} initialSearch={document.customer.corpNum} onSelect={customer => { update({ ...document, customer }); setPicker(false); }} />}
    {productPicker && <Modal title="제품 선택" close={() => setProductPicker(false)} actions={<><span className="tax-modal-picked">{pickedProducts.length}개 선택</span><button className="accounting-cancel" type="button" onClick={() => setProductPicker(false)}>취소</button><button type="button" className="tax-primary" disabled={!pickedProducts.length} onClick={addProducts}>선택</button></>}>
      <div className="tax-picker-search"><Search size={16} /><input aria-label="제품 검색" placeholder="품목명 검색" value={productSearch} onChange={e => { setProductSearch(e.target.value); setPickedProducts([]); }} /></div><p className="tax-picker-hint">이전에 작성한 세금계산서의 품목을 선택할 수 있습니다.</p>
      {products.isError && <p className="error" role="alert">{products.error.message}</p>}<div className="tax-picker-table"><table><thead><tr><th>선택</th><th>품목명</th><th>규격</th><th>세금 포함 단가</th></tr></thead><tbody>{products.data?.map((item, i) => <tr key={i}><td><input type="checkbox" aria-label={`${item.name} 선택`} checked={pickedProducts.includes(i)} onChange={e => setPickedProducts(e.target.checked ? [...pickedProducts, i] : pickedProducts.filter(index => index !== i))} /></td><td>{item.name}</td><td>{item.specification}</td><td className="number">{Number(grossPriceText(item, document.taxType)).toLocaleString("ko-KR")}원</td></tr>)}</tbody></table>{products.isLoading && <AccountingLoader label="품목을 불러오는 중" />}{products.data?.length === 0 && <p>저장된 품목이 없습니다. 품목 표에 직접 입력해주세요.</p>}</div>
    </Modal>}
    {review && <Modal title="발급 전 확인" close={() => { if (!busy) setReview(false); }} actions={<><button className="accounting-cancel" type="button" disabled={busy} onClick={() => setReview(false)}>취소</button><button type="button" className="tax-primary" disabled={busy || (scheduleMode && scheduleDate < earliestInvoiceScheduleDate())} onClick={() => void act(async () => { try { const row = invoice && !dirty ? invoice : await persist(); onIssued(await api<Invoice>(`${base}/${row.id}/${scheduleMode ? "schedule" : "issue"}`, { method: scheduleMode ? "PUT" : "POST", body: JSON.stringify({ version: row.version, date: scheduleMode ? scheduleDate : undefined }) })); } catch (cause) { onIssueError(cause instanceof Error ? cause.message : "발급 결과를 확인해주세요."); throw cause; } setReview(false); })}><Check size={16} />{scheduleMode ? "예약 확정" : settings.environment === "test" ? "테스트 발급" : "확인 후 발급"}</button></>}>
      <label>발급 방식 <select value={scheduleMode ? "scheduled" : "now"} onChange={e => setScheduleMode(e.target.value === "scheduled")}><option value="now">바로빌 즉시 발급</option><option value="scheduled">예약 발급</option></select></label>
      <IssueTimingHelp />
      {scheduleMode && <div><label>예약 발급일 <input type="date" min={earliestInvoiceScheduleDate()} value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} /></label><p>내일부터 예약할 수 있으며, 선택한 날짜 오전 2시(한국시간)에 자동 발급합니다.</p></div>}
      {error && <p className="error" role="alert">{error}</p>}<p><strong>{issuer.corpName}</strong> → <strong>{document.customer.corpName}</strong></p><p>{document.writeDate} · {document.purposeType === 1 ? "영수" : "청구"} · {invoiceMoney(totals.total)}</p><p>공급받는자 이메일: {document.customer.email || "미입력"}</p>
    </Modal>}
  </form>;
}
