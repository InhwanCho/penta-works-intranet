"use client";

import Link from "next/link";
import { CalendarDays, X, ChevronLeft, ChevronRight, ClipboardPlus, PackageCheck, Trash2, Wrench } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";
import { occursOnDay } from "@/lib/calendar-events";

type Due = { date: string; kind: string; label: string; hospitalId: number; hospitalName: string };
type Row = Record<string, string | number | boolean | null>;
type Payload = { due: Due[]; schedules: Row[]; records: Row[] };

export default function ServiceCalendar({ month: controlledMonth, onMonthChange, showOverview = true, initialDate }: { month?: string; onMonthChange?: (month: string) => void; showOverview?: boolean; initialDate?: string } = {}) {
  const today = localDate();
  const [ownMonth, setOwnMonth] = useState(today.slice(0, 7));
  const month = controlledMonth ?? ownMonth;
  function setMonth(value: string) { setOwnMonth(value); onMonthChange?.(value); }
  const dayDialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(initialDate || today);
  const [actionError, setActionError] = useState("");
  const [busyIds, setBusyIds] = useState<number[]>([]);
  const [showAllDue, setShowAllDue] = useState(false);
  const [showAllPrep, setShowAllPrep] = useState(false);
  const range = useMemo(() => calendarRange(month), [month]);
  const horizon = addDays(today, 45);
  const nearby = range[0] >= addDays(today, -62) && range[1] <= addDays(today, 107);
  const query = useApiQuery<Payload>(`/service-calendar?from=${nearby && today < range[0] ? today : range[0]}&to=${nearby && horizon > range[1] ? horizon : range[1]}`);
  const upcoming = useApiQuery<Payload>(`/service-calendar?from=${today}&to=${horizon}`, !nearby && showOverview);
  const prep = useApiQuery<Row[]>("/service-prep", showOverview);
  const office = useApiQuery<Row[]>(`/schedules?from=${range[0]}&to=${range[1]}`);
  const data = query.data ?? { due: [], schedules: [], records: [] };
  const cells = useMemo(() => datesBetween(range[0], range[1]), [range]);
  const selectedItems = dayItems(data, selected, office.data);
  const dueQuery = nearby ? query : upcoming;
  const upcomingDue = (dueQuery.data?.due ?? []).filter((item) => item.date >= today && item.date <= horizon);
  const prepRows = prep.data ?? [];
  async function changePrep(item: Row, remove = false) {
    const id = Number(item.id);
    if (busyIds.includes(id) || (remove && !window.confirm(`‘${item.text}’ 준비물을 삭제할까요?`))) return;
    setBusyIds((ids) => [...ids, id]); setActionError("");
    try { await api(`/service-prep/${id}`, remove ? { method: "DELETE" } : { method: "PATCH", body: JSON.stringify({ done: !item.done }) }); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : "준비물을 변경하지 못했습니다."); }
    finally { setBusyIds((ids) => ids.filter((value) => value !== id)); }
  }
  function move(delta: number) { const date = new Date(`${month}-01T00:00:00`); date.setMonth(date.getMonth() + delta); const next = dateString(date).slice(0, 7); setMonth(next); setSelected(`${next}-01`); }

  return <><section className="service-calendar-card">
    <header><div><span>업무 캘린더</span><h2><CalendarDays /> 통합 업무 일정</h2></div><div className="calendar-controls"><button onClick={() => move(-1)} aria-label="이전 달"><ChevronLeft /></button><input type="month" aria-label="일정 조회 월" value={month} onChange={event => { if (/^\d{4}-\d{2}$/.test(event.target.value)) { setMonth(event.target.value); setSelected(`${event.target.value}-01`); } }} /><button onClick={() => move(1)} aria-label="다음 달"><ChevronRight /></button><button onClick={() => { setMonth(today.slice(0,7)); setSelected(today); }}>오늘</button></div></header>
    <div className="calendar-legend"><span className="due">PM·ACR 예정</span><span className="schedule">서비스 방문</span><span className="office">개인·회사 일정</span><span className="record">서비스 기록</span></div>
    {office.isError && <p role="alert" className="error">일반 일정: {office.error.message} <button onClick={() => void office.refetch()}>다시 시도</button></p>}
    {query.isPending && <p className="calendar-empty" role="status">일정을 불러오는 중…</p>}{query.isError && <p className="error" role="alert">{query.error.message} <button onClick={() => void query.refetch()}>다시 시도</button></p>}<div className="service-calendar-grid" aria-busy={query.isFetching}><div className="calendar-weekdays">{["일","월","화","수","목","금","토"].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-days">{cells.map((date) => { const items = dayItems(data, date, office.data); const outside = date.slice(0,7) !== month; return <button key={date} aria-label={date + " · " + items.length + "건"} aria-haspopup="dialog" aria-pressed={date === selected} className={`${outside ? "outside" : ""} ${date === today ? "today" : ""} ${date === selected ? "selected" : ""}`} onClick={() => { setSelected(date); if (outside) setMonth(date.slice(0,7)); dayDialog.current?.showModal(); }}><b>{Number(date.slice(8))}</b><div>{items.slice(0,3).map((item, index) => <span className={`calendar-tag ${item.type}`} key={`${item.type}-${item.id}-${index}`}>{item.label}</span>)}{items.length > 3 && <small>+{items.length - 3}</small>}</div></button>; })}</div></div>
    <dialog ref={dayDialog} className="calendar-day-dialog" aria-labelledby="calendar-dialog-title" onClick={event => { if (event.target === event.currentTarget) { const rect=event.currentTarget.getBoundingClientRect(); if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom) event.currentTarget.close(); } }}>
      <header className="calendar-dialog-header"><div><span>{new Intl.DateTimeFormat("ko-KR",{year:"numeric",month:"long",day:"numeric",weekday:"long"}).format(new Date(`${selected}T12:00:00`))}</span><h2 id="calendar-dialog-title">선택한 날의 일정</h2></div><button type="button" autoFocus aria-label="일정 닫기" onClick={() => dayDialog.current?.close()}><X aria-hidden /></button></header>
    <div className="calendar-day-detail">
      <div className="calendar-day-title"><div className="calendar-day-actions"><Link href={`/write/schedules?date=${selected}`}><CalendarDays /> 일정 등록</Link><Link href={`/write/repairs?date=${selected}`}><ClipboardPlus /> 기록 작성</Link></div></div>
      {selectedItems.length ? <div className="calendar-day-items">{selectedItems.map((item, index) => <article className={`calendar-day-item ${item.type}`} key={`${item.type}-${item.id}-${index}`}>
        <Link className="calendar-item-main" href={itemHref(item, selected, showOverview)} onClick={() => dayDialog.current?.close()}><i className={item.type} /><div><strong>{item.label}</strong><span>{item.meta}</span></div><span className="calendar-item-action">{item.type === "record" ? <><Wrench /> 기록 보기</> : item.type === "office" ? <><CalendarDays /> 일정 관리</> : <><ClipboardPlus /> 기록 작성</>}</span></Link>
        {Boolean(item.hospitalId) && <Link className="calendar-hospital-link" href={`/hospitals/${item.hospitalId}`}>병원·방문 관리 <ChevronRight /></Link>}
      </article>)}</div> : <p className="calendar-empty">{(query.isPending || office.isPending) ? "일정을 불러오는 중…" : (query.isError || office.isError) ? "일정을 불러오지 못했습니다." : "등록된 일정이나 기록이 없습니다."}</p>}
    </div>
    </dialog>
  </section>{showOverview && <div className="service-dashboard-grid">
    <section className="service-overview-card"><header><div><span>앞으로 45일</span><h3>다가오는 PM·ACR</h3></div><strong>{dueQuery.isPending ? "—" : upcomingDue.length}건</strong></header><div className="service-due-list">{dueQuery.isPending && <p role="status">예정일을 불러오는 중…</p>}{dueQuery.isError && <p role="alert">{dueQuery.error.message} <button onClick={() => void dueQuery.refetch()}>다시 시도</button></p>}{(showAllDue ? upcomingDue : upcomingDue.slice(0, 5)).map((item) => <Link href={`/hospitals/${item.hospitalId}`} key={`${item.kind}-${item.hospitalId}-${item.date}`}><i className={item.kind === "PM" ? "pm" : "acr"} /><div><strong>{item.hospitalName}</strong><span>{item.label} · {item.date}</span></div><b>{dayDistance(today, item.date)}</b></Link>)}{!dueQuery.isPending && !dueQuery.isError && !upcomingDue.length && <p>45일 이내 예정된 PM·ACR이 없습니다.</p>}{upcomingDue.length > 5 && <button className="dashboard-more" onClick={() => setShowAllDue(!showAllDue)}>{showAllDue ? "접기" : `예정 전체 ${upcomingDue.length}건 보기`}</button>}</div></section>
    <section className="service-overview-card"><header><div><span>방문 전 확인</span><h3><PackageCheck /> 다음 방문 준비물</h3></div><strong>{prep.isPending ? "—" : prepRows.filter((item) => !item.done).length}건</strong></header><div className="service-prep-list">{prep.isPending && <p role="status">준비물을 불러오는 중…</p>}{prep.isError && <p role="alert">{prep.error.message} <button onClick={() => void prep.refetch()}>다시 시도</button></p>}{actionError && <p role="alert">{actionError}</p>}{(showAllPrep ? prepRows : prepRows.slice(0, 5)).map((item) => <article className={item.done ? "done" : ""} key={String(item.id)}><label className="prep-checkbox"><input type="checkbox" checked={Boolean(item.done)} aria-label={`${item.text} 준비 완료`} disabled={busyIds.includes(Number(item.id))} onChange={() => void changePrep(item)} /></label><Link href={`/hospitals/${item.hospital_id}`}><strong>{String(item.text)}</strong><span>{String(item.hospital_name)}</span></Link><button className="remove" aria-label="준비물 삭제" disabled={busyIds.includes(Number(item.id))} onClick={() => void changePrep(item, true)}><Trash2 /></button></article>)}{!prep.isPending && !prep.isError && !prepRows.length && <p>등록된 다음 방문 준비물이 없습니다.</p>}{prepRows.length > 5 && <button className="dashboard-more" onClick={() => setShowAllPrep(!showAllPrep)}>{showAllPrep ? "접기" : `준비물 전체 ${prepRows.length}건 보기`}</button>}</div></section>
  </div>}</>;
}

type CalendarDisplay = { type: "due" | "schedule" | "record" | "office"; id: string | number; label: string; meta: string; hospitalId?: number; kind?: string; note?: string };
function itemHref(item: CalendarDisplay, date: string, overview: boolean) {
  if (item.type === "record") return `/repairs/${item.id}`;
  if (item.type === "office") return overview ? `/schedules?date=${date}` : "#office-schedule-list";
  if (item.type === "schedule") return `/write/repairs?hospitalId=${item.hospitalId}&date=${date}&type=${item.kind}&note=${encodeURIComponent(item.note ?? "")}&scheduleId=${item.id}`;
  return `/write/repairs?hospitalId=${item.hospitalId}&date=${date}&type=${item.kind === "PM" ? "PM" : "ACR"}&acrKind=${item.kind === "ACR_FULL" ? "full" : "doc"}`;
}
function dayItems(data: Payload, date: string, office: Row[] = []): CalendarDisplay[] {
  const due = data.due.filter((item) => item.date === date).map((item) => ({ type: "due" as const, id: `${item.kind}-${item.hospitalId}`, label: item.hospitalName, meta: item.label, hospitalId: item.hospitalId, kind: item.kind }));
  const schedules = data.schedules.filter((item) => String(item.scheduled_date).slice(0,10) === date && item.status !== "COMPLETED").map((item) => ({ type: "schedule" as const, id: Number(item.id), label: String(item.hospital_name || "병원 미지정"), meta: `${serviceLabel(item.service_type)} 예정${item.note ? ` · ${item.note}` : ""}`, hospitalId: Number(item.hospital_id), kind: String(item.service_type), note: String(item.note ?? "") }));
  const records = data.records.filter((item) => String(item.work_date).slice(0,10) === date).map((item) => ({ type: "record" as const, id: Number(item.id), label: String(item.hospital_name || "병원 미지정"), meta: `${serviceLabel(item.service_type)} · ${item.title || "서비스 기록"}` }));
  const appointments = office.filter(item => occursOnDay(item.start_at, item.end_at, date)).map(item => ({ type: "office" as const, id: Number(item.id), label: String(item.title), meta: [item.type === "VACATION" ? "휴가" : item.type === "COMPANY" ? "회사 일정" : "개인 일정", item.all_day ? "종일" : String(item.start_at).slice(11,16) + " ~ " + String(item.end_at).slice(11,16), item.visibility === "PRIVATE" ? "나만 보기" : "전체 공개"].join(" · ") }));
  return [...due, ...schedules, ...appointments, ...records];
}
function serviceLabel(value: unknown) { return ({ PM:"PM",REPAIR:"고장수리",COLDHEAD:"Cold Head",ACR:"ACR",CALL:"Call",ETC:"기타" } as Record<string,string>)[String(value)] ?? String(value ?? "서비스"); }
function calendarRange(month: string): [string,string] { const first = new Date(`${month}-01T00:00:00`); const start = new Date(first); start.setDate(first.getDate() - first.getDay()); const end = new Date(start); end.setDate(start.getDate() + 41); return [dateString(start), dateString(end)]; }
function datesBetween(from: string, to: string) { const dates: string[] = []; const cursor = new Date(`${from}T00:00:00`); const end = new Date(`${to}T00:00:00`); while (cursor <= end) { dates.push(dateString(cursor)); cursor.setDate(cursor.getDate() + 1); } return dates; }
function dateString(date: Date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,10); }
function localDate() { return dateString(new Date()); }
function addDays(value: string, days: number) { const date = new Date(`${value}T00:00:00`); date.setDate(date.getDate() + days); return dateString(date); }
function dayDistance(from: string, to: string) { const days = Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000); return days < 0 ? `${Math.abs(days)}일 지남` : days === 0 ? "오늘" : `D-${days}`; }
