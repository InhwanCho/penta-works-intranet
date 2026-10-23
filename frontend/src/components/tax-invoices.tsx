"use client";

import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, FileText, Pencil, Plus, Printer, RefreshCw, Search, Settings2, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";
import { emptyItem, emptyParty, invoiceMoney, invoiceStatuses, invoiceTotals, koreaToday, lineAmounts, newDocument, type Invoice, type InvoiceDocument, type InvoiceItem, type InvoiceSettings, type Party } from "@/lib/tax-invoices";

const base = "/accounting/tax-invoices";
type Customer = { id: string; party?: Party; name: string; business_no: string | null };
type Action = (fn: () => Promise<void>) => Promise<void>;

export function TaxInvoices() {
  const settings = useApiQuery<InvoiceSettings>(`${base}/settings`);
  const [selected, setSelected] = useState<Invoice | "new" | null>(null);
  const [profile, setProfile] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [reviewAfterSave, setReviewAfterSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [from, setFrom] = useState(() => `${koreaToday().slice(0, 7)}-01`);
  const [to, setTo] = useState(koreaToday);
  const [keyword, setKeyword] = useState("");
  const [condition, setCondition] = useState("corpName");
  const [search, setSearch] = useState({ keyword: "", condition: "corpName" });
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  const validDates = days >= 0 && days < 200;
  const list = useApiQuery<{ rows: Invoice[]; total: number }>(`${base}?${new URLSearchParams({ from, to, ...search, status, page: String(page) })}`, validDates && !selected);
  async function act(action: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "처리하지 못했습니다."); } finally { setBusy(false); }
  }
  function closeEditor() {
    if (editorDirty && !window.confirm("작성 중인 내용을 닫을까요?")) return;
    setSelected(null); setEditorDirty(false); setReviewAfterSave(false); setError(""); setMessage("");
  }
  const open = (id: number) => void act(async () => { setReviewAfterSave(false); setSelected(await api<Invoice>(`${base}/${id}`)); });
  function create() { setSelected("new"); setReviewAfterSave(false); setError(""); setMessage(""); }
  return <div className="accounting-dashboard tax-workspace">
    <nav className="tax-breadcrumb" aria-label="회계 메뉴"><Link href="/accounting">계좌내역</Link><Link href="/accounting/cards">카드내역</Link><span aria-current="page">세금계산서</span></nav>
    <header className="tax-list-heading tax-page-heading"><div><h2 className="tax-page-title">{selected ? selected === "new" || selected.status === "DRAFT" ? "세금계산서 발행" : "세금계산서 상세" : "세금계산서"}</h2><p>{settings.data?.issuer.corpName || "주식회사 펜타웍스"} · 기본 공급자</p></div>{selected ? <button className="tax-back" onClick={closeEditor} disabled={busy}><ArrowLeft size={16} />목록으로</button> : <button disabled={!settings.data || busy} onClick={() => setProfile(true)}><Settings2 size={15} />공급자 설정</button>}</header>
    {settings.data?.environment === "test" && <p className="tax-notice">바로빌 테스트 환경입니다.</p>}
    {settings.isError && <p className="error" role="alert">{settings.error.message}</p>}{error && <p className="error" role="alert">{error}</p>}{message && <p className="tax-success" role="status">{message}</p>}{busy && <p role="status">처리 중…</p>}
    {profile && settings.data && <IssuerSettings settings={settings.data} busy={busy} error={error} close={() => setProfile(false)} act={act} saved={() => { setProfile(false); setMessage("공급자 기본정보를 저장했습니다."); }} />}
    {selected && settings.data ? <InvoiceEditor
      key={typeof selected === "string" ? "new" : `${selected.id}-${selected.version}`}
      invoice={selected === "new" ? null : selected} settings={settings.data} busy={busy} act={act} onDirty={setEditorDirty}
      initialReview={reviewAfterSave} close={closeEditor} error={error}
      onSaved={(row, review) => { setReviewAfterSave(!!review); setSelected(row); if (!review) setMessage("임시저장했습니다."); }}
      onUpdated={row => { setReviewAfterSave(false); setSelected(row); }}
    /> : !selected && <>
      <form className="tax-list-search" onSubmit={e => { e.preventDefault(); setSearch({ keyword, condition }); setPage(1); }}>
        <select aria-label="검색 조건" value={condition} onChange={e => setCondition(e.target.value)}><option value="corpName">상호</option><option value="corpNum">사업자번호</option><option value="mgtNum">관리번호</option></select>
        <div className="tax-search-input"><Search size={16} /><input aria-label="검색어" placeholder="검색어" value={keyword} onChange={e => setKeyword(e.target.value)} maxLength={200} /></div>
        <button type="submit">검색</button><span className="tax-toolbar-spacer" />
        <button type="button" className="tax-green" disabled={!settings.data || busy} onClick={create}><Plus size={16} />세금계산서 발행</button>
      </form>
      <details className="tax-list-details"><summary>기간·상태 필터</summary><div>
        <label>작성일 시작<input aria-label="작성일 시작" type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} /></label>
        <label>작성일 종료<input aria-label="작성일 종료" type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} /></label>
        <label>발급 상태<select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">전체</option>{Object.entries(invoiceStatuses).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      </div></details>
      {!validDates && <p className="error" role="alert">조회 기간을 200일 이내로 선택해주세요.</p>}{list.isError && <p className="error" role="alert">{list.error.message}</p>}{list.isFetching && <p role="status">내역을 불러오는 중…</p>}
      {list.data && validDates && <><div className="tax-list"><div className="tax-list-scroll"><table><thead><tr>{["관리번호", "공급받는자", "합계금액", "상태", "작성일자"].map(h => <th key={h}>{h}<ChevronDown size={12} /></th>)}</tr></thead><tbody>{list.data.rows.map(row => <tr key={row.id}><td><button className="tax-row-link" disabled={busy} onClick={() => open(row.id)}>{row.mgt_key}</button></td><td><button className="tax-row-link" disabled={busy} onClick={() => open(row.id)}>{row.customer_name}</button><small>{row.customer_business_no}</small></td><td className="number">{invoiceMoney(row.total_amount)}</td><td className="tax-status-cell"><span className={`tax-badge ${row.status.toLowerCase()}`}>{invoiceStatuses[row.status]}</span>{row.environment === "test" && <small>테스트</small>}</td><td>{String(row.write_date).slice(0, 10)}</td></tr>)}</tbody></table></div>
        {!list.data.total && <div className="tax-empty"><FileText size={24} /><strong>발행된 세금계산서가 없습니다</strong><p>‘세금계산서 발행’으로 작성을 시작하세요.</p></div>}
        <div className="tax-pagination"><span>총 {list.data.total.toLocaleString()}건</span><div><button disabled={page <= 1 || busy} onClick={() => setPage(p => p - 1)}>이전</button><span>{page} / {Math.max(1, Math.ceil(list.data.total / 30))}</span><button disabled={page * 30 >= list.data.total || busy} onClick={() => setPage(p => p + 1)}>다음</button></div></div>
      </div></>}
    </>}
  </div>;
}

function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return <header className="tax-section-head"><h3>{title}</h3>{action}</header>;
}
function RadioField({ label, value, options, onChange }: { label: string; value: number; options: { value: number; label: string; disabled?: boolean }[]; onChange?: (value: number) => void }) {
  return <div className="tax-labeled"><span>{label}</span><div className="tax-radio-options" role="radiogroup" aria-label={label}>{options.map(option => <label key={option.value} title={option.disabled ? "현재 지원하지 않는 발행 방식입니다." : undefined}><input type="radio" name={label} value={option.value} checked={value === option.value} disabled={option.disabled} onChange={() => onChange?.(option.value)} />{option.label}</label>)}</div></div>;
}
const partyRows: { key: keyof Party; label: string; placeholder?: string; type?: string }[][] = [
  [{ key: "corpNum", label: "사업자번호", placeholder: "숫자 10자리" }, { key: "taxRegId", label: "종사업장", placeholder: "예) 0001" }],
  [{ key: "corpName", label: "상호", placeholder: "법인명" }, { key: "ceoName", label: "대표자" }],
  [{ key: "addr", label: "주소" }],
  [{ key: "bizType", label: "업태" }, { key: "bizClass", label: "종목" }],
  [{ key: "contactName", label: "담당자" }, { key: "email", label: "이메일", type: "email" }],
  [{ key: "tel", label: "연락처", placeholder: "02-1234-1234", type: "tel" }, { key: "hp", label: "휴대폰", placeholder: "010-0000-0000", type: "tel" }],
];
function PartyCard({ value, onChange, title, tone, locked = false }: { value: Party; onChange?: (value: Party) => void; title: string; tone: string; locked?: boolean }) {
  return <section className={`tax-party ${tone}`} aria-label={title}>
    <div className="tax-party-vertical" aria-hidden="true">{[...title].map((character, i) => <span key={i}>{character}</span>)}</div>
    <div className="tax-party-body">{partyRows.map((row, ri) => <div className="tax-party-row" key={ri}>{row.map(field => <Fragment key={field.key}><label className="tax-party-label" htmlFor={`${tone}-${field.key}`}>{field.label}</label><div className="tax-party-value"><input id={`${tone}-${field.key}`} aria-label={`${title} ${field.label}`} readOnly={locked} type={field.type || "text"} maxLength={200} value={value[field.key] || ""} onChange={e => onChange?.({ ...value, [field.key]: e.target.value })} placeholder={locked ? undefined : field.placeholder} /></div></Fragment>)}</div>)}</div>
  </section>;
}
function Modal({ title, close, children, actions }: { title: string; close: () => void; children: ReactNode; actions?: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    const listener = (event: KeyboardEvent) => {
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
  return <div className="tax-modal-backdrop"><section ref={ref} tabIndex={-1} className="tax-modal" onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault(); }} role="dialog" aria-modal="true" aria-label={title}><header><h3>{title}</h3><button type="button" onClick={close} aria-label="닫기"><X size={16} /></button></header><div className="tax-modal-body">{children}</div>{actions && <footer className="tax-actions">{actions}</footer>}</section></div>;
}
function IssuerSettings({ settings, busy, error, close, act, saved }: { settings: InvoiceSettings; busy: boolean; error: string; close: () => void; act: Action; saved: () => void }) {
  const [issuer, setIssuer] = useState(settings.issuer);
  return <Modal title="공급자 기본정보" close={close} actions={<><button disabled={busy} onClick={close}>취소</button><button disabled={busy || !settings.issueReady} onClick={() => void act(async () => { await api(`${base}/settings/import`, { method: "POST", body: JSON.stringify({ version: settings.version }) }); saved(); })}><RefreshCw size={16} />바로빌 정보 가져오기</button><button disabled={busy} className="tax-primary" onClick={() => void act(async () => { await api(`${base}/settings`, { method: "PUT", body: JSON.stringify({ issuer, version: settings.version }) }); saved(); })}>저장</button></>}>
    {error && <p className="error" role="alert">{error}</p>}<p>펜타웍스 공급자 정보는 작성 시 자동으로 입력됩니다.</p><fieldset disabled={busy}><PartyCard value={issuer} onChange={setIssuer} title="공급자" tone="supplier" /></fieldset>
  </Modal>;
}

function InvoiceEditor({ invoice, settings, busy, act, onSaved, onUpdated, onDirty, initialReview, close, error }: {
  invoice: Invoice | null; settings: InvoiceSettings; busy: boolean; act: Action; onSaved: (row: Invoice, review?: boolean) => void;
  onUpdated: (row: Invoice) => void; onDirty: (dirty: boolean) => void; initialReview: boolean; close: () => void; error: string;
}) {
  const [document, setDocument] = useState<InvoiceDocument>(() => invoice?.document || newDocument());
  const [requestKey] = useState(() => crypto.randomUUID());
  const [review, setReview] = useState(initialReview);
  const [issuer, setIssuer] = useState<Party>(() => invoice?.issuer || settings.issuer);
  const [issuerDraft, setIssuerDraft] = useState<Party>(issuer);
  const [issuerEditing, setIssuerEditing] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [pickedCustomer, setPickedCustomer] = useState<Customer | null>(null);
  const [picker, setPicker] = useState(false);
  const [productPicker, setProductPicker] = useState(false);
  const [productSearch, setProductSearch] = useState("");
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
  const editable = !invoice || invoice.status === "DRAFT";
  const totals = invoiceTotals(document);
  const customers = useApiQuery<Customer[]>(`${base}/customers?keyword=${encodeURIComponent(customerSearch)}`, picker);
  const products = useApiQuery<InvoiceItem[]>(`${base}/products?keyword=${encodeURIComponent(productSearch)}`, productPicker);
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
  async function persist(requestIssue: boolean) {
    if (issuerEditing || !formRef.current?.reportValidity()) return;
    if (requestIssue && invoice && !dirty) { setReview(true); return; }
    await act(async () => {
      const row = await api<Invoice>(invoice ? `${base}/${invoice.id}` : base, { method: invoice ? "PUT" : "POST", body: JSON.stringify({ requestKey, version: invoice?.version || 0, document, issuer }) });
      onSaved(row, requestIssue);
    });
  }
  function save(e: FormEvent) { e.preventDefault(); void persist(false); }
  function addProducts() {
    const rows = pickedProducts.map(i => products.data?.[i]).filter((row): row is InvoiceItem => !!row).map(row => ({ ...row, date: document.writeDate, quantity: "1", unitPrice: String(row.unitPrice), note: "" }));
    const items = [...document.items];
    if (rows.length && items.length === 1 && !items[0].name && !items[0].unitPrice) items.splice(0, 1);
    update({ ...document, items: [...items, ...rows].slice(0, 99) }); setProductPicker(false); setPickedProducts([]);
  }
  return <form ref={formRef} onSubmit={save} className="tax-editor">
    {invoice?.error_message && <p className="error" role="alert">{invoice.error_message}</p>}
    <fieldset className="tax-sheet" disabled={busy || !editable}>
      <section className="tax-section">
        <SectionHead title="발행 옵션" />
        <div className="tax-option-top">
          <label>작성일자 <span className="tax-required">*</span><input type="date" aria-label="작성일자" required max={koreaToday()} value={document.writeDate} onChange={e => changeWriteDate(e.target.value)} /></label>
          <div className="tax-labeled"><span>거래처 <span className="tax-required">*</span></span><button className="tax-client-trigger" type="button" onClick={() => setPicker(true)}><span className={document.customer.corpName ? "" : "placeholder"}>{document.customer.corpName || "거래처 선택"}</span><Search size={16} /></button></div>
        </div>
        <div className="tax-option-radios">
          <RadioField label="발급 유형" value={1} options={[{ value: 1, label: "즉시 발행" }, { value: 2, label: "바로빌 전송", disabled: true }]} />
          <RadioField label="영수 / 청구" value={document.purposeType} options={[{ value: 1, label: "영수" }, { value: 2, label: "청구" }]} onChange={purposeType => update({ ...document, purposeType })} />
          <RadioField label="과세 유형" value={document.taxType} options={[{ value: 1, label: "과세" }, { value: 2, label: "영세" }, { value: 3, label: "면세" }]} onChange={taxType => update({ ...document, taxType })} />
          <RadioField label="계산서 유형" value={1} options={[{ value: 1, label: "일반" }, { value: 2, label: "수정", disabled: true }]} />
          <RadioField label="발행 방향" value={1} options={[{ value: 1, label: "정발행" }, { value: 2, label: "역발행", disabled: true }]} />
        </div>
        <label className="tax-memo">메모<textarea value={document.remark} maxLength={150} rows={2} onChange={e => update({ ...document, remark: e.target.value })} placeholder="상단 비고 (선택)" /></label>
      </section>
      <section className="tax-section"><SectionHead title="공급자 / 공급받는자" action={editable && <div className="tax-actions tax-issuer-actions"><span>공급자</span>{issuerEditing ? <><button type="button" onClick={() => setIssuerEditing(false)}>취소</button><button type="button" onClick={() => { setIssuer(issuerDraft); setIssuerEditing(false); setDirty(true); setReview(false); }}><Check size={14} />적용</button></> : <button type="button" aria-label="공급자 수정" onClick={() => { setIssuerDraft({ ...issuer }); setIssuerEditing(true); setReview(false); }}><Pencil size={14} />수정</button>}</div>} />{issuerEditing && <p className="tax-issuer-edit-note">수정한 공급자 정보는 이 세금계산서에만 적용됩니다. 수정 후 ‘적용’을 눌러주세요.</p>}<div className="tax-parties"><PartyCard title="공급자" tone="supplier" value={issuerEditing ? issuerDraft : issuer} onChange={setIssuerDraft} locked={!editable || !issuerEditing} /><PartyCard title="공급받는자" tone="customer" value={document.customer} onChange={customer => update({ ...document, customer })} locked={!editable} /></div></section>
      <section className="tax-section tax-items">
        <SectionHead title="품목" action={editable && <div className="tax-actions"><button type="button" onClick={() => { setProductPicker(true); setPickedProducts([]); }}><Search size={16} />제품 선택</button><button type="button" disabled={document.items.length >= 99} onClick={() => update({ ...document, items: [...document.items, emptyItem(document.writeDate)] })}><Plus size={16} />품목 추가</button></div>} />
        <p className="tax-item-note">※ 공급일자는 작성일자와 동일한 월({document.writeDate.slice(0, 7)})의 날짜만 선택할 수 있습니다.</p>
        <div className="tax-items-scroll"><table><thead><tr>{["순번", "공급일자", "품목명", "규격", "수량", "단가", "공급가액", "세액", "비고", ""].map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>{document.items.map((item, i) => {
          const amount = lineAmounts(item, document.taxType);
          return <tr key={i}><td className="tax-line-number">{i + 1}</td><td><input aria-label={`${i + 1}번 공급일자`} type="date" required min={monthStart} max={monthEnd} value={item.date} onChange={e => setItem(i, "date", e.target.value)} /></td><td><input aria-label={`${i + 1}번 품목명`} required maxLength={100} value={item.name} onChange={e => setItem(i, "name", e.target.value)} placeholder="품목명" /></td><td><input aria-label={`${i + 1}번 규격`} maxLength={100} value={item.specification} onChange={e => setItem(i, "specification", e.target.value)} placeholder="EA" /></td><td><input aria-label={`${i + 1}번 수량`} type="number" min="0.0001" step="0.0001" required value={item.quantity} onChange={e => setItem(i, "quantity", e.target.value)} /></td><td><input aria-label={`${i + 1}번 단가`} type="number" min="0" step="0.0001" required value={item.unitPrice} onChange={e => setItem(i, "unitPrice", e.target.value)} placeholder="0" /></td><td className="number">{invoiceMoney(amount.supply)}</td><td className="number">{invoiceMoney(amount.tax)}</td><td><input aria-label={`${i + 1}번 비고`} maxLength={100} value={item.note} onChange={e => setItem(i, "note", e.target.value)} placeholder="비고" /></td><td>{editable && document.items.length > 1 && <button className="tax-remove" type="button" aria-label={`${i + 1}번 품목 삭제`} onClick={() => update({ ...document, items: document.items.filter((_, j) => j !== i) })}><Trash2 size={16} /></button>}</td></tr>;
        })}</tbody><tfoot><tr><td colSpan={6} className="number">합계</td><td className="number">{invoiceMoney(totals.supply)}</td><td className="number">{invoiceMoney(totals.tax)}</td><td colSpan={2} className="number tax-total">총액 {invoiceMoney(totals.total)}</td></tr></tfoot></table></div>
      </section>
    </fieldset>
    {invoice && invoice.status !== "DRAFT" && <section className="tax-sheet tax-transmission"><SectionHead title="발급 정보" /><div><span className={`tax-badge ${invoice.status.toLowerCase()}`}>{invoiceStatuses[invoice.status]}</span><span>관리번호 {invoice.mgt_key}</span></div><p>국세청 승인번호 <strong>{invoice.nts_key || "아직 확인되지 않음"}</strong></p><p>바로빌 상태 {invoice.remote_state || "—"} · 국세청 전송 상태 {invoice.nts_state || "—"}</p></section>}
    <footer className="tax-editor-footer"><button type="button" onClick={close} disabled={busy}>취소</button>{editable ? <><button type="submit" disabled={busy || issuerEditing}>임시저장</button><button type="button" className="tax-primary" disabled={busy || issuerEditing || !settings.issueReady} onClick={() => void persist(true)}>{busy ? "요청 중..." : "발행 요청"}</button></> : <><button type="button" onClick={() => window.print()}><Printer size={16} />인쇄</button><button type="button" disabled={busy} onClick={() => void act(async () => onUpdated(await api<Invoice>(`${base}/${invoice.id}/sync`, { method: "POST" })))}><RefreshCw size={16} />상태 조회</button></>}</footer>
    {picker && <Modal title="거래처 선택" close={() => setPicker(false)} actions={<><span className="tax-modal-picked">{pickedCustomer ? `선택: ${pickedCustomer.name}` : "행을 클릭해 선택하세요"}</span><button type="button" onClick={() => setPicker(false)}>취소</button><button type="button" className="tax-primary" disabled={!pickedCustomer} onClick={() => { if (!pickedCustomer) return; update({ ...document, customer: pickedCustomer.party || { ...emptyParty(), corpName: pickedCustomer.name, corpNum: pickedCustomer.business_no || "" } }); setPicker(false); }}>선택</button></>}>
      <div className="tax-picker-search"><Search size={16} /><input aria-label="거래처명·이름·사업자번호 검색" placeholder="거래처명·이름·사업자번호 검색" maxLength={200} value={customerSearch} onChange={e => { setCustomerSearch(e.target.value); setPickedCustomer(null); }} /></div>
      {customers.isError && <p className="error" role="alert">{customers.error.message}</p>}
      <div className="tax-picker-table"><table><thead><tr><th>구분</th><th>거래처명</th><th>사업자번호</th><th>대표자</th></tr></thead><tbody>{customers.data?.map(c => <tr key={c.id} className={pickedCustomer?.id === c.id ? "selected" : ""}><td><span className="tax-customer-type">사업자</span></td><td><button type="button" onClick={() => setPickedCustomer(c)}>{c.name}</button></td><td>{c.business_no || "—"}</td><td>{c.party?.ceoName || "—"}</td></tr>)}</tbody></table>{customers.isFetching && <p role="status">불러오는 중…</p>}{customers.data?.length === 0 && <p>결과가 없습니다. 공급받는자 정보를 직접 입력할 수 있습니다.</p>}</div>
    </Modal>}
    {productPicker && <Modal title="제품 선택" close={() => setProductPicker(false)} actions={<><span className="tax-modal-picked">{pickedProducts.length}개 선택</span><button type="button" onClick={() => setProductPicker(false)}>취소</button><button type="button" className="tax-primary" disabled={!pickedProducts.length} onClick={addProducts}>선택</button></>}>
      <div className="tax-picker-search"><Search size={16} /><input aria-label="제품 검색" placeholder="품목명 검색" value={productSearch} onChange={e => { setProductSearch(e.target.value); setPickedProducts([]); }} /></div><p className="tax-picker-hint">이전에 작성한 세금계산서의 품목을 선택할 수 있습니다.</p>
      {products.isError && <p className="error" role="alert">{products.error.message}</p>}<div className="tax-picker-table"><table><thead><tr><th>선택</th><th>품목명</th><th>규격</th><th>단가</th></tr></thead><tbody>{products.data?.map((item, i) => <tr key={i}><td><input type="checkbox" aria-label={`${item.name} 선택`} checked={pickedProducts.includes(i)} onChange={e => setPickedProducts(e.target.checked ? [...pickedProducts, i] : pickedProducts.filter(index => index !== i))} /></td><td>{item.name}</td><td>{item.specification}</td><td className="number">{Number(item.unitPrice).toLocaleString("ko-KR")}원</td></tr>)}</tbody></table>{products.isFetching && <p role="status">불러오는 중…</p>}{products.data?.length === 0 && <p>저장된 품목이 없습니다. 품목 표에 직접 입력해주세요.</p>}</div>
    </Modal>}
    {review && invoice && <Modal title="발급 전 확인" close={() => { if (!busy) setReview(false); }} actions={<><button type="button" disabled={busy} onClick={() => setReview(false)}>취소</button><button type="button" className="tax-primary" disabled={busy} onClick={() => void act(async () => { onUpdated(await api<Invoice>(`${base}/${invoice.id}/issue`, { method: "POST", body: JSON.stringify({ version: invoice.version }) })); setReview(false); })}><Check size={16} />{settings.environment === "test" ? "테스트 발급" : "확인 후 발급"}</button></>}>
      {error && <p className="error" role="alert">{error}</p>}<p><strong>{issuer.corpName}</strong> → <strong>{document.customer.corpName}</strong></p><p>{document.writeDate} · {document.purposeType === 1 ? "영수" : "청구"} · {invoiceMoney(totals.total)}</p><p>공급받는자 이메일: {document.customer.email || "미입력"}</p>
    </Modal>}
  </form>;
}
