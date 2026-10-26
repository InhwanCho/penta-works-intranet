"use client";

import Link from "next/link";
import { ClipboardPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";

type Row = Record<string, string | number | boolean | null>;
const text = (row: Row, key: string) => String(row[key] ?? "");
const checked = (value: unknown) => value === true || value === 1 || value === "1";
const serviceTypes = { PM: "PM", REPAIR: "고장수리", COLDHEAD: "Cold Head", ACR: "ACR", CALL: "Call", ETC: "기타" };

export default function CalendarScheduleActions({ row, service, recordHref, onNavigate }: { row: Row; service: boolean; recordHref: string; onNavigate: () => void }) {
  const me = useApiQuery<{ id: number; role: string }>("/auth/me").data;
  const canEdit = me?.role === "ADMIN" || (!service && me?.id === Number(row.created_by));
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const endpoint = service ? "/service-schedules" : "/schedules";
  const label = text(row, service ? "hospital_name" : "title");
  useEffect(() => { if (editing) dialog.current?.showModal(); }, [editing]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  async function remove() {
    setOpen(false);
    if (busy || !window.confirm(`‘${label}’ 일정을 삭제할까요?`)) return;
    setBusy(true); setError("");
    try { await api(`${endpoint}/${row.id}`, { method: "DELETE" }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "일정을 삭제하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.currentTarget);
    const read = (key: string) => String(data.get(key) ?? "");
    setBusy(true); setError("");
    const body = service ? { hospitalId: Number(row.hospital_id), scheduledDate: read("date"), serviceType: read("serviceType"), note: read("note") }
      : { userId: row.user_id, title: read("title"), type: read("type"), visibility: read("visibility"), startAt: read("startAt"), endAt: read("endAt"), allDay: data.has("allDay"), descriptionMarkdown: read("description") };
    try { await api(`${endpoint}/${row.id}`, { method: "PUT", body: JSON.stringify(body) }); dialog.current?.close(); setEditing(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "일정을 수정하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <>
    <div className="calendar-schedule-actions" ref={menu} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
      <button ref={trigger} type="button" className="calendar-more-trigger" aria-label={`${label} 일정 메뉴`} aria-expanded={open} disabled={busy} onClick={() => setOpen(!open)}><MoreHorizontal aria-hidden /></button>
      {open && <div className="calendar-schedule-menu" aria-label={`${label} 일정 작업`}>
        {canEdit && <><button type="button" onClick={() => { setOpen(false); setError(""); setEditing(true); }}><Pencil aria-hidden />수정</button><button type="button" className="calendar-delete-action" onClick={() => void remove()}><Trash2 aria-hidden />삭제</button></>}
        <Link href={recordHref} onClick={() => { setOpen(false); onNavigate(); }}><ClipboardPlus aria-hidden />업무기록 작성</Link>
      </div>}
    </div>
    {error && !editing && <p className="error calendar-schedule-error" role="alert">{error}</p>}
    <dialog ref={dialog} className="managed-dialog calendar-schedule-editor" aria-label="일정 수정" onClose={() => setEditing(false)} onCancel={event => { if (busy) event.preventDefault(); }}>
      {editing && <form onSubmit={save}><h2>일정 수정</h2><fieldset disabled={busy} className="save-fieldset">
        {service ? <><p>{label}</p><label>방문일<input type="date" name="date" required defaultValue={text(row, "scheduled_date").slice(0, 10)} /></label><label>서비스 종류<select name="serviceType" defaultValue={text(row, "service_type")}>{Object.entries(serviceTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>내용<textarea name="note" defaultValue={text(row, "note")} /></label></>
          : <><label>제목<input name="title" required maxLength={200} defaultValue={text(row, "title")} /></label><label>구분<select name="type" defaultValue={text(row, "type")}><option value="PERSONAL">개인 일정</option><option value="VACATION">휴가</option><option value="COMPANY">회사 일정</option></select></label><label>공개 범위<select name="visibility" defaultValue={text(row, "visibility")}><option value="PUBLIC">전체 공개</option><option value="PRIVATE">나만 보기</option></select></label><label>시작<input name="startAt" type="datetime-local" required defaultValue={text(row, "start_at").replace(" ", "T").slice(0, 16)} /></label><label>종료<input name="endAt" type="datetime-local" required defaultValue={text(row, "end_at").replace(" ", "T").slice(0, 16)} /></label><label><input name="allDay" type="checkbox" defaultChecked={checked(row.all_day)} /> 종일</label><label>설명<textarea name="description" defaultValue={text(row, "description_markdown")} /></label></>}
        {error && <p className="error" role="alert">{error}</p>}<div className="managed-actions"><button type="button" onClick={() => dialog.current?.close()}>취소</button><button className="primary" type="submit">{busy ? "저장 중…" : "저장"}</button></div>
      </fieldset></form>}
    </dialog>
  </>;
}
