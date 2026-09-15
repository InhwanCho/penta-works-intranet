"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { ALargeSmall, ArrowLeft, Moon, Save, Sun } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePreferences } from "@/components/preferences-provider";
import { api } from "@/lib/api";

const MarkdownEditor = dynamic(() => import("@/components/markdown-editor"), { ssr: false });

type WriteSection = "notices" | "meetings" | "repairs";
type User = { id: number; login_id?: string; name: string };
type Draft = {
  title: string;
  content: string;
  fileIds: number[];
  meetingAt: string;
  location: string;
  participantIds: string[];
  decisions: string;
  assigneeId: string;
  pinned: boolean;
  savedAt: string;
};

const titles: Record<WriteSection, string> = { notices: "공지사항 작성", meetings: "회의록 작성", repairs: "수리 기록 작성" };
const emptyDraft = (): Draft => ({
  title: "", content: "", fileIds: [], location: "", participantIds: [], decisions: "", assigneeId: "", pinned: false,
  meetingAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16), savedAt: "",
});

export default function WritePage() {
  const params = useParams<{ section: string }>();
  const router = useRouter();
  const { dark, largeText, toggleDark, toggleLargeText } = usePreferences();
  const section = params.section as WriteSection;
  const valid = section in titles;
  const [me, setMe] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const draftKey = useMemo(() => me && valid ? `penta-office:draft:${me.id}:${section}` : "", [me, section, valid]);

  useEffect(() => {
    if (!valid) { router.replace("/"); return; }
    void Promise.all([api<User>("/auth/me"), api<User[]>("/users")]).then(([current, members]) => {
      setMe(current); setUsers(members);
    }).catch(() => router.replace("/login"));
  }, [router, valid]);

  useEffect(() => {
    if (!draftKey) return;
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try { setDraft({ ...emptyDraft(), ...(JSON.parse(saved) as Draft) }); }
      catch { localStorage.removeItem(draftKey); }
    }
    setReady(true);
  }, [draftKey]);

  useEffect(() => {
    if (!ready || !draftKey) return;
    const timer = window.setTimeout(() => {
      const next = { ...draft, savedAt: new Date().toISOString() };
      localStorage.setItem(draftKey, JSON.stringify(next));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft, draftKey, ready]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft((old) => ({ ...old, [key]: value })); }
  function saveNow() {
    if (!draftKey) return;
    const next = { ...draft, savedAt: new Date().toISOString() };
    localStorage.setItem(draftKey, JSON.stringify(next)); setDraft(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (section === "notices") await api("/notices", { method: "POST", body: JSON.stringify({ title: draft.title, contentMarkdown: draft.content, pinned: draft.pinned, fileIds: draft.fileIds }) });
      if (section === "meetings") await api("/meetings", { method: "POST", body: JSON.stringify({ title: draft.title, meetingAt: draft.meetingAt, location: draft.location, contentMarkdown: draft.content, decisionsMarkdown: draft.decisions, participantIds: draft.participantIds.map(Number), fileIds: draft.fileIds }) });
      if (section === "repairs") await api("/repairs", { method: "POST", body: JSON.stringify({ title: draft.title, descriptionMarkdown: draft.content, location: draft.location, assigneeId: Number(draft.assigneeId) || null, fileIds: draft.fileIds }) });
      localStorage.removeItem(draftKey);
      router.replace("/");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  if (!valid || !me || !ready) return <div className="loading-screen">PENTA OFFICE</div>;

  return <main className="write-page">
    <header className="write-header">
      <button className="icon-button" onClick={() => router.back()} aria-label="뒤로 가기"><ArrowLeft /></button>
      <button className="write-logo brand-lockup" type="button" onClick={() => router.push("/")} aria-label="대시보드로 이동"><Image src="/favicon/android-chrome-192x192.png" width={38} height={38} alt="" priority /><b>PENTA <small>OFFICE</small></b></button>
      <div className="write-header-actions"><button className={`icon-button ${largeText ? "active" : ""}`} onClick={toggleLargeText} aria-label="큰 글씨 모드"><ALargeSmall /></button><button className="icon-button" onClick={toggleDark} aria-label={dark ? "라이트 모드" : "다크 모드"}>{dark ? <Sun /> : <Moon />}</button></div>
    </header>
    <section className="write-wrap">
      <div className="write-title"><div><span>NEW RECORD</span><h1>{titles[section]}</h1><p>작성 내용은 이 브라우저에 계정별로 자동 임시저장됩니다.</p></div><button type="button" className="draft-button" onClick={saveNow}><Save /> 임시저장</button></div>
      <form className="write-form" onSubmit={submit}>
        <label>제목<input required value={draft.title} onChange={(event) => update("title", event.target.value)} placeholder="제목을 입력하세요" /></label>
        {section === "notices" && <label className="pin-control"><input type="checkbox" checked={draft.pinned} onChange={(event) => update("pinned", event.target.checked)} /><span><strong>상단 고정</strong><small>중요 공지를 목록 가장 위에 표시합니다.</small></span></label>}
        {section === "meetings" && <><div className="form-grid"><label>회의 일시<input type="datetime-local" required value={draft.meetingAt} onChange={(event) => update("meetingAt", event.target.value)} /></label><label>장소<input value={draft.location} onChange={(event) => update("location", event.target.value)} /></label></div><label>참여자<select multiple value={draft.participantIds} onChange={(event) => update("participantIds", Array.from(event.target.selectedOptions, (option) => option.value))}>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><small>여러 명은 Ctrl(Windows) 또는 Command(Mac)를 누른 채 선택하세요.</small></label></>}
        {section === "repairs" && <div className="form-grid"><label>위치<input value={draft.location} onChange={(event) => update("location", event.target.value)} /></label><label>담당자<select value={draft.assigneeId} onChange={(event) => update("assigneeId", event.target.value)}><option value="">미지정</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label></div>}
        <div className="editor-field"><span>내용</span><MarkdownEditor value={draft.content} onChange={(value) => update("content", value)} onUploaded={(id) => setDraft((old) => ({ ...old, fileIds: [...old.fileIds, id] }))} /></div>
        {section === "meetings" && <label>결정 사항<textarea rows={5} value={draft.decisions} onChange={(event) => update("decisions", event.target.value)} /></label>}
        {error && <div className="error">{error}</div>}
        <div className="write-actions"><button type="button" onClick={() => router.back()}>취소</button><button className="primary" disabled={busy}>{busy ? "등록 중…" : "등록하기"}</button></div>
      </form>
    </section>
  </main>;
}
