"use client";

import Link from "next/link";
import { CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardPlus, PackageCheck, Trash2, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";

type Due = { date: string; kind: string; label: string; hospitalId: number; hospitalName: string };
type Row = Record<string, string | number | boolean | null>;
type Payload = { due: Due[]; schedules: Row[]; records: Row[] };

export default function ServiceCalendar() {
  const today = localDate();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const range = useMemo(() => calendarRange(month), [month]);
  const query = useApiQuery<Payload>(`/service-calendar?from=${range[0]}&to=${range[1]}`);
  const upcoming = useApiQuery<Payload>(`/service-calendar?from=${today}&to=${addDays(today, 45)}`);
  const prep = useApiQuery<Row[]>("/service-prep");
  const data = query.data ?? { due: [], schedules: [], records: [] };
  const cells = useMemo(() => datesBetween(range[0], range[1]), [range]);
  const selectedItems = dayItems(data, selected);
  function move(delta: number) { const date = new Date(`${month}-01T00:00:00`); date.setMonth(date.getMonth() + delta); const next = dateString(date).slice(0, 7); setMonth(next); setSelected(`${next}-01`); }

  return <><section className="service-calendar-card">
    <header><div><span>SERVICE CALENDAR</span><h2><CalendarDays /> 현장 서비스 일정</h2><p>작성된 기록과 PM·ACR 예정일을 한 달력에서 확인합니다.</p></div><div className="calendar-controls"><button onClick={() => move(-1)} aria-label="이전 달"><ChevronLeft /></button><strong>{month.replace("-", ". ")}.</strong><button onClick={() => move(1)} aria-label="다음 달"><ChevronRight /></button><button onClick={() => { setMonth(today.slice(0,7)); setSelected(today); }}>오늘</button></div></header>
    <div className="service-calendar-grid"><div className="calendar-weekdays">{["일","월","화","수","목","금","토"].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-days">{cells.map((date) => { const items = dayItems(data, date); const outside = date.slice(0,7) !== month; return <button key={date} className={`${outside ? "outside" : ""} ${date === today ? "today" : ""} ${date === selected ? "selected" : ""}`} onClick={() => setSelected(date)}><b>{Number(date.slice(8))}</b><div>{items.slice(0,3).map((item, index) => <span className={`calendar-tag ${item.type}`} key={`${item.type}-${item.id}-${index}`}>{item.label}</span>)}{items.length > 3 && <small>+{items.length - 3}</small>}</div></button>; })}</div></div>
    <div className="calendar-day-detail"><div className="calendar-day-title"><div><span>{selected}</span><h3>선택한 날의 서비스</h3></div><Link href={`/write/repairs?date=${selected}`}><ClipboardPlus /> 기록 작성</Link></div>{selectedItems.length ? <div className="calendar-day-items">{selectedItems.map((item, index) => item.type === "record" ? <Link href={`/repairs/${item.id}`} key={`${item.type}-${item.id}-${index}`}><i className={item.type} /><div><strong>{item.label}</strong><span>{item.meta}</span></div><Wrench /></Link> : item.type === "schedule" ? <Link href={`/write/repairs?hospitalId=${item.hospitalId}&date=${selected}&type=${item.kind}&note=${encodeURIComponent(item.note ?? "")}&scheduleId=${item.id}`} key={`${item.type}-${item.id}-${index}`}><i className={item.type} /><div><strong>{item.label}</strong><span>{item.meta}</span></div><ClipboardPlus /></Link> : <Link href={`/write/repairs?hospitalId=${item.hospitalId}&date=${selected}&type=${item.kind === "PM" ? "PM" : "ACR"}&acrKind=${item.kind === "ACR_FULL" ? "full" : "doc"}`} key={`${item.type}-${item.id}-${index}`}><i className={item.type} /><div><strong>{item.label}</strong><span>{item.meta}</span></div><ClipboardPlus /></Link>)}</div> : <p className="calendar-empty">등록된 일정이나 기록이 없습니다.</p>}</div>
  </section><div className="service-dashboard-grid">
    <section className="service-overview-card"><header><div><span>NEXT 45 DAYS</span><h3>다가오는 PM·ACR</h3></div><strong>{upcoming.data?.due.length ?? 0}건</strong></header><div className="service-due-list">{(upcoming.data?.due ?? []).map((item) => <Link href={`/hospitals/${item.hospitalId}`} key={`${item.kind}-${item.hospitalId}-${item.date}`}><i className={item.kind === "PM" ? "pm" : "acr"} /><div><strong>{item.hospitalName}</strong><span>{item.label} · {item.date}</span></div><b>{dayDistance(today, item.date)}</b></Link>)}{!upcoming.data?.due.length && <p>45일 이내 예정된 PM·ACR이 없습니다.</p>}</div></section>
    <section className="service-overview-card"><header><div><span>NEXT VISIT</span><h3><PackageCheck /> 다음 방문 준비물</h3></div><strong>{(prep.data ?? []).filter((item) => !item.done).length}건</strong></header><div className="service-prep-list">{(prep.data ?? []).map((item) => <article className={item.done ? "done" : ""} key={String(item.id)}><button aria-label={item.done ? "준비물 완료 취소" : "준비물 완료"} onClick={async () => { await api(`/service-prep/${item.id}`, { method: "PATCH", body: JSON.stringify({ done: !item.done }) }); }}><Check /></button><Link href={`/hospitals/${item.hospital_id}`}><strong>{String(item.text)}</strong><span>{String(item.hospital_name)}</span></Link><button className="remove" aria-label="준비물 삭제" onClick={async () => { await api(`/service-prep/${item.id}`, { method: "DELETE" }); }}><Trash2 /></button></article>)}{!prep.data?.length && <p>등록된 다음 방문 준비물이 없습니다.</p>}</div></section>
  </div></>;
}

type CalendarDisplay = { type: "due" | "schedule" | "record"; id: string | number; label: string; meta: string; hospitalId?: number; kind?: string; note?: string };
function dayItems(data: Payload, date: string): CalendarDisplay[] {
  const due = data.due.filter((item) => item.date === date).map((item) => ({ type: "due" as const, id: `${item.kind}-${item.hospitalId}`, label: item.hospitalName, meta: item.label, hospitalId: item.hospitalId, kind: item.kind }));
  const schedules = data.schedules.filter((item) => String(item.scheduled_date).slice(0,10) === date && item.status !== "COMPLETED").map((item) => ({ type: "schedule" as const, id: Number(item.id), label: String(item.hospital_name), meta: `${serviceLabel(item.service_type)} 예정${item.note ? ` · ${item.note}` : ""}`, hospitalId: Number(item.hospital_id), kind: String(item.service_type), note: String(item.note ?? "") }));
  const records = data.records.filter((item) => String(item.work_date).slice(0,10) === date).map((item) => ({ type: "record" as const, id: Number(item.id), label: String(item.hospital_name), meta: `${serviceLabel(item.service_type)} · ${item.title}` }));
  return [...due, ...schedules, ...records];
}
function serviceLabel(value: unknown) { return ({ PM:"PM",REPAIR:"고장수리",COLDHEAD:"Cold Head",ACR:"ACR",CALL:"Call",ETC:"기타" } as Record<string,string>)[String(value)] ?? String(value ?? "서비스"); }
function calendarRange(month: string): [string,string] { const first = new Date(`${month}-01T00:00:00`); const start = new Date(first); start.setDate(first.getDate() - first.getDay()); const end = new Date(start); end.setDate(start.getDate() + 41); return [dateString(start), dateString(end)]; }
function datesBetween(from: string, to: string) { const dates: string[] = []; const cursor = new Date(`${from}T00:00:00`); const end = new Date(`${to}T00:00:00`); while (cursor <= end) { dates.push(dateString(cursor)); cursor.setDate(cursor.getDate() + 1); } return dates; }
function dateString(date: Date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,10); }
function localDate() { return dateString(new Date()); }
function addDays(value: string, days: number) { const date = new Date(`${value}T00:00:00`); date.setDate(date.getDate() + days); return dateString(date); }
function dayDistance(from: string, to: string) { const days = Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000); return days < 0 ? `${Math.abs(days)}일 지남` : days === 0 ? "오늘" : `D-${days}`; }
