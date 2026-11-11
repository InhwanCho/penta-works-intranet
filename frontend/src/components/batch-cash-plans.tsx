"use client";

import { PlanAmountInput, PlanChoice, PlanScheduleFields, planOccurrences } from "./cash-plan-fields";
import { useState } from "react";
import { api } from "@/lib/api";
import { cashMoney, type CashAccount } from "@/lib/cash-planning";

function newRow(date: string, direction: string, accountId: string) {
  return { requestKey: crypto.randomUUID(), plannedDate: date, direction, accountId, title: "", amount: "", memo: "", repeat: "once", endMonth: date.slice(0, 7), previousBusinessDay: true };
}
type Row = ReturnType<typeof newRow>;

export function BatchCashPlans({ date, direction, accountId, accounts, onSaved }: {
  date: string; direction: string; accountId: string; accounts: CashAccount[]; onSaved: (message: string) => void;
}) {
  const [rows, setRows] = useState(() => [newRow(date, direction || "OUT", accountId)]);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const count = rows.reduce((sum, row) => sum + planOccurrences(row), 0);
  const total = (direction: string) => rows.filter(row => row.direction === direction).reduce((sum, row) => sum + Number(row.amount) * planOccurrences(row), 0);
  function update(key: string, field: keyof Omit<Row, "requestKey">, value: string) {
    setRows(current => current.map(row => row.requestKey === key ? { ...row, [field]: value } : row));
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ count: number }>("/accounting/cash/plans/batch", {
        method: "POST",
        body: JSON.stringify(rows.map(row => ({
          ...row, title: row.title.trim(), amount: Number(row.amount), accountId: Number(row.accountId) || null,
          months: planOccurrences(row), monthEnd: row.repeat === "end",
          certainty: "ESTIMATED",
        }))),
      });
      onSaved(`${result.count}건의 계획을 등록했습니다.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "등록하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return <form className="cash-form cash-batch-form" aria-busy={busy} onSubmit={e => {
    e.preventDefault();
    if (review) { if (!busy) void save(); return; }
    if (rows.some(row => !Number.isInteger(planOccurrences(row)) || planOccurrences(row) < 1)) { setError("종료월을 확인해주세요."); return; }
    if (count > 200) { setError("한 번에 최대 200회차까지 생성할 수 있습니다."); return; }
    const missing = rows.findIndex(row => !row.title.trim());
    if (missing >= 0) { setError(`${missing + 1}번째 계획의 항목명을 입력해주세요.`); return; }
    setError("");
    setReview(true);
  }}>
    {review ? <ol className="cash-batch-review" aria-label="등록 내용">
      {rows.map(row => <li key={row.requestKey}>
        <strong>{row.title}</strong><b>{row.direction === "IN" ? "입금" : "출금"} {cashMoney(row.amount)}</b>
        <span>{row.repeat === "end" ? `${row.plannedDate.slice(0, 7)}부터 매월 말일` : row.plannedDate}
          {row.repeat !== "once" && ` ~ ${row.endMonth} · ${planOccurrences(row)}회`}</span>
        <span>{accounts.find(account => String(account.id) === row.accountId)?.alias ?? "계좌 미지정"}
          {row.previousBusinessDay && " · 휴일이면 직전 영업일"}</span>
        {row.memo && <span className="bank-user-memo">{row.memo}</span>}
      </li>)}
    </ol> : <fieldset disabled={busy} className="cash-batch-items">
      {rows.map((row, i) => <section key={row.requestKey} className="cash-batch-item" aria-label={`계획 ${i + 1}`}>
        <div className="cash-batch-item-head"><h3>계획 {i + 1}</h3>
          <button type="button" aria-label={`계획 ${i + 1} 삭제`} disabled={rows.length === 1}
            onClick={() => setRows(current => current.filter(item => item.requestKey !== row.requestKey))}>삭제</button>
        </div>
        <div className="cash-form-grid">
          <label>항목명<input required maxLength={255} value={row.title} onChange={e => update(row.requestKey, "title", e.target.value)} /></label>
          <label>예정금액 (원)<PlanAmountInput value={row.amount} onChange={v => update(row.requestKey, "amount", v)} /></label>
          <PlanChoice label="구분" value={row.direction} options={[["IN", "입금"], ["OUT", "출금"]]} onChange={v => update(row.requestKey, "direction", v)} />
          <PlanChoice label="입출금 계좌" value={row.accountId} options={[["", "미지정"], ...accounts.map(a => [String(a.id), a.alias] as [string, string])]} onChange={v => update(row.requestKey, "accountId", v)} />
          <div className="wide"><PlanScheduleFields value={row} onChange={schedule => setRows(current => current.map(item => item.requestKey === row.requestKey ? { ...item, ...schedule } : item))} /></div>
          <label className="wide">메모<input maxLength={1000} value={row.memo} onChange={e => update(row.requestKey, "memo", e.target.value)} /></label>
        </div>
      </section>)}
      <button type="button" disabled={rows.length >= 50} onClick={() => setRows(current => {
        const last = current[current.length - 1];
        return [...current, newRow(last.plannedDate, last.direction, last.accountId)];
      })}>+ 계획 추가</button>
    </fieldset>}
    <p className="cash-batch-total"><strong>생성 예정 {count}건</strong><span>입금 {cashMoney(total("IN"))}</span><span>출금 {cashMoney(total("OUT"))}</span></p>
    {review && <p role="status" className="cash-muted">예정일은 조정 전 기준입니다. 휴일 조정은 2030년까지 적용됩니다.</p>}
    {error && <p role="alert" className="cash-error">{error}</p>}
    <footer>
      {review && <button type="button" disabled={busy} onClick={() => setReview(false)}>다시 수정</button>}
      <button className="cash-create" disabled={busy}>{busy ? "저장 중…" : review ? `${count}건 저장` : "등록 내용 확인"}</button>
    </footer>
  </form>;
}
