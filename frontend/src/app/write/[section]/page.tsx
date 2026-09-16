"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { ALargeSmall, ArrowLeft, Moon, Sun } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePreferences } from "@/components/preferences-provider";
import { api, upload } from "@/lib/api";
import LoadingIndicator from "@/components/loading-indicator";

const MarkdownEditor = dynamic(() => import("@/components/markdown-editor"), { ssr: false });

type WriteSection = "notices" | "meetings" | "repairs" | "manuals";
type User = { id: number; login_id?: string; name: string };
type Draft = {
  title: string;
  content: string;
  fileIds: number[];
  meetingAt: string;
  location: string;
  participantIds: string[];
  assigneeId: string;
  manualFileId: number | null;
  manualFileName: string;
  writtenAt: string;
  hospitalName: string;
  modelName: string;
  serviceType: string;
  contractType: string;
  manufactureCountry: string;
  manufactureDate: string;
  manufacturer: string;
  workDate: string;
  workStartTime: string;
  workEndTime: string;
  travelMinutes: string;
  specialNotes: string;
  partsDetails: string;
  laborFee: string;
  partsFee: string;
  travelFee: string;
  totalFee: string;
  remarks: string;
  customerConfirmation: string;
  pinned: boolean;
  savedAt: string;
};

const titles: Record<WriteSection, string> = { notices: "공지사항 작성", meetings: "회의록 작성", repairs: "수리 기록 작성", manuals: "업무 매뉴얼 작성" };
const emptyDraft = (): Draft => ({
  title: "", content: "", fileIds: [], location: "", participantIds: [], assigneeId: "", manualFileId: null, manualFileName: "", pinned: false,
  writtenAt: localDate(), hospitalName: "", modelName: "", serviceType: "", contractType: "", manufactureCountry: "", manufactureDate: "", manufacturer: "",
  workDate: "", workStartTime: "", workEndTime: "", travelMinutes: "", specialNotes: "", partsDetails: "", laborFee: "", partsFee: "", travelFee: "", totalFee: "", remarks: "", customerConfirmation: "",
  meetingAt: currentMondayAtTen(), savedAt: "",
});

export default function WritePage() {
  const params = useParams<{ section: string; id?: string }>();
  const router = useRouter();
  const { dark, largeText, toggleDark, toggleLargeText } = usePreferences();
  const section = params.section as WriteSection;
  const valid = section in titles;
  const editing = Boolean(params.id);
  const [me, setMe] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [manualFile, setManualFile] = useState<File | null>(null);
  const draftKey = useMemo(() => me && valid && !editing ? `penta-office:draft:${me.id}:${section}` : "", [editing, me, section, valid]);

  useEffect(() => {
    if (!valid) { router.replace("/"); return; }
    void Promise.all([api<User>("/auth/me"), api<User[]>("/users")]).then(async ([current, members]) => {
      setMe(current); setUsers(members);
      if (editing) {
        const row = await api<Record<string, string | number | boolean | null>>(`/${section}/${params.id}`);
        setDraft({ ...emptyDraft(), title: String(row.title ?? row.equipment_name ?? ""), content: String(row.content_markdown ?? row.description_markdown ?? ""), meetingAt: toLocalInput(row.meeting_at), location: String(row.location ?? ""), participantIds: String(row.participant_ids ?? "").split(",").filter(Boolean), assigneeId: String(row.assignee_id ?? ""), manualFileId: row.file_id ? Number(row.file_id) : null, manualFileName: String(row.original_name ?? ""), pinned: Boolean(row.pinned), writtenAt: String(row.written_at ?? localDate()), hospitalName: String(row.hospital_name ?? ""), modelName: String(row.model_name ?? ""), serviceType: String(row.service_type ?? ""), contractType: String(row.contract_type ?? ""), manufactureCountry: String(row.manufacture_country ?? ""), manufactureDate: String(row.manufacture_date ?? ""), manufacturer: String(row.manufacturer ?? ""), workDate: String(row.work_date ?? ""), workStartTime: String(row.work_start_time ?? "").slice(0,5), workEndTime: String(row.work_end_time ?? "").slice(0,5), travelMinutes: String(row.travel_minutes ?? ""), specialNotes: String(row.special_notes ?? ""), partsDetails: String(row.parts_details ?? ""), laborFee: String(row.labor_fee ?? ""), partsFee: String(row.parts_fee ?? ""), travelFee: String(row.travel_fee ?? ""), totalFee: String(row.total_fee ?? ""), remarks: String(row.remarks ?? ""), customerConfirmation: String(row.customer_confirmation ?? "") });
        setReady(true);
      }
    }).catch(() => router.replace("/login"));
  }, [editing, params.id, router, section, valid]);

  useEffect(() => {
    if (!draftKey) return;
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try {
        const stored = JSON.parse(saved) as Draft;
        const untouchedMeeting = section === "meetings" && !stored.title && !stored.content && !stored.fileIds?.length;
        setDraft(untouchedMeeting ? { ...emptyDraft(), participantIds: users.map((user) => String(user.id)) } : { ...emptyDraft(), ...stored });
      }
      catch { localStorage.removeItem(draftKey); }
    } else if (section === "meetings") setDraft((old) => ({ ...old, participantIds: users.map((user) => String(user.id)) }));
    setReady(true);
  }, [draftKey, section, users]);

  useEffect(() => {
    if (!ready || !draftKey) return;
    const timer = window.setTimeout(() => {
      const next = { ...draft, savedAt: new Date().toISOString() };
      localStorage.setItem(draftKey, JSON.stringify(next));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft, draftKey, ready]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft((old) => ({ ...old, [key]: value })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (section === "repairs" && !draft.content.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim()) throw new Error("수리 내용을 입력하세요.");
      const method = editing ? "PUT" : "POST";
      const suffix = editing ? `/${params.id}` : "";
      if (section === "notices") await api(`/notices${suffix}`, { method, body: JSON.stringify({ title: draft.title, contentMarkdown: draft.content, pinned: draft.pinned, fileIds: draft.fileIds }) });
      if (section === "meetings") await api(`/meetings${suffix}`, { method, body: JSON.stringify({ title: draft.title, meetingAt: draft.meetingAt, contentMarkdown: draft.content, participantIds: draft.participantIds.map(Number), fileIds: draft.fileIds }) });
      if (section === "repairs") await api(`/repairs${suffix}`, { method, body: JSON.stringify({ equipmentName: draft.title, contentMarkdown: draft.content, writtenAt: draft.writtenAt, hospitalName: blank(draft.hospitalName), modelName: blank(draft.modelName), serviceType: blank(draft.serviceType), contractType: blank(draft.contractType), manufactureCountry: blank(draft.manufactureCountry), manufactureDate: blank(draft.manufactureDate), manufacturer: blank(draft.manufacturer), workDate: blank(draft.workDate), workStartTime: blank(draft.workStartTime), workEndTime: blank(draft.workEndTime), travelMinutes: numberOrNull(draft.travelMinutes), specialNotes: blank(draft.specialNotes), partsDetails: blank(draft.partsDetails), laborFee: numberOrNull(draft.laborFee), partsFee: numberOrNull(draft.partsFee), travelFee: numberOrNull(draft.travelFee), totalFee: numberOrNull(draft.totalFee), remarks: blank(draft.remarks), customerConfirmation: blank(draft.customerConfirmation), assigneeId: Number(draft.assigneeId) || null, fileIds: draft.fileIds }) });
      if (section === "manuals") {
        const saved = manualFile ? await upload(manualFile) : null;
        const fileId = saved?.id ?? draft.manualFileId;
        if (!fileId) throw new Error("PDF 파일을 선택하세요.");
        await api(`/manuals${suffix}`, { method, body: JSON.stringify({ title: draft.title, fileId }) });
      }
      localStorage.removeItem(draftKey);
      router.replace(editing ? `/${section}/${params.id}` : `/${section}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  if (!valid || !me || !ready) return <main className="page-loader"><LoadingIndicator label="작성 화면을 불러오는 중" /></main>;

  return <main className="write-page">
    <header className="write-header">
      <button className="icon-button" onClick={() => router.back()} aria-label="뒤로 가기"><ArrowLeft /></button>
      <button className="write-logo brand-lockup" type="button" onClick={() => router.push("/")} aria-label="대시보드로 이동"><Image src="/favicon/android-chrome-192x192.png" width={38} height={38} alt="" priority /><b>PENTA <small>OFFICE</small></b></button>
      <div className="write-header-actions"><button className={`icon-button ${largeText ? "active" : ""}`} onClick={toggleLargeText} aria-label="큰 글씨 모드"><ALargeSmall /></button><button className="icon-button" onClick={toggleDark} aria-label={dark ? "라이트 모드" : "다크 모드"}>{dark ? <Sun /> : <Moon />}</button></div>
    </header>
    <section className="write-wrap">
      <div className="write-title"><div><span>{editing ? "EDIT RECORD" : "NEW RECORD"}</span><h1>{editing ? `${titles[section].replace("작성", "수정")}` : titles[section]}</h1><p>{editing ? "내용을 수정한 뒤 저장하세요." : "작성 내용은 이 브라우저에 계정별로 자동 임시저장됩니다."}</p></div></div>
      <form className="write-form" onSubmit={submit}>
        <label>{section === "repairs" ? "장비명" : "제목"}<input required value={draft.title} onChange={(event) => update("title", event.target.value)} placeholder={section === "repairs" ? "장비명을 입력하세요" : "제목을 입력하세요"} /></label>
        {section === "notices" && <label className="pin-control"><input type="checkbox" checked={draft.pinned} onChange={(event) => update("pinned", event.target.checked)} /><span><strong>상단 고정</strong><small>중요 공지를 목록 가장 위에 표시합니다.</small></span></label>}
        {section === "meetings" && <><label>회의 일시<input type="datetime-local" required value={draft.meetingAt} onChange={(event) => update("meetingAt", event.target.value)} /></label><label>참여자<select multiple value={draft.participantIds} onChange={(event) => update("participantIds", Array.from(event.target.selectedOptions, (option) => option.value))}>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><small>기본값은 전체 참여자입니다. 여러 명은 Ctrl(Windows) 또는 Command(Mac)를 누른 채 선택하세요.</small></label></>}
        {section === "repairs" && <><div className="form-section"><h2>기본 정보</h2><div className="form-grid"><label>작성일<input type="date" required value={draft.writtenAt} onChange={(event) => update("writtenAt", event.target.value)} /></label><label>병원명<input value={draft.hospitalName} onChange={(event) => update("hospitalName", event.target.value)} /></label><label>형명·모델명<input value={draft.modelName} onChange={(event) => update("modelName", event.target.value)} /></label><label>담당자<select value={draft.assigneeId} onChange={(event) => update("assigneeId", event.target.value)}><option value="">미지정</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label>서비스 구분<select value={draft.serviceType} onChange={(event) => update("serviceType", event.target.value)}><option value="">선택 안 함</option><option>정기점검</option><option>고장수리</option><option>설치</option><option>기타</option></select></label><label>계약 구분<select value={draft.contractType} onChange={(event) => update("contractType", event.target.value)}><option value="">선택 안 함</option><option value="C">C</option><option value="W">W</option><option value="On-call">On-call</option></select></label><label>제조국<input value={draft.manufactureCountry} onChange={(event) => update("manufactureCountry", event.target.value)} /></label><label>제조사<input value={draft.manufacturer} onChange={(event) => update("manufacturer", event.target.value)} /></label><label>제조년월일<input type="date" value={draft.manufactureDate} onChange={(event) => update("manufactureDate", event.target.value)} /></label></div></div><div className="form-section"><h2>작업 정보</h2><div className="form-grid"><label>작업일<input type="date" value={draft.workDate} onChange={(event) => update("workDate", event.target.value)} /></label><label>작업 시작<input type="time" value={draft.workStartTime} onChange={(event) => update("workStartTime", event.target.value)} /></label><label>작업 종료<input type="time" value={draft.workEndTime} onChange={(event) => update("workEndTime", event.target.value)} /></label><label>교통시간(분)<input type="number" min="0" value={draft.travelMinutes} onChange={(event) => update("travelMinutes", event.target.value)} /></label></div><label>특기사항<textarea rows={3} value={draft.specialNotes} onChange={(event) => update("specialNotes", event.target.value)} /></label><label>부품 내역<textarea rows={4} placeholder="부품번호, 부품명, 수량, 단가, 금액 등을 입력하세요." value={draft.partsDetails} onChange={(event) => update("partsDetails", event.target.value)} /></label></div><div className="form-section"><h2>청구 및 확인</h2><div className="form-grid"><label>기술료<input type="number" min="0" step="0.01" value={draft.laborFee} onChange={(event) => update("laborFee", event.target.value)} /></label><label>부품비<input type="number" min="0" step="0.01" value={draft.partsFee} onChange={(event) => update("partsFee", event.target.value)} /></label><label>출장비<input type="number" min="0" step="0.01" value={draft.travelFee} onChange={(event) => update("travelFee", event.target.value)} /></label><label>합계<input type="number" min="0" step="0.01" value={draft.totalFee} onChange={(event) => update("totalFee", event.target.value)} /></label><label>고객 확인<input value={draft.customerConfirmation} onChange={(event) => update("customerConfirmation", event.target.value)} /></label></div><label>비고<textarea rows={3} value={draft.remarks} onChange={(event) => update("remarks", event.target.value)} /></label></div></>}
        {section === "manuals" ? <label>PDF 첨부파일<input type="file" accept="application/pdf" required={!editing && !draft.manualFileId} onChange={(event) => setManualFile(event.target.files?.[0] ?? null)} />{editing && draft.manualFileName && <small>현재 파일: {draft.manualFileName} · 새 파일을 선택하지 않으면 그대로 유지됩니다.</small>}</label> : <div className="editor-field"><span>내용</span><MarkdownEditor value={draft.content} onChange={(value) => update("content", value)} onUploaded={(id) => setDraft((old) => ({ ...old, fileIds: [...old.fileIds, id] }))} /></div>}
        {error && <div className="error">{error}</div>}
        <div className="write-actions"><button type="button" onClick={() => router.back()}>취소</button><button className="primary" disabled={busy}>{busy ? <><span className="button-spinner">⚙️</span> 저장 중…</> : editing ? "수정 저장" : "등록하기"}</button></div>
      </form>
    </section>
  </main>;
}

function toLocalInput(value: unknown) { if (!value) return emptyDraft().meetingAt; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value).slice(0, 16) : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function currentMondayAtTen() {
  const date = new Date();
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  date.setHours(10, 0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function localDate() { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function blank(value: string) { return value.trim() || null; }
function numberOrNull(value: string) { return value.trim() ? Number(value) : null; }
