"use client";
import { useEffect, useRef, useState } from "react";
import { X, Link2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";
import { cashMoney as money, shiftDate } from "@/lib/cash-planning";

type BankRow = Record<string, string | number | null>;
export function BankTransferEditor({ row, onClose }: { row: BankRow; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const date = String(row.trans_at).slice(0, 10);
  const [from, setFrom] = useState(shiftDate(date, -3)); const [to, setTo] = useState(shiftDate(date, 3)); const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<BankRow | null>(null); const [fee, setFee] = useState("0"); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const isOut = Number(row.withdraw_amount) > 0;
  const valid = !!from && !!to && to >= from && (Date.parse(to) - Date.parse(from)) / 86400000 < 200;
  const status = useApiQuery<{ ready: boolean }>("/accounting/cash/status");
  const data = useApiQuery<{ rows: BankRow[]; total: number }>(`/accounting/bank-transactions?from=${from}&to=${to}&page=${page}`, valid && !row.linked_transaction_id);
  const candidates = data.data?.rows.filter(r => Number(r.bank_account_id) !== Number(row.bank_account_id) && !r.linked_transaction_id && ["NORMAL", "UNCLASSIFIED"].includes(String(r.classification)) && Number(isOut ? r.deposit_amount : r.withdraw_amount) > 0) ?? [];
  async function save(undo = false) { setBusy(true); setError(""); try { if (!undo && !selected) return; await api(undo ? `/accounting/cash/transfers/${row.id}/void` : "/accounting/cash/transfers", { method: "POST", ...(undo ? {} : { body: JSON.stringify({ withdrawalId: isOut ? row.id : selected!.id, depositId: isOut ? selected!.id : row.id, fee: Number(fee) }) }) }); onClose(); } catch (e) { setError(e instanceof Error ? e.message : "처리하지 못했습니다."); } finally { setBusy(false); } }
  return <dialog ref={ref} className="cash-dialog" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}><header><h2>은행 간 내부이체</h2><button disabled={busy} aria-label="닫기" onClick={onClose}><X /></button></header><div className="cash-match"><div className="cash-match-summary"><strong>{row.description || row.counterparty_text || "은행거래"}</strong><span>{row.alias} · {date} · {isOut ? "출금" : "입금"} {money(isOut ? row.withdraw_amount : row.deposit_amount)}</span><small>회사 소유 계좌 사이의 이체만 연결하세요. 원금은 외부 수입·지출에서 제외하고 수수료는 지출로 남깁니다.</small></div>
    {status.data && !status.data.ready && <p role="alert">자금계획 DB 업데이트가 필요합니다.</p>}{status.isError && <p role="alert">{status.error.message}</p>}
    {row.linked_transaction_id ? <><p>상대 거래 #{row.linked_transaction_id}와 내부이체로 연결되어 있습니다.</p><button disabled={busy || !status.data?.ready} onClick={() => { if (window.confirm("내부이체 연결을 해제할까요? 두 거래는 다시 미분류로 표시됩니다.")) void save(true); }}>이체 연결 해제</button></> : <>
      <div className="cash-list-filters"><label>상대 거래 시작일<input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); setSelected(null); }} /></label><label>상대 거래 종료일<input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); setSelected(null); }} /></label></div>
      {!valid && <p role="alert">조회 기간을 200일 이내로 선택해주세요.</p>}{data.isError && <p role="alert">{data.error.message}</p>}{data.isFetching && <p role="status">거래 조회 중…</p>}
      {valid && <><div className="cash-candidates">{candidates.map(c => <button key={c.id} disabled={busy} className={selected?.id === c.id ? "selected" : ""} aria-pressed={selected?.id === c.id} onClick={() => { setSelected(c); const difference = isOut ? Number(row.withdraw_amount) - Number(c.deposit_amount) : Number(c.withdraw_amount) - Number(row.deposit_amount); setFee(String(Math.max(0, difference))); }}><span>{c.description || c.counterparty_text || "은행거래"}<small>{c.alias} · {String(c.trans_at).replace("T", " ").slice(0, 16)}</small></span><strong>{money(isOut ? c.deposit_amount : c.withdraw_amount)}</strong></button>)}{!candidates.length && <p className="cash-muted">이 페이지에 연결 가능한 반대편 거래가 없습니다. 날짜나 다음 페이지를 확인해주세요.</p>}</div>{data.data && data.data.total > 50 && <div className="cash-actions"><button disabled={busy || page === 1} onClick={() => setPage(p => p - 1)}>이전</button><span>{page} / {Math.ceil(data.data.total / 50)}</span><button disabled={busy || page * 50 >= data.data.total} onClick={() => setPage(p => p + 1)}>다음</button></div>}</>}
      {selected && valid && <form className="cash-match-submit" onSubmit={e => { e.preventDefault(); void save(); }}><label>출금에 포함된 이체 수수료 (원)<input type="number" min="0" step="1" required value={fee} onChange={e => setFee(e.target.value)} /><small>금액 차이를 제안합니다. 원본 거래에서 확인해주세요.</small></label><button className="cash-create" disabled={busy || data.isFetching || !status.data?.ready}><Link2 />{busy ? "저장 중…" : "내부이체로 연결"}</button></form>}
    </>}{error && <p role="alert" className="cash-error">{error}</p>}</div></dialog>;
}
