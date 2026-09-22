"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ALargeSmall, ArrowLeft, CalendarPlus, Moon, Sun } from "lucide-react";
import { FormEvent, useState } from "react";
import { api } from "@/lib/api";
import { usePreferences } from "@/components/preferences-provider";
import { ButtonSpinner } from "@/components/loading-indicator";
import { RecordSidebar } from "@/components/record-navigation";

export default function ScheduleWritePage() {
  const router = useRouter();
  const { dark, largeText, toggleDark, toggleLargeText } = usePreferences();
  const start = roundToNextHour();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("PERSONAL");
  const [visibility, setVisibility] = useState("PUBLIC");
  const [startAt, setStartAt] = useState(start);
  const [endAt, setEndAt] = useState(addHour(start));
  const [allDay, setAllDay] = useState(false);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api("/schedules", { method: "POST", body: JSON.stringify({ title, type, visibility, startAt, endAt, allDay, descriptionMarkdown: description || null, userId: null }) });
      router.replace("/schedules");
    } catch (reason) {
      setBusy(false);
      setError(reason instanceof Error ? reason.message : "일정을 저장하지 못했습니다.");
    }
  }

  return <div className="shell record-shell"><RecordSidebar activeSection="schedules" /><main className="write-page record-main">
    <header className="write-header"><button className="icon-button" onClick={() => router.back()} aria-label="뒤로 가기"><ArrowLeft /></button><button className="write-logo brand-lockup" onClick={() => router.push("/")}><Image src="/favicon/android-chrome-192x192.png" width={38} height={38} alt="" /><b>PENTA <small>OFFICE</small></b></button><div className="write-header-actions"><button className={`icon-button ${largeText ? "active" : ""}`} onClick={toggleLargeText} aria-label="큰 글씨 모드"><ALargeSmall /></button><button className="icon-button" onClick={toggleDark} aria-label={dark ? "라이트 모드" : "다크 모드"}>{dark ? <Sun /> : <Moon />}</button></div></header>
    <section className="write-wrap"><div className="write-title"><div><span>NEW SCHEDULE</span><h1>새 일정</h1><p>개인 일정, 휴가 또는 회사 일정을 등록합니다.</p></div></div>
      <form className="write-form schedule-write-form" onSubmit={submit}>
        <label>일정 제목<input required autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="일정 제목을 입력하세요" /></label>
        <div className="form-section"><h2>일정 정보</h2><div className="form-grid"><label>구분<select value={type} onChange={(event) => setType(event.target.value)}><option value="PERSONAL">개인 일정</option><option value="VACATION">휴가</option><option value="COMPANY">회사 일정</option></select></label><label>공개 범위<select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="PUBLIC">전체 공개</option><option value="PRIVATE">나만 보기</option></select></label><label>시작<input type="datetime-local" required value={startAt} onChange={(event) => setStartAt(event.target.value)} /></label><label>종료<input type="datetime-local" required min={startAt} value={endAt} onChange={(event) => setEndAt(event.target.value)} /></label></div><label className="check"><input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} /> 종일 일정</label></div>
        <label>설명<textarea rows={8} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="장소나 준비사항 등 필요한 내용을 입력하세요." /></label>
        {error && <div className="error">{error}</div>}<div className="write-actions"><button type="button" onClick={() => router.back()}>취소</button><button className="primary" disabled={busy}>{busy ? <><ButtonSpinner /> 저장 중…</> : <><CalendarPlus /> 일정 등록</>}</button></div>
      </form>
    </section>
  </main></div>;
}

function roundToNextHour() { const date = new Date(); date.setMinutes(0, 0, 0); date.setHours(date.getHours() + 1); return localInput(date); }
function addHour(value: string) { const date = new Date(value); date.setHours(date.getHours() + 1); return localInput(date); }
function localInput(date: Date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
