"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { ALargeSmall, ArrowLeft, Moon, Sun } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePreferences } from "@/components/preferences-provider";
import { api, upload } from "@/lib/api";

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
  pinned: boolean;
  savedAt: string;
};

const titles: Record<WriteSection, string> = { notices: "공지사항 작성", meetings: "회의록 작성", repairs: "수리 기록 작성", manuals: "업무 매뉴얼 작성" };
const emptyDraft = (): Draft => ({
  title: "", content: "", fileIds: [], location: "", participantIds: [], assigneeId: "", manualFileId: null, manualFileName: "", pinned: false,
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
        setDraft({ ...emptyDraft(), title: String(row.title ?? ""), content: String(row.content_markdown ?? row.description_markdown ?? ""), meetingAt: toLocalInput(row.meeting_at), location: String(row.location ?? ""), participantIds: String(row.participant_ids ?? "").split(",").filter(Boolean), assigneeId: String(row.assignee_id ?? ""), manualFileId: row.file_id ? Number(row.file_id) : null, manualFileName: String(row.original_name ?? ""), pinned: Boolean(row.pinned) });
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
      const method = editing ? "PUT" : "POST";
      const suffix = editing ? `/${params.id}` : "";
      if (section === "notices") await api(`/notices${suffix}`, { method, body: JSON.stringify({ title: draft.title, contentMarkdown: draft.content, pinned: draft.pinned, fileIds: draft.fileIds }) });
      if (section === "meetings") await api(`/meetings${suffix}`, { method, body: JSON.stringify({ title: draft.title, meetingAt: draft.meetingAt, contentMarkdown: draft.content, participantIds: draft.participantIds.map(Number), fileIds: draft.fileIds }) });
      if (section === "repairs") await api(`/repairs${suffix}`, { method, body: JSON.stringify({ title: draft.title, descriptionMarkdown: draft.content, location: draft.location, assigneeId: Number(draft.assigneeId) || null, fileIds: draft.fileIds }) });
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

  if (!valid || !me || !ready) return <main className="page-loader" aria-label="작성 화면을 불러오는 중"><div className="loader-mark"></div><div className="loader-line wide"></div><div className="loader-line"></div><div className="loader-card"></div></main>;

  return <main className="write-page">
    <header className="write-header">
      <button className="icon-button" onClick={() => router.back()} aria-label="뒤로 가기"><ArrowLeft /></button>
      <button className="write-logo brand-lockup" type="button" onClick={() => router.push("/")} aria-label="대시보드로 이동"><Image src="/favicon/android-chrome-192x192.png" width={38} height={38} alt="" priority /><b>PENTA <small>OFFICE</small></b></button>
      <div className="write-header-actions"><button className={`icon-button ${largeText ? "active" : ""}`} onClick={toggleLargeText} aria-label="큰 글씨 모드"><ALargeSmall /></button><button className="icon-button" onClick={toggleDark} aria-label={dark ? "라이트 모드" : "다크 모드"}>{dark ? <Sun /> : <Moon />}</button></div>
    </header>
    <section className="write-wrap">
      <div className="write-title"><div><span>{editing ? "EDIT RECORD" : "NEW RECORD"}</span><h1>{editing ? `${titles[section].replace("작성", "수정")}` : titles[section]}</h1><p>{editing ? "내용을 수정한 뒤 저장하세요." : "작성 내용은 이 브라우저에 계정별로 자동 임시저장됩니다."}</p></div></div>
      <form className="write-form" onSubmit={submit}>
        <label>제목<input required value={draft.title} onChange={(event) => update("title", event.target.value)} placeholder="제목을 입력하세요" /></label>
        {section === "notices" && <label className="pin-control"><input type="checkbox" checked={draft.pinned} onChange={(event) => update("pinned", event.target.checked)} /><span><strong>상단 고정</strong><small>중요 공지를 목록 가장 위에 표시합니다.</small></span></label>}
        {section === "meetings" && <><label>회의 일시<input type="datetime-local" required value={draft.meetingAt} onChange={(event) => update("meetingAt", event.target.value)} /></label><label>참여자<select multiple value={draft.participantIds} onChange={(event) => update("participantIds", Array.from(event.target.selectedOptions, (option) => option.value))}>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><small>기본값은 전체 참여자입니다. 여러 명은 Ctrl(Windows) 또는 Command(Mac)를 누른 채 선택하세요.</small></label></>}
        {section === "repairs" && <div className="form-grid"><label>위치<input value={draft.location} onChange={(event) => update("location", event.target.value)} /></label><label>담당자<select value={draft.assigneeId} onChange={(event) => update("assigneeId", event.target.value)}><option value="">미지정</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label></div>}
        {section === "manuals" ? <label>PDF 첨부파일<input type="file" accept="application/pdf" required={!editing && !draft.manualFileId} onChange={(event) => setManualFile(event.target.files?.[0] ?? null)} />{editing && draft.manualFileName && <small>현재 파일: {draft.manualFileName} · 새 파일을 선택하지 않으면 그대로 유지됩니다.</small>}</label> : <div className="editor-field"><span>내용</span><MarkdownEditor value={draft.content} onChange={(value) => update("content", value)} onUploaded={(id) => setDraft((old) => ({ ...old, fileIds: [...old.fileIds, id] }))} /></div>}
        {error && <div className="error">{error}</div>}
        <div className="write-actions"><button type="button" onClick={() => router.back()}>취소</button><button className="primary" disabled={busy}>{busy ? "저장 중…" : editing ? "수정 저장" : "등록하기"}</button></div>
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
