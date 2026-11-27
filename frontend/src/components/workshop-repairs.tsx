"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TableColumnFilter, emptyColumnFilter } from "@/components/table-column-filter";
import { recordText } from "@/lib/record-text";
import { useApiQuery } from "@/lib/use-api-query";
import { workshopStatus, workshopStatusLabel, workshopStatuses, type WorkshopRepairRow } from "@/lib/workshop-repairs";

const statusOptions = Object.entries(workshopStatuses).map(([value, label]) => ({ value, label }));
const equipmentOrder = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });

export default function WorkshopRepairs() {
  const list = useApiQuery<WorkshopRepairRow[]>("/workshop-repairs");
  const [query, setQuery] = useState("");
  const [byEquipment, setByEquipment] = useState(false);
  const [equipment, setEquipment] = useState(emptyColumnFilter);
  const [status, setStatus] = useState(emptyColumnFilter);
  const [date, setDate] = useState(emptyColumnFilter);

  const records = useMemo(() => (list.data ?? []).map(row => ({
    ...row,
    status: workshopStatus(row.status),
    work_date: row.work_date.slice(0, 10),
    summary: recordText(row.description_markdown ?? ""),
  })), [list.data]);
  const equipmentOptions = useMemo(() => Array.from(new Set(records.map(row => row.equipment_name)))
    .sort(equipmentOrder.compare)
    .map(name => ({ value: name, label: name })), [records]);
  const search = query.trim().toLowerCase();
  const filtered = records.filter(row => (
    (equipment.selected === null || equipment.selected.includes(row.equipment_name)) &&
    (status.selected === null || status.selected.includes(row.status)) &&
    (!date.from || row.work_date >= date.from) &&
    (!date.to || row.work_date <= date.to) &&
    (`${row.equipment_name} ${row.description_markdown ?? ""}`.toLowerCase().includes(search) || row.summary.toLowerCase().includes(search))
  )).sort((a, b) => {
    const byName = byEquipment ? equipmentOrder.compare(a.equipment_name, b.equipment_name) : 0;
    const byDate = date.sort === "asc" ? a.work_date.localeCompare(b.work_date) : b.work_date.localeCompare(a.work_date);
    return byName || byDate || (date.sort === "asc" ? a.id - b.id : b.id - a.id);
  });
  const isFiltered = Boolean(search || equipment.selected !== null || status.selected !== null || date.from || date.to || date.sort);

  function resetFilters() {
    setQuery("");
    setEquipment(emptyColumnFilter);
    setStatus(emptyColumnFilter);
    setDate(emptyColumnFilter);
  }

  return <div className="work-log-wrap workshop-page">
    <header className="workshop-heading accounting-section-head">
      <h1>수리 기록</h1>
      <div className="cash-actions">
        <Link href="/workshop-repairs/new" className="cash-create">수리 기록 작성</Link>
      </div>
    </header>
    <section className="workshop-directory" aria-label="수리 기록 목록">
      <div className="review-toolbar accounting-filter-bar">
        <label>
          검색
          <input type="search" aria-label="수리 기록 검색" placeholder="장비·부품명, 작업 내용 검색" value={query} onChange={event => setQuery(event.target.value)} />
        </label>
      </div>
      <div className="review-tabs" role="group" aria-label="수리 기록 보기">
        <button type="button" aria-pressed={!byEquipment} onClick={() => setByEquipment(false)}>작업일순</button>
        <button type="button" aria-pressed={byEquipment} onClick={() => setByEquipment(true)}>장비·부품별</button>
        {isFiltered && <button type="button" onClick={resetFilters}>필터 초기화</button>}
      </div>
      {list.isPending ? <p role="status">불러오는 중…</p>
        : list.isError ? <p className="error" role="alert">{list.error.message}</p>
        : <>
          <div className="workshop-result-count" role="status">수리 기록 <strong>{filtered.length}</strong>건</div>
          <div className="cash-table-scroll" role="region" aria-label="수리 기록 표" tabIndex={0}>
            <table className="cash-table workshop-table">
              <thead>
                <tr>
                  <th scope="col"><TableColumnFilter label="장비·부품" value={equipment} onChange={setEquipment} options={equipmentOptions} /></th>
                  <th scope="col"><TableColumnFilter label="상태" value={status} onChange={setStatus} options={statusOptions} /></th>
                  <th scope="col" aria-sort={byEquipment ? undefined : date.sort === "asc" ? "ascending" : "descending"}>
                    <TableColumnFilter label="작업일" value={date} onChange={setDate} options={[]} dates />
                  </th>
                  <th scope="col">작성자</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.id}>
                    <td className="workshop-table-equipment">
                      <Link href={`/workshop-repairs/${row.id}`} className="workshop-record-link">{row.equipment_name}</Link>
                      {row.summary && <small>{row.summary}</small>}
                    </td>
                    <td><span className={`workshop-status status-${row.status}`}>{workshopStatusLabel(row.status)}</span></td>
                    <td><time dateTime={row.work_date}>{row.work_date}</time></td>
                    <td>{row.author_name}</td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={4} className="workshop-empty">
                  {records.length ? "검색 조건에 맞는 수리 기록이 없습니다." : "등록된 수리 기록이 없습니다."}
                </td></tr>}
              </tbody>
            </table>
          </div>
        </>}
    </section>
  </div>;
}
