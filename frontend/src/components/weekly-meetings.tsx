"use client";

import { useEffect, useRef, useState } from "react";
import { meetingHtml, meetingText, splitMeeting, meetingReportPeriod } from "@/lib/meeting-content";

type Row = Record<string, string | number | boolean | null>;
export function MeetingContent({ row }: { row: Row }) {
  return <div className="mreyes-meeting-detail">
    <p className="meeting-detail-toolbar">{String(row.meeting_at).replace("T", " ").slice(0,16)} · 작성 {String(row.author_name ?? "")}</p>
    <p className="meeting-period">지난주 보고 · {meetingReportPeriod(String(row.meeting_at))}</p>
    <article className="meeting-content" dangerouslySetInnerHTML={{ __html: meetingHtml(String(row.content_markdown ?? "")) }} />
    <p className="meeting-updated">최근 수정 {String(row.updated_by_name ?? "")} · {String(row.updated_at ?? "").replace("T", " ").slice(0,16)}</p>
  </div>;
}
export default function WeeklyMeetings({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else { dialog.current?.close(); trigger.current?.focus(); }
  }, [selected]);
  const filtered = rows.filter(row => `${row.title} ${meetingText(String(row.content_markdown ?? ""))} ${row.author_name}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="mreyes-meetings">
    <div className="meeting-directory-heading"><p className="text-muted">MREyes 회의록 · 읽기 전용</p><input type="search" aria-label="회의록 검색" placeholder="제목 · 내용 · 작성자 검색" value={search} onChange={event => setSearch(event.target.value)} /></div>
    <div className="meeting-list">{filtered.map(row => <button type="button" className="meeting-card" key={String(row.id)} aria-haspopup="dialog" onClick={event => { trigger.current = event.currentTarget; setSelected(row); }}>
      <div className="meeting-card-main"><h2>{String(row.title)}</h2>
        <div className="meeting-card-meta"><span>작성 {String(row.author_name ?? "")}</span><span className="meeting-card-period">지난주 보고 · {meetingReportPeriod(String(row.meeting_at))}</span></div>
        <p className="meeting-preview">{meetingText(splitMeeting(String(row.content_markdown ?? ""))[0]) || "지난주 진행 내용이 없습니다."}</p>
      </div>
    </button>)}{!filtered.length && <div className="empty big">{rows.length ? "검색에 맞는 회의록이 없습니다." : "등록된 회의록이 없습니다."}</div>}</div>
    <dialog ref={dialog} className="meeting-detail-dialog" aria-labelledby="meeting-dialog-title" onCancel={event => { event.preventDefault(); setSelected(null); }} onClick={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      {selected && <><header><h2 id="meeting-dialog-title">{String(selected.title)}</h2><button type="button" onClick={() => setSelected(null)} aria-label="회의록 닫기" autoFocus>닫기</button></header><MeetingContent row={rows.find(row => row.id === selected.id) ?? selected} /></>}
    </dialog>
  </div>;
}
