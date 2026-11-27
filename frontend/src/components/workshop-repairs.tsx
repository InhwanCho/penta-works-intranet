"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TableColumnFilter, emptyColumnFilter } from "@/components/table-column-filter";
import { useApiQuery } from "@/lib/use-api-query";
import { workshopStatus, workshopStatusLabel, workshopStatuses, type WorkshopRepairRow } from "@/lib/workshop-repairs";

const statusOptions = Object.entries(workshopStatuses).map(([value, label]) => ({ value, label }));
const equipmentOrder = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });

export default function WorkshopRepairs() {
  const list = useApiQuery<WorkshopRepairRow[]>("/workshop-repairs");
  const [query, setQuery] = useState("");
  const [byEquipment, setByEquipment] = useState(false);
  const [equipment, setEquipment] = useState(emptyColumnFilter);
  const [hospital, setHospital] = useState(emptyColumnFilter);
  const [status, setStatus] = useState(emptyColumnFilter);
  const [date, setDate] = useState(emptyColumnFilter);

  const records = useMemo(() => (list.data ?? []).map(row => ({
    ...row,
    status: workshopStatus(row.status),
    work_date: row.work_date.slice(0, 10),
    summary: (row.description_markdown ?? "").replace(/\s+/g, " ").trim().slice(0, 320),
  })), [list.data]);
  const equipmentOptions = useMemo(() => Array.from(new Set(records.map(row => row.equipment_name)))
    .sort(equipmentOrder.compare)
    .map(name => ({ value: name, label: name })), [records]);
  const hospitalOptions = useMemo(() => Array.from(new Set(records.map(row => row.hospital_name ?? "")))
    .sort(equipmentOrder.compare)
    .map(name => ({ value: name, label: name || "미지정" })), [records]);
  const search = query.trim().toLowerCase();
  const filtered = records.filter(row => (
    (equipment.selected === null || equipment.selected.includes(row.equipment_name)) &&
    (hospital.selected === null || hospital.selected.includes(row.hospital_name ?? "")) &&
    (status.selected === null || status.selected.includes(row.status)) &&
    (!date.from || row.work_date >= date.from) &&
    (!date.to || row.work_date <= date.to) &&
    (`${row.equipment_name} ${row.hospital_name ?? ""} ${row.description_markdown ?? ""}`.toLowerCase().includes(search) || row.summary.toLowerCase().includes(search))
  )).sort((a, b) => {
    const byDate = date.sort === "asc" ? a.work_date.localeCompare(b.work_date) : b.work_date.localeCompare(a.work_date);
    return byDate || (date.sort === "asc" ? a.id - b.id : b.id - a.id);
  });
  const equipmentGroups = new Map<string, typeof filtered>();
  if (byEquipment) {
    for (const row of filtered) {
      const group = equipmentGroups.get(row.equipment_name);
      if (group) group.push(row);
      else equipmentGroups.set(row.equipment_name, [row]);
    }
  }
  const groups = equipmentGroups.size
    ? Array.from(equipmentGroups, ([name, rows]) => ({ name, rows }))
        .sort((a, b) => equipmentOrder.compare(a.name, b.name))
    : [{ name: null, rows: filtered }];
  const isFiltered = Boolean(search || equipment.selected !== null || hospital.selected !== null || status.selected !== null || date.from || date.to || date.sort);

  function resetFilters() {
    setQuery("");
    setEquipment(emptyColumnFilter);
    setHospital(emptyColumnFilter);
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
          <input type="search" aria-label="수리 기록 검색" placeholder="장비·부품명, 병원, 작업 내용 검색" value={query} onChange={event => setQuery(event.target.value)} />
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
                  <th scope="col"><TableColumnFilter label="병원" value={hospital} onChange={setHospital} options={hospitalOptions} /></th>
                  <th scope="col"><TableColumnFilter label="상태" value={status} onChange={setStatus} options={statusOptions} /></th>
                  <th scope="col" aria-sort={byEquipment ? undefined : date.sort === "asc" ? "ascending" : "descending"}>
                    <TableColumnFilter label="작업일" value={date} onChange={setDate} options={[]} dates />
                  </th>
                  <th scope="col">작성자</th>
                </tr>
              </thead>
              {groups.map(group => (
                <tbody key={group.name ?? "all-records"} className={group.name !== null ? "workshop-equipment-group" : undefined}>
                  {group.name !== null && <tr>
                    <th className="workshop-group-heading" scope="rowgroup" colSpan={5}>
                      {group.name}<small>{group.rows.length}건</small>
                    </th>
                  </tr>}
                  {group.rows.map(row => (
                    <tr key={row.id}>
                      <td className="workshop-table-equipment">
                        {group.name === null ? <>
                          <Link href={`/workshop-repairs/${row.id}`} className="workshop-record-link">{row.equipment_name}</Link>
                          {row.summary && <small>{row.summary}</small>}
                        </> : <Link
                          href={`/workshop-repairs/${row.id}`}
                          className="workshop-group-record"
                          aria-label={`${row.equipment_name} ${row.work_date} 기록 보기${row.summary ? ` · ${row.summary}` : ""}`}
                        >{row.summary || "기록 보기"}</Link>}
                      </td>
                      <td className="workshop-table-hospital">{row.hospital_name || "—"}</td>
                      <td><span className={`workshop-status status-${row.status}`}>{workshopStatusLabel(row.status)}</span></td>
                      <td><time dateTime={row.work_date}>{row.work_date}</time></td>
                      <td>{row.author_name}</td>
                    </tr>
                  ))}
                  {group.rows.length === 0 && <tr><td colSpan={5} className="workshop-empty">
                    {records.length ? "검색 조건에 맞는 수리 기록이 없습니다." : "등록된 수리 기록이 없습니다."}
                  </td></tr>}
                </tbody>
              ))}
            </table>
          </div>
        </>}
    </section>
  </div>;
}
