"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { cashMoney, type CashAccount } from "@/lib/cash-planning";

function newRow(date: string, direction: string, accountId: string) {
  return { requestKey: crypto.randomUUID(), plannedDate: date, direction, accountId, title: "", amount: "", memo: "", months: "1", monthEnd: "day", previousBusinessDay: "adjust" };
}
type Row = ReturnType<typeof newRow>;

export function BatchCashPlans({ date, direction, accountId, accounts, onSaved }: {
  date: string; direction: string; accountId: string; accounts: CashAccount[]; onSaved: (message: string) => void;
}) {
  const [rows, setRows] = useState(() => [newRow(date, direction || "OUT", accountId)]);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const count = rows.reduce((sum, row) => sum + Number(row.months), 0);
  const total = (direction: string) => rows.filter(row => row.direction === direction).reduce((sum, row) => sum + Number(row.amount) * Number(row.months), 0);
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
          months: Number(row.months), monthEnd: row.monthEnd === "end",
          previousBusinessDay: row.previousBusinessDay === "adjust", certainty: "ESTIMATED",
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
    if (count > 200) { setError("한 번에 최대 200회차까지 생성할 수 있습니다."); return; }
    const missing = rows.findIndex(row => !row.title.trim());
    if (missing >= 0) { setError(`${missing + 1}번째 계획의 항목명을 입력해주세요.`); return; }
    setError("");
    setReview(true);
  }}>
    <fieldset disabled={review || busy}>
      <div className="cash-table-scroll"><table className="cash-table cash-batch-table">
        <thead><tr>{["첫 기준일", "날짜 기준", "등록 기간", "휴일 조정", "구분", "항목명", "계좌", "금액 (원)", "메모", "행 관리"].map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={row.requestKey}>
          <td><input aria-label={`${i+1}번 예정일`} type="date" required min="2000-01-01" max="2100-12-31" value={row.plannedDate} onChange={e => update(row.requestKey, "plannedDate", e.target.value)} /></td>
          <td><select aria-label={`${i+1}번 날짜 기준`} value={row.monthEnd} onChange={e => update(row.requestKey, "monthEnd", e.target.value)}><option value="day">지정일</option><option value="end">말일</option></select></td>
          <td><select aria-label={`${i+1}번 등록 기간`} value={row.months} onChange={e => update(row.requestKey, "months", e.target.value)}>{Array.from({ length: 24 }, (_, n) => <option key={n+1} value={n+1}>{n+1}개월</option>)}</select></td>
          <td><select aria-label={`${i+1}번 휴일 조정`} value={row.previousBusinessDay} onChange={e => update(row.requestKey, "previousBusinessDay", e.target.value)}><option value="adjust">직전 영업일</option><option value="keep">날짜 유지</option></select></td>
          <td><select aria-label={`${i+1}번 구분`} value={row.direction} onChange={e => update(row.requestKey, "direction", e.target.value)}><option value="IN">입금</option><option value="OUT">출금</option></select></td>
          <td><input aria-label={`${i+1}번 항목명`} required maxLength={255} value={row.title} onChange={e => update(row.requestKey, "title", e.target.value)} /></td>
          <td><select aria-label={`${i+1}번 계좌`} value={row.accountId} onChange={e => update(row.requestKey, "accountId", e.target.value)}><option value="">미지정</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.alias}</option>)}</select></td>
          <td><input aria-label={`${i+1}번 금액`} required type="number" min="1" max="999999999999" step="1" value={row.amount} onChange={e => update(row.requestKey, "amount", e.target.value)} /></td>
          <td><input aria-label={`${i+1}번 메모`} maxLength={1000} value={row.memo} onChange={e => update(row.requestKey, "memo", e.target.value)} /></td>
          <td><button type="button" aria-label={`${i+1}번 행 삭제`} disabled={rows.length === 1} onClick={() => setRows(current => current.filter(item => item.requestKey !== row.requestKey))}>삭제</button></td>
        </tr>)}</tbody>
      </table></div>
      <button type="button" disabled={rows.length >= 50} onClick={() => setRows(current => {
        const last = current[current.length - 1];
        return [...current, newRow(last.plannedDate, last.direction, last.accountId)];
      })}>행 추가</button>
    </fieldset>
    <p><strong>생성 예정 {count}건</strong> · 입금 {cashMoney(total("IN"))} · 출금 {cashMoney(total("OUT"))}</p>
    {review && <p role="status">표의 날짜는 조정 전 기준일입니다. 공휴일 자동 조정은 2026~2027년에 적용됩니다.</p>}
    {error && <p role="alert" className="cash-error">{error}</p>}
    <footer>
      {review && <button type="button" disabled={busy} onClick={() => setReview(false)}>다시 수정</button>}
      <button className="cash-create" disabled={busy}>{busy ? "저장 중…" : review ? `${count}건 저장` : "등록 내용 확인"}</button>
    </footer>
  </form>;
}
