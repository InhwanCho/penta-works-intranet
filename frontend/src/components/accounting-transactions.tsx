"use client";
import { CashDialog } from "./cash-dialog";
import LoadingIndicator, { AccountingLoader } from "./loading-indicator";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useOfficePathname } from "./office-tab-context";
import { Landmark, CreditCard, Upload, History, Trash2, Undo2, ArrowLeft, Check, FileSpreadsheet } from "lucide-react";
import { api } from "@/lib/api";
import { minute } from "@/lib/accounting-format";
import { useApiQuery } from "@/lib/use-api-query";

type Source = { id: number; alias: string; issuer?: string; bank_code?: string; bank_name?: string; account_num_masked?: string; card_num_masked?: string; last_sync_at?: string; last_sync_error?: string };
type Row = Record<string, string | number | null>;
type Transactions = { rows: Row[]; total: number; summary: Record<string, string | number> };
type Result = { total: number; inserted: number; updated: number; unchanged: number };
type Preview = Result & { fileHash: string; netAmount: string | number; rows: { row: number; cardNumber: string; date: string; merchant: string; amount: number | string; status: string; approvalStatus: string }[] };
type UploadRecord = { legacy_baseline: boolean | number; id: number; filename: string; issuer: string; row_count: number; inserted_count: number; updated_count: number; status: string; created_at: string };
const money = (v: unknown) => v === null || v === undefined ? "—" : `${Number(v).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;

function today() { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date()); }
function Mark({ code, bank = false }: { code: unknown; bank?: boolean }) { const name = String(code ?? ""); return <span className={`finance-mark ${name.toLowerCase()}`} aria-hidden>{bank ? <Landmark /> : <CreditCard />}<b>{({ IBK: "기업", HANA: "하나", BC: "BC" } as Record<string, string>)[name] ?? (bank ? "은행" : "카드")}</b></span>; }
const formatResult = (r: Result) => `신규 ${r.inserted}건 · 갱신 ${r.updated}건 · 중복 ${r.unchanged}건`;

export function AccountingTransactions() {
  const path = useOfficePathname();
  const bank = !path.startsWith("/accounting/cards");
  const upload = path === "/accounting/cards/upload";
  const [from, setFrom] = useState(() => `${today().slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);
  const [management, setManagement] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cardDetail, setCardDetail] = useState<Row | null>(null);
  const [memoRow, setMemoRow] = useState<Row | null>(null);
  const status = useApiQuery<{ schemaReady: boolean; autoSyncEnabled: boolean; bankReady: boolean }>("/accounting/status");
  const enabled = status.data?.schemaReady === true;
  const accounts = useApiQuery<Source[]>("/accounting/bank-accounts", enabled && !upload && (bank || !!cardDetail));
  const cards = useApiQuery<Source[]>("/accounting/cards", enabled && !bank && !upload);
  const sources = bank ? accounts : cards;
  const validDates = !!from && !!to && to >= from && (Date.parse(to) - Date.parse(from)) / 86400000 < 200;
  const query = new URLSearchParams({ from, to, page: String(page), ...(source ? { source } : {}) });
  const transactions = useApiQuery<Transactions>(`/accounting/${bank ? "bank" : "card"}-transactions?${query}`, enabled && !upload && validDates);
  const uploads = useApiQuery<UploadRecord[]>("/accounting/card-uploads", enabled && management && !bank);
  const removed = useApiQuery<Row[]>("/accounting/card-transactions/removed", enabled && management && !bank);
  async function act(action: () => Promise<string>) { setBusy(true); setError(""); setMessage(""); try { setMessage(await action()); } catch (e) { setError(e instanceof Error ? e.message : "처리하지 못했습니다."); } finally { setBusy(false); } }
  return <div className="accounting-dashboard accounting-workspace accounting-office"><div className="accounting-layout accounting-single-layout">
    <main className="accounting-work-main accounting-live">
      {status.isError && <p role="alert" className="error">{status.error.message}</p>}
      {status.data && !enabled && <p role="alert">회계 DB 업데이트가 필요합니다.</p>}
      {upload ? <CardUpload enabled={enabled} /> : <>
        <header className="accounting-section-head"><div><h2>{bank ? "은행거래" : "카드내역"}</h2></div><Link className="accounting-back" href={bank ? "/accounting/plans" : "/accounting/card-bills"}>{bank ? "계획·실적 연결 →" : "카드 결제예정 →"}</Link></header>
        <div className="accounting-source-filter"><label htmlFor={bank ? "bank-source" : "card-source"}>{bank ? "조회 계좌" : "조회 카드"}</label><select id={bank ? "bank-source" : "card-source"} value={source} onChange={e => { setSource(e.target.value); setPage(1); }}><option value="">전체 {bank ? "계좌" : "카드"} ({sources.data?.length ?? 0})</option>{sources.data?.map(s => <option key={s.id} value={s.id}>{bank ? s.bank_name : s.alias} · {s.account_num_masked ?? s.card_num_masked}</option>)}</select></div>
        {sources.isError && <p role="alert" className="error">{sources.error.message}</p>}
        {bank && <div className="accounting-filters"><button disabled={busy || !enabled || transactions.isFetching || !status.data?.bankReady} onClick={() => void act(async () => { const r = await api<{ count: number }>("/accounting/bank-accounts/refresh", { method: "POST" }); return `${r.count}개 계좌를 확인했습니다.`; })}>새로고침</button><button disabled={busy || !status.data?.bankReady || !source || !validDates} onClick={() => void act(async () => { const r = await api<Result>("/accounting/bank-transactions/sync", { method: "POST", body: JSON.stringify({ accountId: Number(source), from, to }) }); return formatResult(r); })}>{busy ? "수집 중…" : "선택 계좌·기간 수집"}</button><small>{source ? `마지막 수집 ${minute(accounts.data?.find(a => String(a.id) === source)?.last_sync_at)}` : "계좌를 선택하면 해당 기간을 수집할 수 있습니다."}</small></div>}
        {bank && accounts.data?.filter(a => a.last_sync_error).map(a => <p key={a.id} role="alert" className="error">{a.bank_name}: {a.last_sync_error}</p>)}
        <div className="accounting-filters"><label>시작일<input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} /></label><span className="date-separator">—</span><label>종료일<input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} /></label>{!bank && <button className="accounting-history-toggle" onClick={() => setManagement(v => !v)}><History />{management ? "관리 닫기" : "업로드·삭제 관리"}</button>}{!bank && <Link className="accounting-primary-link" href="/accounting/cards/upload"><Upload />엑셀 업로드</Link>}</div>
        {!validDates && <p className="error" role="alert">조회 기간을 200일 이내로 선택해주세요.</p>}
        {error && <p role="alert" className="error">{error}</p>}{message && <p role="status" className="accounting-result">{message}</p>}
        {management && !bank && <section className="accounting-management"><h3><History />업로드 이력</h3><p>신규·갱신 내역만 되돌립니다. 중복 거래는 유지됩니다. 기존 파일은 현재 내역 제거만 지원합니다. 이후 변경되거나 장부에 연결된 거래가 있으면 전체 되돌리기를 중단합니다.</p>{uploads.isError && <p className="error">{uploads.error.message}</p>}{uploads.data?.map(u => <div className="upload-history-row" key={u.id}><FileSpreadsheet /><div><strong>{u.filename}</strong><small>{minute(u.created_at)} · 신규 {u.inserted_count} · 갱신 {u.updated_count}</small></div><button disabled={busy || u.status !== "APPLIED"} onClick={() => { if (!window.confirm(u.legacy_baseline ? `${u.filename}의 현재 거래를 목록에서 제거할까요? 제거한 거래에서 복원할 수 있습니다.` : `${u.filename} 업로드의 신규·갱신 내역을 되돌릴까요?`)) return; void act(async () => { const r = await api<{ count: number }>(`/accounting/card-uploads/${u.id}/rollback`, { method: "POST" }); return `${r.count}건을 되돌렸습니다.`; }); }}><Undo2 />{u.status === "APPLIED" ? (u.legacy_baseline ? "파일 내역 제거" : "전체 되돌리기") : "되돌림 완료"}</button></div>)}{uploads.data?.length === 0 && <p>이력 기능 적용 후 업로드한 파일이 없습니다. 이전 거래는 목록에서 개별 제거할 수 있습니다.</p>}
          <h3><Trash2 />제거한 거래</h3>{removed.isError && <p className="error">{removed.error.message}</p>}{removed.data?.map(r => <div className="upload-history-row" key={r.id}><CreditCard /><div><strong>{r.merchant_name}</strong><small>{r.alias} · {r.approval_date} · {money(r.net_approval_amount)}</small></div><button disabled={busy} onClick={() => void act(async () => { await api(`/accounting/card-transactions/${r.id}/restore`, { method: "POST" }); return "거래를 복원했습니다."; })}><Undo2 />복원</button></div>)}{removed.data?.length === 0 && <p>제거한 거래가 없습니다.</p>}
        </section>}
        {transactions.isError && <p role="alert" className="error">{transactions.error.message}</p>}{(status.isPending || (transactions.isPending && enabled && validDates)) && <AccountingLoader />}
        {transactions.data && validDates && <>
          <div className="accounting-totals"><span>{transactions.data.total.toLocaleString()}건</span>{bank ? <><span>입금 <strong className="money-in">{money(transactions.data.summary.depositAmount)}</strong></span><span>출금 <strong>{money(transactions.data.summary.withdrawAmount)}</strong></span></> : <span>취소 반영 합계 <strong>{money(transactions.data.summary.netAmount)}</strong></span>}</div>
          <div className={bank ? "accounting-table-scroll bank-transactions-table" : "accounting-table-scroll"}><table><thead><tr>{(bank ? ["거래일시", "계좌", "거래처/입금자", "적요", "입금", "출금", "거래후잔액", "원본 거래번호"] : ["사용일시", "카드", "가맹점", "승인번호", "순승인", "순매입", "상태", "청구월", "결제일", "결제계좌", "청구확정", "비고", "청구정보", ...(management ? ["관리"] : [])]).map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{transactions.data.rows.map(r => <tr key={r.id}>{bank ? <><td><div className="bank-transaction-date">
            <span className={Number(r.deposit_amount) > 0 ? "money-in" : undefined}>{Number(r.deposit_amount) > 0 ? "입금" : "출금"}</span>
            <time>{minute(r.trans_at)}</time>
          </div></td><td><div className="finance-table-source"><Mark code={r.bank_code} bank /><span>{r.bank_name}<small>{r.account_num_masked}</small></span></div></td><td>{r.counterparty_text || "—"}</td><td className="finance-description">{r.description || "—"}<small className="finance-subtext bank-user-memo">{r.user_memo}</small><button type="button" className="finance-remove" onClick={() => setMemoRow(r)}>{r.user_memo ? "메모 수정" : "메모 추가"}</button></td><td className="number money-in">{Number(r.deposit_amount) ? money(r.deposit_amount) : "—"}</td><td className="number">{Number(r.withdraw_amount) ? money(r.withdraw_amount) : "—"}</td><td className="number">{money(r.balance_after)}</td><td>{r.trans_ref_key || "—"}</td></> : <><td>{r.approval_date} {String(r.source_time ?? "").slice(0, 5)}</td><td><div className="finance-table-source"><Mark code={r.issuer} /><span>{r.alias}<small>{r.card_num_masked}</small></span></div></td><td className="finance-description">{r.merchant_name}</td><td>{r.approval_no}</td><td className="number">{money(r.net_approval_amount)}</td><td className="number">{money(r.net_purchase_amount)}</td><td><span className="finance-status">{r.approval_status}</span>{r.purchase_status && <small className="finance-subtext">{r.purchase_status}</small>}</td><td>{String(r.billing_month ?? "").slice(0, 7) || "—"}</td><td>{r.payment_date || "—"}</td><td>{r.payment_account || "미지정"}</td><td>{r.certainty === "CONFIRMED" ? "확정" : "미확정"}</td><td>{r.cash_memo || "—"}</td><td><button onClick={() => setCardDetail(r)}>수정</button></td>{management && <td><button className="finance-remove" disabled={busy} onClick={() => { if (!window.confirm("이 거래를 목록에서 제거할까요? 제거한 거래에서 복원할 수 있습니다.")) return; void act(async () => { await api(`/accounting/card-transactions/${r.id}`, { method: "DELETE" }); return "거래를 제거했습니다. 관리 화면에서 복원할 수 있습니다."; }); }}><Trash2 />제거</button></td>}</>}</tr>)}</tbody></table>{!transactions.data.total && <div className="finance-empty">{bank ? <Landmark /> : <CreditCard />}<strong>조회 기간의 내역이 없습니다.</strong><span>{bank ? "수집 완료 후 자동으로 반영됩니다." : "카드사 엑셀을 업로드하면 여기에 표시됩니다."}</span>{!bank && <Link href="/accounting/cards/upload">엑셀 업로드 →</Link>}</div>}</div>
          {transactions.data.total > 50 && <div className="accounting-pagination"><button disabled={page <= 1 || busy} onClick={() => setPage(p => p - 1)}>이전</button><span>{page} / {Math.ceil(transactions.data.total / 50)}</span><button disabled={page * 50 >= transactions.data.total || busy} onClick={() => setPage(p => p + 1)}>다음</button></div>}
        </>}
      </>}
    </main></div>{memoRow && <BankMemoEditor row={memoRow} onClose={() => setMemoRow(null)} onSaved={() => { setMemoRow(null); void transactions.refetch(); }} />}{cardDetail && <CardCashEditor row={cardDetail} accounts={accounts.data ?? []} onClose={() => setCardDetail(null)} onSaved={() => { setCardDetail(null); void transactions.refetch(); }} />}</div>;
}

function BankMemoEditor({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: () => void }) {
  const previousMemo = String(row.user_memo ?? "");
  const [memo, setMemo] = useState(previousMemo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <CashDialog title="은행거래 메모" onClose={() => { if (!busy) onClose(); }}>
    <form className="cash-form" onSubmit={async e => {
      e.preventDefault();
      setBusy(true);
      setError("");
      try {
        await api(`/accounting/bank-transactions/${row.id}/memo`, { method: "PUT", body: JSON.stringify({ memo, previousMemo }) });
        onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : "메모를 저장하지 못했습니다.");
      } finally { setBusy(false); }
    }}>
      <p>{minute(row.trans_at)} · {row.description || row.counterparty_text || "은행거래"}</p>
      <div className="cash-form-grid"><label className="wide">메모<textarea rows={4} maxLength={1000} value={memo} disabled={busy} onChange={e => setMemo(e.target.value)} /></label></div>
      {error && <p role="alert" className="cash-error">{error}</p>}
      <footer><button className="cash-create" disabled={busy || memo.trim() === previousMemo}>{busy ? "저장 중…" : "저장"}</button></footer>
    </form>
  </CashDialog>;
}

function CardCashEditor({ row, accounts, onClose, onSaved }: { row: Row; accounts: Source[]; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({ billingMonth: String(row.billing_month ?? "").slice(0, 7), paymentDate: String(row.payment_date ?? ""), accountId: String(row.cash_account_id ?? ""), certainty: String(row.certainty ?? "ESTIMATED"), memo: String(row.cash_memo ?? "") });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  const eligible = accounts.filter(a => row.issuer === "BC" ? ["IBK", "003", "3"].includes(a.bank_code ?? "") || /기업/.test(a.bank_name ?? "") : ["HANA", "081", "81"].includes(a.bank_code ?? "") || /하나/.test(a.bank_name ?? ""));
  const field = (key: keyof typeof form, value: string) => setForm(f => ({ ...f, [key]: value }));
  return <dialog ref={ref} className="cash-dialog" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}><header><h2>카드 사용내역 청구정보</h2><button disabled={busy} aria-label="닫기" onClick={onClose}>닫기</button></header><form className="cash-form" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError("");
    try { await api(`/accounting/card-transactions/${row.id}/cash-details`, { method: "PUT", body: JSON.stringify({ ...form, billingMonth: form.billingMonth ? `${form.billingMonth}-01` : null, paymentDate: form.paymentDate || null, accountId: form.accountId ? Number(form.accountId) : null, version: Number(row.cash_version ?? 0) }) }); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했습니다."); } finally { setBusy(false); }
  }}><p>{row.approval_date} · {row.merchant_name} · {money(row.net_approval_amount)}</p><fieldset disabled={busy}><div className="cash-form-grid"><label>청구월<input type="month" min="2000-01" max="2100-12" required={form.certainty === "CONFIRMED"} value={form.billingMonth} onChange={e => field("billingMonth", e.target.value)} /></label><label>결제일<input type="date" min="2000-01-01" max="2100-12-31" required={form.certainty === "CONFIRMED"} value={form.paymentDate} onChange={e => field("paymentDate", e.target.value)} /></label><label>결제계좌<select required={form.certainty === "CONFIRMED"} value={form.accountId} onChange={e => field("accountId", e.target.value)}><option value="">미지정</option>{eligible.map(a => <option key={a.id} value={a.id}>{a.alias} · {a.account_num_masked}</option>)}</select></label><label>청구확정 여부<select value={form.certainty} onChange={e => field("certainty", e.target.value)}><option value="ESTIMATED">미확정</option><option value="CONFIRMED">확정</option></select></label><label className="wide">비고<textarea maxLength={2000} value={form.memo} onChange={e => field("memo", e.target.value)} /></label></div></fieldset><p className="cash-guidance">이 정보는 사용내역 관리용입니다. 달력에 반영할 카드대금은 ‘카드 결제예정’에서 카드사별 청구 합계로 등록하세요.</p>{error && <p role="alert" className="cash-error">{error}</p>}<footer><button className="cash-create" disabled={busy}>{busy ? "저장 중…" : "저장"}</button></footer></form></dialog>;
}

function CardUpload({ enabled }: { enabled: boolean }) {
  const [issuer, setIssuer] = useState("BC"); const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState<Preview | null>(null); const [saved, setSaved] = useState<Result | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const reset = () => { setPreview(null); setSaved(null); setError(""); };
  async function process(commit: boolean) { setBusy(true); setError(""); try { if (!file) throw new Error("파일을 선택해주세요."); if (file.size > 5 * 1024 * 1024) throw new Error("파일은 최대 5MB입니다."); const body = new FormData(); body.append("file", file); body.append("issuer", issuer); if (commit) { if (!preview) throw new Error("파일을 먼저 확인해주세요."); body.append("fileHash", preview.fileHash); setSaved(await api<Result>("/accounting/card-import/commit", { method: "POST", body })); setPreview(null); } else { setPreview(null); setPreview(await api<Preview>("/accounting/card-import/preview", { method: "POST", body })); } } catch (e) { setError(e instanceof Error ? e.message : "업로드에 실패했습니다."); } finally { setBusy(false); } }
  return <><Link className="accounting-back" href="/accounting/cards"><ArrowLeft />카드내역으로</Link><header className="accounting-section-head"><div><h2><Upload />카드 엑셀 업로드</h2></div></header>
    {saved ? <div className="finance-upload-success"><Check /><h3>저장했습니다.</h3><p>{formatResult(saved)}</p><Link className="accounting-primary-link" href="/accounting/cards">카드내역 보기</Link><button onClick={() => { reset(); setFile(null); }}>다른 파일 올리기</button></div> : <>
      <div className="finance-upload-fields"><label>카드사<select disabled={busy} value={issuer} onChange={e => { setIssuer(e.target.value); reset(); }}><option value="BC">BC카드</option><option value="HANA">하나카드</option></select></label><label className="finance-file-picker"><FileSpreadsheet /><strong>{file?.name ?? "카드사에서 내려받은 엑셀을 선택하세요"}</strong><span>XLS / XLSX · 최대 5MB</span><input aria-label="승인내역 엑셀" type="file" accept=".xls,.xlsx" disabled={busy} onChange={e => { setFile(e.target.files?.[0] ?? null); reset(); }} /></label></div>
      {error && <p className="error" role="alert">{error}</p>}{busy && <LoadingIndicator compact label="파일을 처리하는 중" />}
      {preview && <><div className="accounting-totals"><strong>전체 {preview.total}건</strong><span>{formatResult(preview)}</span><strong>{money(preview.netAmount)}</strong></div><p>처음 {preview.rows.length}건 미리보기입니다. 저장은 파일 전체에 적용됩니다.</p><div className="accounting-table-scroll"><table><thead><tr><th>카드</th><th>사용일</th><th>가맹점</th><th>금액</th><th>반영</th></tr></thead><tbody>{preview.rows.map((r, i) => <tr key={i}><td>{r.cardNumber}</td><td>{r.date}</td><td>{r.merchant}</td><td className="number">{money(r.amount)}</td><td>{({ NEW: "신규", UPDATE: "갱신", UNCHANGED: "중복" } as Record<string, string>)[r.status]}</td></tr>)}</tbody></table></div></>}
      <div className="finance-upload-actions"><button className="primary" disabled={!enabled || !file || busy} onClick={() => void process(!!preview)}>{preview ? <Check /> : <FileSpreadsheet />}{preview ? "확인한 내역 저장" : "파일 내용 확인"}</button></div>
    </>}
  </>;
}
