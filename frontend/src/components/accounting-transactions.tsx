"use client";
import { useState } from "react";
import { Landmark, CreditCard, RefreshCw, Upload, WalletCards, ReceiptText, Users, BarChart3 } from "lucide-react";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";

type Source = { id: number; alias: string; issuer?: string; account_num_masked?: string; card_num_masked?: string; active: boolean | number };
type Row = Record<string, string | number | null>;
type Transactions = { rows: Row[]; total: number; page: number; pageSize: number; summary: Record<string, string | number> };
type Result = { total: number; inserted: number; updated: number; unchanged: number };
type Preview = Result & { fileHash: string; issuer: string; netAmount: string | number; rows: { row: number; cardNumber: string; date: string; approvalNo: string; merchant: string; amount: number | string; status: string; approvalStatus: string }[] };
const money = (v: unknown) => v === null || v === undefined ? "—" : `${Number(v).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;
const labels: Record<string, string> = { NEW: "신규", UPDATE: "갱신", UNCHANGED: "중복·변경 없음" };
function today() { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date()); }

export function AccountingTransactions() {
  const [view, setView] = useState("bank");
  const [from, setFrom] = useState(() => `${today().slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);
  const [issuer, setIssuer] = useState("BC");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const status = useApiQuery<{ schemaReady: boolean; bankReady: boolean; environment: string }>("/accounting/status");
  const enabled = status.data?.schemaReady === true;
  const bank = view === "bank";
  const live = bank || view === "card";
  const accounts = useApiQuery<Source[]>("/accounting/bank-accounts", enabled);
  const cards = useApiQuery<Source[]>("/accounting/cards", enabled);
  const sources = bank ? accounts : cards;
  const validDates = !!from && !!to && to >= from && (Date.parse(to) - Date.parse(from)) / 86400000 < 200;
  const query = new URLSearchParams({ from, to, page: String(page), ...(source ? { source } : {}) });
  const transactions = useApiQuery<Transactions>(`/accounting/${bank ? "bank" : "card"}-transactions?${query}`, enabled && live && validDates);
  async function perform(action: () => Promise<string>) {
    setBusy(true); setError(""); setMessage("");
    try { setMessage(await action()); }
    catch (e) { setError(e instanceof Error ? e.message : "요청에 실패했습니다."); }
    finally { setBusy(false); }
  }
  const form = () => {
    if (!file) throw new Error("엑셀 파일을 선택해주세요.");
    if (file.size > 5 * 1024 * 1024) throw new Error("카드 엑셀은 최대 5MB까지 업로드할 수 있습니다.");
    const body = new FormData(); body.append("file", file); body.append("issuer", issuer); return body;
  };
  const resultMessage = (r: Result) => `총 ${r.total}건: 신규 ${r.inserted}건, 갱신 ${r.updated}건, 중복·변경 없음 ${r.unchanged}건`;
  const changeView = (value: string) => { setView(value); setSource(""); setPage(1); setError(""); setMessage(""); };
  const nav = [{ id: "bank", label: "계좌내역", icon: Landmark }, { id: "card", label: "카드내역", icon: CreditCard },
    { id: "cash", label: "자금계획", icon: WalletCards }, { id: "receivables", label: "매출·수금", icon: ReceiptText },
    { id: "expenses", label: "지출·미지급금", icon: ReceiptText }, { id: "payroll", label: "급여", icon: Users }, { id: "profit", label: "목표·손익", icon: BarChart3 }];
  return <div className="accounting-dashboard accounting-workspace">
    <div className="accounting-layout"><nav className="accounting-work-nav" aria-label="회계 업무 메뉴">{nav.map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => changeView(item.id)} disabled={busy}><span><Icon aria-hidden /></span><strong>{item.label}</strong></button>; })}</nav>
      <main className="accounting-work-main accounting-live">
        {status.isPending && <p role="status">회계 설정을 확인하는 중…</p>}
        {status.isError && <p role="alert" className="error">{status.error.message} <button onClick={() => void status.refetch()}>다시 시도</button></p>}
        {status.data && !enabled && <p role="alert">회계 DB 업데이트가 필요합니다. 서버 관리자에게 문의해주세요.</p>}
        {!live ? <section className="repair-panel"><h3>{nav.find(n => n.id === view)?.label}</h3><p>장부 작성과 관리 화면은 준비 중입니다. 계좌내역과 카드내역은 조회할 수 있습니다.</p></section> : <>
          <header className="accounting-section-head"><div><h2>{bank ? "계좌 입출금 내역" : "카드 승인내역"}</h2><p>{bank ? "바로빌에서 수집한 거래를 가져오고 저장된 내역을 조회합니다." : "BC·하나 승인내역을 검증한 후 저장합니다. 다시 올린 내역은 중복 등록되지 않습니다."}</p></div></header>
          {!bank && <section className="accounting-import-panel">
            <div className="form-grid"><label>카드사<select value={issuer} disabled={busy} onChange={e => { setIssuer(e.target.value); setPreview(null); setMessage(""); }}><option value="BC">BC카드</option><option value="HANA">하나카드</option></select></label><label>승인내역 엑셀<input type="file" accept=".xls,.xlsx" disabled={busy} onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setMessage(""); setError(""); }} /></label></div>
            <div className="page-actions"><button disabled={!enabled || !file || busy} onClick={() => void perform(async () => { setPreview(null); const p = await api<Preview>("/accounting/card-import/preview", { method: "POST", body: form() }); setPreview(p); return `${resultMessage(p)} · 파일 순승인 합계 ${money(p.netAmount)}`; })}><Upload aria-hidden /> 파일 검증</button><button className="primary" disabled={!preview || !enabled || busy} onClick={() => void perform(async () => { const body = form(); body.append("fileHash", preview!.fileHash); const r = await api<Result>("/accounting/card-import/commit", { method: "POST", body }); setPreview(null); setPage(1); return `저장했습니다. ${resultMessage(r)}`; })}>검증한 내역 저장</button></div>
            <small>최대 5MB · xls/xlsx · 카드번호가 마스킹된 카드사 승인내역</small>
          </section>}
          {busy && <p role="status">{bank ? "계좌 정보를 가져오는 중입니다. 잠시 기다려주세요…" : "엑셀을 처리하는 중입니다…"}</p>}
          {error && <p role="alert" className="error">{error}</p>}{message && <p role="status" className="accounting-result">{message}</p>}
          {preview && !bank && <section><h3>업로드 미리보기 {preview.total > 100 && "(처음 100건)"}</h3><div className="accounting-table-scroll"><table><thead><tr><th>행</th><th>카드</th><th>사용일</th><th>가맹점</th><th>순승인 금액</th><th>승인 상태</th><th>반영</th></tr></thead><tbody>{preview.rows.map((r, i) => <tr key={`${r.row}-${i}`}><td>{r.row}</td><td>{r.cardNumber}</td><td>{r.date}</td><td>{r.merchant}</td><td className="number">{money(r.amount)}</td><td>{r.approvalStatus}</td><td>{labels[r.status]}</td></tr>)}</tbody></table></div></section>}
          <div className="accounting-filters"><label>시작일<input type="date" value={from} disabled={busy} onChange={e => { setFrom(e.target.value); setPage(1); }} /></label><label>종료일<input type="date" value={to} disabled={busy} onChange={e => { setTo(e.target.value); setPage(1); }} /></label><label>{bank ? "계좌" : "카드"}<select aria-label={bank ? "계좌" : "카드"} value={source} disabled={busy} onChange={e => { setSource(e.target.value); setPage(1); }}><option value="">전체</option>{sources.data?.map(s => <option key={s.id} value={s.id}>{s.alias} · {s.account_num_masked ?? s.card_num_masked}</option>)}</select></label><button disabled={busy || !enabled || !validDates} onClick={() => void transactions.refetch()}><RefreshCw aria-hidden /> 조회</button></div>
          {bank && <section className="accounting-import-panel">
            {!status.data?.bankReady && enabled && <p>바로빌 연동 설정이 필요합니다. 저장된 계좌내역은 조회할 수 있습니다.</p>}
            {status.data?.environment === "test" && <p>바로빌 테스트 환경에 연결되어 있습니다.</p>}
            <div className="page-actions"><button disabled={!enabled || !status.data?.bankReady || busy} onClick={() => void perform(async () => { const r = await api<{ count: number; skippedForeign: number }>("/accounting/bank-accounts/refresh", { method: "POST" }); return `원화 계좌 ${r.count}개를 확인했습니다.${r.skippedForeign ? ` 외화 계좌 ${r.skippedForeign}개는 현재 지원하지 않습니다.` : ""}`; })}><RefreshCw aria-hidden /> 등록 계좌 가져오기</button>
              <button className="primary" disabled={!enabled || !status.data?.bankReady || !source || busy || !validDates} onClick={() => void perform(async () => { const r = await api<Result>("/accounting/bank-transactions/sync", { method: "POST", body: JSON.stringify({ accountId: Number(source), from, to }) }); setPage(1); return resultMessage(r); })}>선택 계좌 거래 가져오기</button></div>
            <small>바로빌이 신청한 주기대로 수집한 내역을 가져옵니다. office 자동 갱신은 아직 설정되지 않았습니다.</small>
          </section>}
          {!validDates && <p role="alert">시작일과 종료일을 200일 이내로 선택해주세요.</p>}
          {sources.isError && <p role="alert" className="error">{sources.error.message}</p>}
          {transactions.isError && <p role="alert" className="error">{transactions.error.message}</p>}
          {transactions.isFetching && validDates && enabled && <p role="status">거래내역을 조회하는 중…</p>}
          {transactions.data && validDates && <>
            <div className="accounting-totals"><span>조회 기간 전체 {transactions.data.total.toLocaleString()}건</span>{bank ? <><strong>입금 {money(transactions.data.summary.depositAmount)}</strong><strong>출금 {money(transactions.data.summary.withdrawAmount)}</strong></> : <strong>취소 반영 승인합계 {money(transactions.data.summary.netAmount)}</strong>}</div>
            <div className="accounting-table-scroll"><table><thead><tr>{(bank ? ["거래일시", "계좌", "적요", "입금", "출금", "거래 후 잔액"] : ["사용일시", "카드", "가맹점", "승인번호", "순승인 금액", "순매입 금액", "상태"]).map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{transactions.data.rows.map(r => <tr key={r.id}>{bank ? <><td>{String(r.trans_at).replace("T", " ")}</td><td>{r.alias}</td><td>{r.description || r.counterparty_text || "—"}</td><td className="number">{money(r.deposit_amount)}</td><td className="number">{money(r.withdraw_amount)}</td><td className="number">{money(r.balance_after)}</td></> : <><td>{r.approval_date} {r.source_time}</td><td>{r.alias}</td><td>{r.merchant_name}</td><td>{r.approval_no}</td><td className="number">{money(r.net_approval_amount)}</td><td className="number">{money(r.net_purchase_amount)}</td><td>{r.approval_status}{r.purchase_status ? ` · ${r.purchase_status}` : ""}</td></>}</tr>)}</tbody></table>{!transactions.data.total && <p className="empty">조회 기간에 저장된 내역이 없습니다. {bank ? "등록 계좌를 가져온 뒤 계좌를 선택해 거래를 가져오세요." : "카드사 엑셀을 업로드해주세요."}</p>}</div>
            <div className="accounting-pagination"><button disabled={page <= 1 || busy || transactions.isFetching} onClick={() => setPage(p => p - 1)}>이전</button><span>{page} / {Math.max(1, Math.ceil(transactions.data.total / 50))}</span><button disabled={page * 50 >= transactions.data.total || busy || transactions.isFetching} onClick={() => setPage(p => p + 1)}>다음</button></div>
          </>}
        </>}
      </main>
    </div>
  </div>;
}
