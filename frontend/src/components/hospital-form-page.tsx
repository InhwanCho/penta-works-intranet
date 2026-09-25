"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { ALargeSmall, ArrowLeft, Minus, Moon, Plus, Sun } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { usePreferences } from "@/components/preferences-provider";
import LoadingIndicator, { ButtonSpinner } from "@/components/loading-indicator";
import { RecordSidebar } from "@/components/record-navigation";

type Contact = { id?: number; name: string; phone: string };
type System = { id?: number; model: string; vendor: string; serial: string; tesla: string; swVersion: string; installDate: string };
type Hospital = Record<string, unknown> & { contacts?: unknown; systems?: unknown };
type Me = { role: "ADMIN" | "ACCOUNTING" | "USER" };

export default function HospitalFormPage() {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const editing = Boolean(params.id);
  const { dark, largeText, toggleDark, toggleLargeText } = usePreferences();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [mreyesSiteId, setMreyesSiteId] = useState("");
  const [region, setRegion] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [pmIntervalMonths, setPmIntervalMonths] = useState("6");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [systems, setSystems] = useState<System[]>([]);

  useEffect(() => {
    void Promise.all([api<Me>("/auth/me"), editing ? api<Hospital>(`/hospitals/${params.id}`) : Promise.resolve(null)])
      .then(([me, row]) => {
        if (me.role !== "ADMIN") { router.replace("/hospitals"); return; }
        if (row) {
          setName(String(row.name ?? "")); setCode(String(row.code ?? "")); setMreyesSiteId(String(row.mreyes_site_id ?? "")); setRegion(String(row.region ?? ""));
          setAddress(String(row.address ?? "")); setNotes(String(row.notes ?? "")); setPmIntervalMonths(String(row.pm_interval_months ?? 6));
          setContacts(readArray<Contact>(row.contacts)); setSystems(readArray<System>(row.systems));
        }
        setReady(true);
      }).catch((reason) => setError(reason instanceof Error ? reason.message : "병원 정보를 불러오지 못했습니다."));
  }, [editing, params.id, router]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const payload = { name, code, mreyesSiteId, region, address, notes, pmIntervalMonths: Number(pmIntervalMonths) || 6,
        contacts: contacts.filter((item) => item.name.trim() || item.phone.trim()),
        systems: systems.filter((item) => item.model.trim() || item.serial.trim() || item.vendor.trim()) };
      if (editing) await api(`/hospitals/${params.id}`, { method: "PUT", body: JSON.stringify(payload) });
      else {
        const saved = await api<{ id: number }>("/hospitals", { method: "POST", body: JSON.stringify(payload) });
        router.replace(`/hospitals/${saved.id}`); return;
      }
      router.replace(`/hospitals/${params.id}`);
    } catch (reason) { setBusy(false); setError(reason instanceof Error ? reason.message : "저장하지 못했습니다."); }
  }

  if (!ready) return <div className="shell record-shell"><RecordSidebar activeSection="hospitals" /><main className="record-main"><LoadingIndicator label="병원 정보를 준비하는 중" scope="workspace" /></main></div>;

  return <div className="shell record-shell"><RecordSidebar activeSection="hospitals" /><main className="write-page record-main">
    <header className="write-header"><button className="icon-button" onClick={() => router.back()} aria-label="뒤로 가기"><ArrowLeft /></button><button className="write-logo brand-lockup" onClick={() => router.push("/")}><Image src="/favicon/android-chrome-192x192.png" width={38} height={38} alt="" /><b>PENTA <small>OFFICE</small></b></button><div className="write-header-actions"><button className={`icon-button ${largeText ? "active" : ""}`} onClick={toggleLargeText} aria-label="큰 글씨 모드"><ALargeSmall /></button><button className="icon-button" onClick={toggleDark} aria-label={dark ? "라이트 모드" : "다크 모드"}>{dark ? <Sun /> : <Moon />}</button></div></header>
    <section className="write-wrap"><div className="write-title"><div><span>{editing ? "EDIT HOSPITAL" : "NEW HOSPITAL"}</span><h1>{editing ? "병원·장비 수정" : "병원·장비 등록"}</h1><p>병원 담당자와 설치 장비를 서비스 기록에서 함께 사용합니다.</p></div></div>
      <form className="write-form" onSubmit={submit}>
        <div className="form-section"><h2>병원 정보</h2><div className="form-grid"><label>병원명<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>관리 코드<input value={code} onChange={(event) => setCode(event.target.value)} placeholder="예: H-01" /></label><label>MREyes 사이트 ID<input value={mreyesSiteId} onChange={(event) => setMreyesSiteId(event.target.value)} placeholder="예: 006" maxLength={32} /></label><label>지역<input value={region} onChange={(event) => setRegion(event.target.value)} /></label><label>주소<input value={address} onChange={(event) => setAddress(event.target.value)} /></label><label>PM 주기(개월)<input type="number" min="1" value={pmIntervalMonths} onChange={(event) => setPmIntervalMonths(event.target.value)} /></label></div><label>메모<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div>
        <div className="form-section"><h2>담당자</h2>{contacts.map((contact, index) => <div className="form-grid hospital-repeat" key={index}><label>이름<input value={contact.name} onChange={(event) => setContacts(updateAt(contacts, index, { ...contact, name: event.target.value }))} /></label><label>연락처<input value={contact.phone} onChange={(event) => setContacts(updateAt(contacts, index, { ...contact, phone: event.target.value }))} /></label><button type="button" onClick={() => setContacts(removeAt(contacts, index))}><Minus /> 삭제</button></div>)}<button type="button" onClick={() => setContacts([...contacts, { name: "", phone: "" }])}><Plus /> 담당자 추가</button></div>
        <div className="form-section"><h2>설치 장비</h2>{systems.map((system, index) => <div className="form-grid hospital-system" key={index}><label>모델<input value={system.model} onChange={(event) => setSystems(updateAt(systems, index, { ...system, model: event.target.value }))} /></label><label>제조사<input value={system.vendor} onChange={(event) => setSystems(updateAt(systems, index, { ...system, vendor: event.target.value }))} /></label><label>시리얼<input value={system.serial} onChange={(event) => setSystems(updateAt(systems, index, { ...system, serial: event.target.value }))} /></label><label>자장(T)<input value={system.tesla} onChange={(event) => setSystems(updateAt(systems, index, { ...system, tesla: event.target.value }))} /></label><label>Software 버전<input value={system.swVersion} onChange={(event) => setSystems(updateAt(systems, index, { ...system, swVersion: event.target.value }))} /></label><label>설치일<input type="date" value={system.installDate} onChange={(event) => setSystems(updateAt(systems, index, { ...system, installDate: event.target.value }))} /></label><button type="button" onClick={() => setSystems(removeAt(systems, index))}><Minus /> 장비 삭제</button></div>)}<button type="button" onClick={() => setSystems([...systems, { model: "", vendor: "GE", serial: "", tesla: "", swVersion: "", installDate: "" }])}><Plus /> 장비 추가</button></div>
        {error && <div className="error">{error}</div>}<div className="write-actions"><button type="button" onClick={() => router.back()}>취소</button><button className="primary" disabled={busy}>{busy ? <><ButtonSpinner /> 저장 중…</> : "저장하기"}</button></div>
      </form>
    </section>
  </main></div>;
}

function readArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== "string" || !value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed as T[] : []; } catch { return []; }
}
function updateAt<T>(items: T[], index: number, value: T) { return items.map((item, current) => current === index ? value : item); }
function removeAt<T>(items: T[], index: number) { return items.filter((_, current) => current !== index); }
