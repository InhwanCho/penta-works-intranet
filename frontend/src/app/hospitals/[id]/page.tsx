"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ALargeSmall, ArrowLeft, CalendarPlus, Check, MapPin, Minus, Moon, Pencil, Plus, Sun, Trash2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";
import { usePreferences } from "@/components/preferences-provider";
import LoadingIndicator from "@/components/loading-indicator";
import { RecordSidebar } from "@/components/record-navigation";

type Row = Record<string, string | number | boolean | null>;
type Me = { role: "ADMIN" | "ACCOUNTING" | "USER" };
type Contact = { name?: string; phone?: string };
type System = { model?: string; vendor?: string; serial?: string; tesla?: string; swVersion?: string; installDate?: string };

export default function HospitalDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { dark, largeText, toggleDark, toggleLargeText } = usePreferences();
  const hospital = useApiQuery<Row>(`/hospitals/${params.id}`);
  const repairs = useApiQuery<Row[]>("/repairs");
  const prep = useApiQuery<Row[]>(`/service-prep?hospitalId=${params.id}`);
  const schedules = useApiQuery<Row[]>(`/service-schedules?hospitalId=${params.id}`);
  const auth = useApiQuery<Me>("/auth/me");
  const [prepText, setPrepText] = useState("");
  const [scheduleDate, setScheduleDate] = useState(localDate());
  const [scheduleType, setScheduleType] = useState("PM");
  const [scheduleNote, setScheduleNote] = useState("");
  const [error, setError] = useState("");
  const row = hospital.data;
  const logs = useMemo(() => (repairs.data ?? []).filter((item) => Number(item.hospital_id) === Number(params.id)), [params.id, repairs.data]);

  async function addPrep(event: FormEvent) {
    event.preventDefault(); if (!prepText.trim()) return;
    try { await api("/service-prep", { method: "POST", body: JSON.stringify({ hospitalId: Number(params.id), text: prepText }) }); setPrepText(""); }
    catch (reason) { setError(message(reason)); }
  }
  async function togglePrep(item: Row) {
    try { await api(`/service-prep/${item.id}`, { method: "PATCH", body: JSON.stringify({ done: !item.done }) }); }
    catch (reason) { setError(message(reason)); }
  }
  async function removePrep(id: unknown) {
    try { await api(`/service-prep/${id}`, { method: "DELETE" }); }
    catch (reason) { setError(message(reason)); }
  }
  async function addSchedule(event: FormEvent) {
    event.preventDefault();
    try { await api("/service-schedules", { method: "POST", body: JSON.stringify({ hospitalId: Number(params.id), scheduledDate: scheduleDate, serviceType: scheduleType, note: scheduleNote }) }); setScheduleNote(""); }
    catch (reason) { setError(message(reason)); }
  }
  async function removeSchedule(id: unknown) {
    try { await api(`/service-schedules/${id}`, { method: "DELETE" }); }
    catch (reason) { setError(message(reason)); }
  }
  async function removeHospital() {
    if (!window.confirm("병원 정보를 목록에서 삭제할까요? 연결된 서비스 기록은 유지됩니다.")) return;
    try { await api(`/hospitals/${params.id}`, { method: "DELETE" }); router.replace("/hospitals"); }
    catch (reason) { setError(message(reason)); }
  }

  if (hospital.isLoading || !row || !auth.data) return <div className="shell record-shell"><RecordSidebar activeSection="hospitals" /><main className="record-main"><LoadingIndicator label="병원 정보를 불러오는 중" scope="workspace" /></main></div>;
  const contacts = readArray<Contact>(row.contacts_json);
  const systems = readArray<System>(row.systems_json);
  const admin = auth.data.role === "ADMIN";
  return <div className="shell record-shell"><RecordSidebar activeSection="hospitals" /><main className="detail-page record-main">
    <header className="write-header"><button className="icon-button" onClick={() => router.push("/hospitals")} aria-label="목록으로 돌아가기"><ArrowLeft /></button><button className="write-logo brand-lockup" onClick={() => router.push("/")}><Image src="/favicon/android-chrome-192x192.png" width={38} height={38} alt="" /><b>PENTA <small>OFFICE</small></b></button><div className="write-header-actions"><button className={`icon-button ${largeText ? "active" : ""}`} onClick={toggleLargeText} aria-label="큰 글씨 모드"><ALargeSmall /></button><button className="icon-button" onClick={toggleDark} aria-label={dark ? "라이트 모드" : "다크 모드"}>{dark ? <Sun /> : <Moon />}</button></div></header>
    <div className="detail-wrap hospital-detail-wrap">
      <div className="detail-heading"><div><span>병원·장비 {row.code ? `· ${row.code}` : ""}</span><h1>{String(row.name)}</h1><p><MapPin aria-hidden /> {String(row.address ?? row.region ?? "주소 미등록")}</p></div>{admin && <div className="detail-actions"><button onClick={() => router.push(`/edit/hospitals/${params.id}`)}><Pencil /> 수정</button><button className="danger" onClick={() => void removeHospital()}><Trash2 /> 삭제</button></div>}</div>
      {error && <div className="error">{error}</div>}
      <div className="hospital-grid">
        <section className="repair-panel"><h2>기본 정보</h2><dl className="repair-facts">{fact("지역", row.region)}{fact("주소", row.address)}{fact("PM 주기", `${row.pm_interval_months ?? 6}개월`)}{fact("메모", row.notes)}</dl></section>
        <section className="repair-panel"><h2>담당자</h2>{contacts.length ? <dl className="repair-facts">{contacts.map((contact, index) => fact(contact.name || `담당자 ${index + 1}`, contact.phone || "연락처 미등록"))}</dl> : <p className="text-muted">등록된 담당자가 없습니다.</p>}</section>
      </div>
      <section className="repair-panel hospital-section"><h2>설치 장비</h2>{systems.length ? <div className="hospital-equipment-grid">{systems.map((system, index) => <article key={index}><strong>{system.model || "모델 미등록"}</strong><span>{[system.vendor, system.tesla ? `${system.tesla}T` : "", system.serial].filter(Boolean).join(" · ") || "장비 상세 미등록"}</span><small>{[system.swVersion, system.installDate].filter(Boolean).join(" · ")}</small></article>)}</div> : <p className="text-muted">등록된 장비가 없습니다.</p>}</section>
      <div className="hospital-grid">
        <section className="repair-panel hospital-section"><h2>준비물</h2><form className="hospital-inline-form" onSubmit={addPrep}><input value={prepText} onChange={(event) => setPrepText(event.target.value)} placeholder="준비물 입력" /><button className="primary"><Plus /> 추가</button></form><div className="hospital-task-list">{(prep.data ?? []).map((item) => <div key={String(item.id)} className={item.done ? "done" : ""}><button onClick={() => void togglePrep(item)} aria-label={item.done ? "미완료로 변경" : "완료 처리"}><Check /></button><span>{String(item.text)}</span><button onClick={() => void removePrep(item.id)} aria-label="삭제"><Minus /></button></div>)}{!prep.data?.length && <p className="text-muted">등록된 준비물이 없습니다.</p>}</div></section>
        <section className="repair-panel hospital-section"><h2>서비스 일정</h2><form className="hospital-schedule-form" onSubmit={addSchedule}><input type="date" required value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} /><select value={scheduleType} onChange={(event) => setScheduleType(event.target.value)}><option value="PM">PM</option><option value="REPAIR">고장수리</option><option value="COLDHEAD">Cold Head</option><option value="ACR">ACR</option><option value="ETC">기타</option></select><input value={scheduleNote} onChange={(event) => setScheduleNote(event.target.value)} placeholder="메모" /><button className="primary"><CalendarPlus /> 등록</button></form><div className="hospital-schedule-list">{(schedules.data ?? []).map((item) => <div key={String(item.id)}><strong>{formatDate(item.scheduled_date)}</strong><span>{serviceLabel(item.service_type)}{item.note ? ` · ${item.note}` : ""}</span>{admin && <button onClick={() => void removeSchedule(item.id)} aria-label="일정 삭제"><Minus /></button>}</div>)}{!schedules.data?.length && <p className="text-muted">등록된 일정이 없습니다.</p>}</div></section>
      </div>
      <section className="repair-panel hospital-section"><div className="hospital-section-heading"><h2>서비스 기록</h2><Link className="primary" href={`/write/repairs?hospitalId=${params.id}`}>새 기록</Link></div>{logs.length ? <div className="hospital-log-list">{logs.map((log) => <Link href={`/repairs/${log.id}`} key={String(log.id)}><strong>{String(log.equipment_name)}</strong><span>{serviceLabel(log.service_type)} · {formatDate(log.work_date ?? log.written_at)}</span></Link>)}</div> : <p className="text-muted">연결된 서비스 기록이 없습니다.</p>}</section>
    </div>
  </main></div>;
}

function readArray<T>(value: unknown): T[] { if (Array.isArray(value)) return value as T[]; if (typeof value !== "string" || !value) return []; try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed as T[] : []; } catch { return []; } }
function fact(label: string, value: unknown) { return value ? <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div> : null; }
function formatDate(value: unknown) { const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/); return match ? `${match[1]}.${match[2]}.${match[3]}` : String(value ?? ""); }
function serviceLabel(value: unknown) { return ({ PM: "정기점검", REPAIR: "고장수리", COLDHEAD: "Cold Head", ACR: "ACR", INSTALL: "설치", ETC: "기타" } as Record<string, string>)[String(value)] ?? String(value ?? "기타"); }
function localDate() { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function message(reason: unknown) { return reason instanceof Error ? reason.message : "요청을 처리하지 못했습니다."; }
