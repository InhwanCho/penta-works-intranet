"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Landmark, CreditCard, Upload, History, Trash2, Undo2, Clock3, ArrowLeft, Check, FileSpreadsheet } from "lucide-react";
import { accountingNavigation } from "@/lib/office-navigation";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";

type Source = { id: number; alias: string; issuer?: string; bank_code?: string; bank_name?: string; account_num_masked?: string; card_num_masked?: string; last_sync_at?: string; last_sync_error?: string };
type Row = Record<string, string | number | null>;
type Transactions = { rows: Row[]; total: number; summary: Record<string, string | number> };
type Result = { total: number; inserted: number; updated: number; unchanged: number };
type Preview = Result & { fileHash: string; netAmount: string | number; rows: { row: number; cardNumber: string; date: string; merchant: string; amount: number | string; status: string; approvalStatus: string }[] };
type UploadRecord = { legacy_baseline: boolean | number; id: number; filename: string; issuer: string; row_count: number; inserted_count: number; updated_count: number; status: string; created_at: string };
const money = (v: unknown) => v === null || v === undefined ? "—" : `${Number(v).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;
export function minute(v: unknown) { return v ? String(v).replace("T", " ").slice(0, 16) : "아직 없음"; }
function today() { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date()); }
function Mark({ code, bank = false }: { code: unknown; bank?: boolean }) { const name = String(code ?? ""); return <span className={`finance-mark ${name.toLowerCase()}`} aria-hidden>{bank ? <Landmark /> : <CreditCard />}<b>{({ IBK: "기업", HANA: "하나", BC: "BC" } as Record<string, string>)[name] ?? (bank ? "은행" : "카드")}</b></span>; }
const formatResult = (r: Result) => `신규 ${r.inserted}건 · 갱신 ${r.updated}건 · 중복 ${r.unchanged}건`;

export function AccountingTransactions() {
  const path = usePathname();
  const bank = !path.startsWith("/accounting/cards");
  const upload = path === "/accounting/cards/upload";
  const other = accountingNavigation.find(item => item.href === path && !["/accounting", "/accounting/cards", "/accounting/tax-invoices"].includes(path));
  const [from, setFrom] = useState(() => `${today().slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);
  const [management, setManagement] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const status = useApiQuery<{ schemaReady: boolean; autoSyncEnabled: boolean }>("/accounting/status");
  const enabled = status.data?.schemaReady === true;
  const accounts = useApiQuery<Source[]>("/accounting/bank-accounts", enabled);
  const cards = useApiQuery<Source[]>("/accounting/cards", enabled);
  const sources = bank ? accounts : cards;
  const validDates = !!from && !!to && to >= from && (Date.parse(to) - Date.parse(from)) / 86400000 < 200;
  const query = new URLSearchParams({ from, to, page: String(page), ...(source ? { source } : {}) });
  const transactions = useApiQuery<Transactions>(`/accounting/${bank ? "bank" : "card"}-transactions?${query}`, enabled && !upload && !other && validDates);
  const uploads = useApiQuery<UploadRecord[]>("/accounting/card-uploads", enabled && management && !bank);
  const removed = useApiQuery<Row[]>("/accounting/card-transactions/removed", enabled && management && !bank);
  async function act(action: () => Promise<string>) { setBusy(true); setError(""); setMessage(""); try { setMessage(await action()); } catch (e) { setError(e instanceof Error ? e.message : "처리하지 못했습니다."); } finally { setBusy(false); } }
  return <div className="accounting-dashboard accounting-workspace"><div className="accounting-layout accounting-single-layout">
    <main className="accounting-work-main accounting-live">
      {status.isPending && <p role="status">불러오는 중…</p>}{status.isError && <p role="alert" className="error">{status.error.message}</p>}
      {status.data && !enabled && <p role="alert">회계 DB 업데이트가 필요합니다.</p>}
      {other ? <><h2>{other.label}</h2><p>장부 관리 화면은 준비 중입니다.</p></> : upload ? <CardUpload enabled={enabled} /> : <>
        <header className="accounting-section-head"><div><h2>{bank ? <Landmark /> : <CreditCard />}{bank ? "계좌 입출금" : "카드 승인내역"}</h2><p>{bank ? "기업·하나 계좌의 입출금 내역을 한곳에서 확인합니다." : "카드별 승인·취소와 매입 내역을 확인합니다."}</p></div>{!bank && <Link className="accounting-primary-link" href="/accounting/cards/upload"><Upload />엑셀 업로드</Link>}</header>
        <div className="finance-sources" role="group" aria-label={bank ? "계좌 선택" : "카드 선택"}>
          <button className={!source ? "selected" : ""} onClick={() => { setSource(""); setPage(1); }}>전체 {sources.data?.length ?? 0}</button>
          {sources.data?.map(s => <button key={s.id} className={source === String(s.id) ? "selected" : ""} onClick={() => { setSource(String(s.id)); setPage(1); }}><Mark code={bank ? s.bank_code : s.issuer} bank={bank} /><span><strong>{bank ? s.bank_name : s.alias}</strong><small>{s.account_num_masked ?? s.card_num_masked}</small></span></button>)}
        </div>
        {sources.isError && <p role="alert" className="error">{sources.error.message}</p>}
        {bank && <div className="accounting-sync-note"><Clock3 /><span>{status.data?.autoSyncEnabled ? "4시간마다 자동 갱신 · 00:15 / 04:15 / 08:15 / 12:15 / 16:15 / 20:15" : "자동 갱신이 중지되어 있습니다."}</span>{accounts.data?.map(a => <small key={a.id}>{a.bank_name}: {minute(a.last_sync_at)}{a.last_sync_error && <span role="alert" className="error"> · {a.last_sync_error}</span>}</small>)}</div>}
        <div className="accounting-filters"><label>시작일<input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} /></label><span className="date-separator">—</span><label>종료일<input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} /></label>{!bank && <button className="accounting-history-toggle" onClick={() => setManagement(v => !v)}><History />{management ? "관리 닫기" : "업로드·삭제 관리"}</button>}</div>
        {!validDates && <p className="error" role="alert">조회 기간을 200일 이내로 선택해주세요.</p>}
        {error && <p role="alert" className="error">{error}</p>}{message && <p role="status" className="accounting-result">{message}</p>}
        {management && !bank && <section className="accounting-management"><h3><History />업로드 이력</h3><p>신규·갱신 내역만 되돌립니다. 중복 거래는 유지됩니다. 기존 파일은 현재 내역 제거만 지원합니다. 이후 변경되거나 장부에 연결된 거래가 있으면 전체 되돌리기를 중단합니다.</p>{uploads.isError && <p className="error">{uploads.error.message}</p>}{uploads.data?.map(u => <div className="upload-history-row" key={u.id}><FileSpreadsheet /><div><strong>{u.filename}</strong><small>{minute(u.created_at)} · 신규 {u.inserted_count} · 갱신 {u.updated_count}</small></div><button disabled={busy || u.status !== "APPLIED"} onClick={() => { if (!window.confirm(u.legacy_baseline ? `${u.filename}의 현재 거래를 목록에서 제거할까요? 제거한 거래에서 복원할 수 있습니다.` : `${u.filename} 업로드의 신규·갱신 내역을 되돌릴까요?`)) return; void act(async () => { const r = await api<{ count: number }>(`/accounting/card-uploads/${u.id}/rollback`, { method: "POST" }); return `${r.count}건을 되돌렸습니다.`; }); }}><Undo2 />{u.status === "APPLIED" ? (u.legacy_baseline ? "파일 내역 제거" : "전체 되돌리기") : "되돌림 완료"}</button></div>)}{uploads.data?.length === 0 && <p>이력 기능 적용 후 업로드한 파일이 없습니다. 이전 거래는 목록에서 개별 제거할 수 있습니다.</p>}
          <h3><Trash2 />제거한 거래</h3>{removed.isError && <p className="error">{removed.error.message}</p>}{removed.data?.map(r => <div className="upload-history-row" key={r.id}><CreditCard /><div><strong>{r.merchant_name}</strong><small>{r.alias} · {r.approval_date} · {money(r.net_approval_amount)}</small></div><button disabled={busy} onClick={() => void act(async () => { await api(`/accounting/card-transactions/${r.id}/restore`, { method: "POST" }); return "거래를 복원했습니다."; })}><Undo2 />복원</button></div>)}{removed.data?.length === 0 && <p>제거한 거래가 없습니다.</p>}
        </section>}
        {transactions.isError && <p role="alert" className="error">{transactions.error.message}</p>}{transactions.isFetching && enabled && <p role="status">조회 중…</p>}
        {transactions.data && validDates && <>
          <div className="accounting-totals"><span>{transactions.data.total.toLocaleString()}건</span>{bank ? <><span>입금 <strong className="money-in">{money(transactions.data.summary.depositAmount)}</strong></span><span>출금 <strong>{money(transactions.data.summary.withdrawAmount)}</strong></span></> : <span>취소 반영 합계 <strong>{money(transactions.data.summary.netAmount)}</strong></span>}</div>
          <div className="accounting-table-scroll"><table><thead><tr>{(bank ? ["거래일시", "계좌", "거래 내용", "입금", "출금", "잔액"] : ["사용일시", "카드", "가맹점", "승인번호", "순승인", "순매입", "상태", ...(management ? ["관리"] : [])]).map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{transactions.data.rows.map(r => <tr key={r.id}>{bank ? <><td>{minute(r.trans_at)}</td><td><div className="finance-table-source"><Mark code={r.bank_code} bank /><span>{r.bank_name}<small>{r.account_num_masked}</small></span></div></td><td className="finance-description">{r.description || r.counterparty_text || "—"}</td><td className="number money-in">{Number(r.deposit_amount) ? money(r.deposit_amount) : "—"}</td><td className="number">{Number(r.withdraw_amount) ? money(r.withdraw_amount) : "—"}</td><td className="number">{money(r.balance_after)}</td></> : <><td>{r.approval_date} {String(r.source_time ?? "").slice(0, 5)}</td><td><div className="finance-table-source"><Mark code={r.issuer} /><span>{r.alias}<small>{r.card_num_masked}</small></span></div></td><td className="finance-description">{r.merchant_name}</td><td>{r.approval_no}</td><td className="number">{money(r.net_approval_amount)}</td><td className="number">{money(r.net_purchase_amount)}</td><td><span className="finance-status">{r.approval_status}</span>{r.purchase_status && <small className="finance-subtext">{r.purchase_status}</small>}</td>{management && <td><button className="finance-remove" disabled={busy} onClick={() => { if (!window.confirm("이 거래를 목록에서 제거할까요? 제거한 거래에서 복원할 수 있습니다.")) return; void act(async () => { await api(`/accounting/card-transactions/${r.id}`, { method: "DELETE" }); return "거래를 제거했습니다. 관리 화면에서 복원할 수 있습니다."; }); }}><Trash2 />제거</button></td>}</>}</tr>)}</tbody></table>{!transactions.data.total && <div className="finance-empty">{bank ? <Landmark /> : <CreditCard />}<strong>조회 기간의 내역이 없습니다.</strong><span>{bank ? "수집 완료 후 자동으로 반영됩니다." : "카드사 엑셀을 업로드하면 여기에 표시됩니다."}</span>{!bank && <Link href="/accounting/cards/upload">엑셀 업로드 →</Link>}</div>}</div>
          {transactions.data.total > 50 && <div className="accounting-pagination"><button disabled={page <= 1 || busy} onClick={() => setPage(p => p - 1)}>이전</button><span>{page} / {Math.ceil(transactions.data.total / 50)}</span><button disabled={page * 50 >= transactions.data.total || busy} onClick={() => setPage(p => p + 1)}>다음</button></div>}
        </>}
      </>}
    </main></div></div>;
}

function CardUpload({ enabled }: { enabled: boolean }) {
  const [issuer, setIssuer] = useState("BC"); const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState<Preview | null>(null); const [saved, setSaved] = useState<Result | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const reset = () => { setPreview(null); setSaved(null); setError(""); };
  async function process(commit: boolean) { setBusy(true); setError(""); try { if (!file) throw new Error("파일을 선택해주세요."); if (file.size > 5 * 1024 * 1024) throw new Error("파일은 최대 5MB입니다."); const body = new FormData(); body.append("file", file); body.append("issuer", issuer); if (commit) { if (!preview) throw new Error("파일을 먼저 확인해주세요."); body.append("fileHash", preview.fileHash); setSaved(await api<Result>("/accounting/card-import/commit", { method: "POST", body })); setPreview(null); } else { setPreview(null); setPreview(await api<Preview>("/accounting/card-import/preview", { method: "POST", body })); } } catch (e) { setError(e instanceof Error ? e.message : "업로드에 실패했습니다."); } finally { setBusy(false); } }
  return <><Link className="accounting-back" href="/accounting/cards"><ArrowLeft />카드내역으로</Link><header className="accounting-section-head"><div><h2><Upload />카드 엑셀 업로드</h2><p>파일 선택 → 내용 확인 → 저장</p></div></header>
    {saved ? <div className="finance-upload-success"><Check /><h3>저장했습니다.</h3><p>{formatResult(saved)}</p><Link className="accounting-primary-link" href="/accounting/cards">카드내역 보기</Link><button onClick={() => { reset(); setFile(null); }}>다른 파일 올리기</button></div> : <>
      <div className="finance-upload-fields"><label>카드사<select disabled={busy} value={issuer} onChange={e => { setIssuer(e.target.value); reset(); }}><option value="BC">BC카드</option><option value="HANA">하나카드</option></select></label><label className="finance-file-picker"><FileSpreadsheet /><strong>{file?.name ?? "카드사에서 내려받은 엑셀을 선택하세요"}</strong><span>XLS / XLSX · 최대 5MB</span><input aria-label="승인내역 엑셀" type="file" accept=".xls,.xlsx" disabled={busy} onChange={e => { setFile(e.target.files?.[0] ?? null); reset(); }} /></label></div>
      {error && <p className="error" role="alert">{error}</p>}{busy && <p role="status">파일을 처리하는 중…</p>}
      {preview && <><div className="accounting-totals"><strong>전체 {preview.total}건</strong><span>{formatResult(preview)}</span><strong>{money(preview.netAmount)}</strong></div><p>처음 {preview.rows.length}건 미리보기입니다. 저장은 파일 전체에 적용됩니다.</p><div className="accounting-table-scroll"><table><thead><tr><th>카드</th><th>사용일</th><th>가맹점</th><th>금액</th><th>반영</th></tr></thead><tbody>{preview.rows.map((r, i) => <tr key={i}><td>{r.cardNumber}</td><td>{r.date}</td><td>{r.merchant}</td><td className="number">{money(r.amount)}</td><td>{({ NEW: "신규", UPDATE: "갱신", UNCHANGED: "중복" } as Record<string, string>)[r.status]}</td></tr>)}</tbody></table></div></>}
      <div className="finance-upload-actions"><button className="primary" disabled={!enabled || !file || busy} onClick={() => void process(!!preview)}>{preview ? <Check /> : <FileSpreadsheet />}{preview ? "확인한 내역 저장" : "파일 내용 확인"}</button></div>
    </>}
  </>;
}
