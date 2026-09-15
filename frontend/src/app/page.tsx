"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { api, upload } from "@/lib/api";
import { usePreferences } from "@/components/preferences-provider";
import { ALargeSmall, Bell, BookOpenText, CalendarDays, Home, LogOut, Megaphone, Moon, NotebookTabs, Plus, Search, Settings, Sun, Wrench, type LucideIcon } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const MarkdownEditor = dynamic(() => import("@/components/markdown-editor"), { ssr: false });

type Row = Record<string, string | number | boolean | null>;
type User = { id: number; name: string; role: "ADMIN" | "USER"; login_id?: string; position?: string };
type Section = "home" | "notices" | "meetings" | "repairs" | "manuals" | "schedules" | "search" | "admin" | "emergency";

const nav: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "홈", icon: Home }, { id: "notices", label: "공지사항", icon: Megaphone },
  { id: "meetings", label: "회의록", icon: NotebookTabs }, { id: "repairs", label: "수리 기록", icon: Wrench },
  { id: "manuals", label: "업무 매뉴얼", icon: BookOpenText }, { id: "schedules", label: "일정", icon: CalendarDays },
];

const endpoint: Partial<Record<Section, string>> = {
  notices: "/notices", meetings: "/meetings", repairs: "/repairs", manuals: "/manuals",
};

export default function PortalPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { dark, largeText, toggleDark, toggleLargeText } = usePreferences();
  const [me, setMe] = useState<User | null>(null);
  const [section, setSection] = useState<Section>(() => sectionFromPath(pathname));
  const [rows, setRows] = useState<Row[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Row>({});
  const [notifications, setNotifications] = useState<Row[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (next: Section, searchQuery = "") => {
    setLoading(true);
    try {
      if (next === "home") setStats(await api<Row>("/dashboard"));
      else if (next === "schedules") {
        const now = new Date(); const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
        const to = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().slice(0, 10);
        setRows(await api<Row[]>(`/schedules?from=${from}&to=${to}`));
      } else if (next === "admin") setRows(await api<Row[]>("/admin/users"));
      else if (next === "emergency") setRows(await api<Row[]>("/admin/emergency-contacts"));
      else if (next === "search") setRows(await api<Row[]>(`/search?q=${encodeURIComponent(searchQuery)}`));
      else if (endpoint[next]) setRows(await api<Row[]>(endpoint[next]!));
      setNotifications(await api<Row[]>("/notifications"));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void api<User>("/auth/me").then(async (current) => {
      setMe(current); setUsers(await api<User[]>("/users"));
    }).catch(() => router.replace("/login"));
  }, [router]);

  useEffect(() => {
    if (!me) return;
    const next = sectionFromPath(pathname);
    const nextQuery = next === "search" ? new URLSearchParams(window.location.search).get("q") ?? "" : "";
    setSection(next); setShowForm(false);
    if (next === "search") setQuery(nextQuery);
    void load(next, nextQuery);
  }, [load, me, pathname]);

  async function go(next: Section) {
    const target = sectionPath(next);
    if (target === pathname) await load(next, next === "search" ? query : "");
    else router.push(target);
  }
  function create() {
    if (["notices", "meetings", "repairs"].includes(section)) router.push(`/write/${section}`);
    else setShowForm(true);
  }
  async function logout() { await api("/auth/logout", { method: "POST" }); router.replace("/login"); }
  async function search(event: FormEvent) {
    event.preventDefault(); if (!query.trim()) return;
    const nextQuery = query.trim();
    router.push(`/search?q=${encodeURIComponent(nextQuery)}`);
    setSection("search"); await load("search", nextQuery);
  }

  const unread = notifications.filter((item) => !item.read_at).length;
  const title = section === "home" ? "오늘도 좋은 하루예요" : section === "search" ? `“${query}” 검색 결과` :
    section === "admin" ? "구성원 관리" : section === "emergency" ? "비상연락망" : nav.find((item) => item.id === section)?.label;

  if (!me) return <div className="loading-screen">PENTA OFFICE</div>;

  return <div className="shell">
    <aside className="sidebar">
      <button className="logo" onClick={() => void go("home")}><Image className="brand-symbol" src="/favicon/android-chrome-192x192.png" width={42} height={42} alt="" priority /><b>PENTA <small>OFFICE</small></b></button>
      <nav>{nav.map((item) => { const Icon = item.icon; return <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => void go(item.id)}><Icon aria-hidden />{item.label}</button>; })}</nav>
      {me.role === "ADMIN" && <div className="nav-bottom"><span>관리</span><button className={["admin","emergency"].includes(section) ? "active" : ""} onClick={() => void go("admin")}><Settings aria-hidden />구성원·비상연락망</button></div>}
      <div className="profile"><div className="avatar">{me.name.slice(0, 1)}</div><div><strong>{me.name}</strong><small>{me.role === "ADMIN" ? "관리자" : "구성원"}</small></div><button onClick={logout} aria-label="로그아웃" title="로그아웃"><LogOut aria-hidden /></button></div>
    </aside>
    <main className="workspace">
      <header>
        <form className="search" onSubmit={search}><Search aria-hidden /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="회의록, 공지, 매뉴얼 검색" /><kbd>Enter</kbd></form>
        <div className="header-actions"><button className={`view-control ${largeText ? "active" : ""}`} onClick={toggleLargeText} aria-label="큰 글씨 모드" title="큰 글씨 모드"><ALargeSmall aria-hidden /></button><button className="view-control" onClick={toggleDark} aria-label={dark ? "라이트 모드" : "다크 모드"} title={dark ? "라이트 모드" : "다크 모드"}>{dark ? <Sun aria-hidden /> : <Moon aria-hidden />}</button><button className="bell" onClick={() => setShowNotifications(!showNotifications)} aria-label="알림"><Bell aria-hidden />{unread > 0 && <b>{unread}</b>}</button><div className="mini-avatar">{me.name.slice(0, 1)}</div></div>
        {showNotifications && <NotificationPanel rows={notifications} onRead={async (id) => { await api("/notifications/read", { method: "PATCH", body: JSON.stringify({ id }) }); await load(section); }} />}
      </header>
      <section className="content">
        <div className="page-head"><div><p>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(new Date())}</p><h1>{title}</h1></div><div className="page-actions">{section === "admin" && <button onClick={() => void go("emergency")}>비상연락망 보기</button>}{section === "emergency" && <button onClick={() => void go("admin")}>구성원 보기</button>}{!['home','search'].includes(section) && <button className="primary compact" onClick={create}><Plus aria-hidden /> 새로 만들기</button>}</div></div>
        {loading ? <SectionLoader /> : section === "home" ? <Dashboard stats={stats} notifications={notifications} onGo={go} onCreate={(target) => router.push(`/write/${target}`)} /> : <DataList section={section} rows={rows} onOpen={(target, id) => router.push(`/${target}/${id}`)} />}
      </section>
    </main>
    {showForm && <CreatePanel section={section} users={users} onClose={() => setShowForm(false)} onCreated={async () => { setShowForm(false); await load(section); }} />}
  </div>;
}

function Dashboard({ stats, notifications, onGo, onCreate }: { stats: Row; notifications: Row[]; onGo: (section: Section) => void; onCreate: (section: "meetings" | "repairs") => void }) {
  const cards = [
    ["공지사항", stats.notices ?? 0, "notices", "coral"], ["최근 회의록", stats.meetings ?? 0, "meetings", "blue"],
    ["처리할 수리", stats.openRepairs ?? 0, "repairs", "amber"], ["업무 매뉴얼", stats.manuals ?? 0, "manuals", "mint"],
  ] as const;
  return <><div className="welcome"><div><span>WORKSPACE</span><h2>필요한 업무 정보를<br />빠르게 찾아보세요.</h2><p>기록은 모이고, 업무는 더 선명해집니다.</p></div><div className="welcome-art"><i></i><b>P</b></div></div>
    <div className="stat-grid">{cards.map(([label, value, target, color]) => <button className={`stat ${color}`} key={label} onClick={() => void onGo(target)}><span>{label}</span><strong>{String(value)}</strong><small>바로가기 →</small></button>)}</div>
    <div className="home-grid"><section className="card"><div className="card-title"><h3>최근 알림</h3><span>{notifications.length}개</span></div>{notifications.slice(0, 5).map((n) => <div className="feed" key={String(n.id)}><i></i><div><strong>{String(n.title)}</strong><p>{String(n.message ?? "")}</p></div><time>{formatDate(n.created_at)}</time></div>)}{!notifications.length && <div className="empty slim">새 알림이 없습니다.</div>}</section><section className="card quick"><div className="card-title"><h3>빠른 작성</h3></div><button onClick={() => onCreate("meetings")}><span><Plus /></span>회의록 작성<b>→</b></button><button onClick={() => onCreate("repairs")}><span><Plus /></span>수리 접수<b>→</b></button><button onClick={() => void onGo("schedules")}><span><Plus /></span>일정 등록<b>→</b></button></section></div></>;
}

function DataList({ section, rows, onOpen }: { section: Section; rows: Row[]; onOpen: (section: "notices" | "meetings" | "repairs" | "manuals", id: number) => void }) {
  if (!rows.length) return <div className="empty big">아직 등록된 내용이 없습니다.</div>;
  return <div className="list-card">{rows.map((row) => { const target = detailTarget(section, row); return <article className={`list-row ${target ? "clickable" : ""}`} key={`${section}-${row.id ?? row.target_id}`} role={target ? "link" : undefined} tabIndex={target ? 0 : undefined} onClick={() => target && onOpen(target, Number(row.id ?? row.target_id))} onKeyDown={(event) => { if (target && (event.key === "Enter" || event.key === " ")) onOpen(target, Number(row.id ?? row.target_id)); }}>
    <div className="type-dot"></div><div className="list-main"><div><span className="pill">{labelFor(section, row)}</span><h3>{String(row.title ?? row.name ?? row.login_id ?? "")}</h3></div><p>{plain(String(row.content_markdown ?? row.description_markdown ?? row.message ?? row.email ?? ""))}</p><small>{metaFor(section, row)}</small></div>
    {section === "manuals" && <a className="download" onClick={(event) => event.stopPropagation()} href={`/api/v1/files/${row.file_id}/content?download=true`}>PDF 내려받기</a>}
  </article>; })}</div>;
}

function NotificationPanel({ rows, onRead }: { rows: Row[]; onRead: (id: number) => void }) {
  return <div className="notification-panel"><h3>알림</h3>{rows.slice(0, 8).map((row) => <button key={String(row.id)} className={row.read_at ? "read" : ""} onClick={() => void onRead(Number(row.id))}><strong>{String(row.title)}</strong><span>{String(row.message ?? "")}</span></button>)}{!rows.length && <p>새 알림이 없습니다.</p>}</div>;
}

function SectionLoader() { return <div className="section-loader" aria-label="데이터를 불러오는 중"><div className="loader-line wide"></div><div className="loader-line"></div><div className="loader-list">{[1,2,3].map((item) => <i key={item}></i>)}</div></div>; }

function CreatePanel({ section, users, onClose, onCreated }: { section: Section; users: User[]; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState(""); const [content, setContent] = useState(""); const [fileIds, setFileIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const now = useMemo(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget);
    try {
      if (section === "notices") await api("/notices", { method: "POST", body: JSON.stringify({ title, contentMarkdown: content, pinned: data.get("pinned") === "on", fileIds }) });
      if (section === "meetings") await api("/meetings", { method: "POST", body: JSON.stringify({ title, meetingAt: data.get("meetingAt"), location: data.get("location"), contentMarkdown: content, decisionsMarkdown: data.get("decisions"), participantIds: data.getAll("participants").map(Number), fileIds }) });
      if (section === "repairs") await api("/repairs", { method: "POST", body: JSON.stringify({ title, descriptionMarkdown: content, location: data.get("location"), assigneeId: Number(data.get("assigneeId")) || null, fileIds }) });
      if (section === "schedules") await api("/schedules", { method: "POST", body: JSON.stringify({ title, type: data.get("type"), descriptionMarkdown: data.get("description"), startAt: data.get("startAt"), endAt: data.get("endAt"), allDay: data.get("allDay") === "on", visibility: data.get("visibility"), userId: null }) });
      if (section === "manuals") {
        const file = (data.get("pdf") as File); const saved = await upload(file);
        await api("/manuals", { method: "POST", body: JSON.stringify({ title, descriptionMarkdown: data.get("description"), fileId: saved.id, changeNote: "최초 등록" }) });
      }
      if (section === "admin") await api("/admin/users", { method: "POST", body: JSON.stringify({ loginId: data.get("loginId"), password: data.get("password"), name: title, email: data.get("email"), phone: data.get("phone"), position: data.get("position"), role: data.get("role") }) });
      if (section === "emergency") await api("/admin/emergency-contacts", { method: "POST", body: JSON.stringify({ userId: Number(data.get("userId")), name: title, relationship: data.get("relationship"), phone: data.get("phone"), priority: Number(data.get("priority")) || 1, note: data.get("note") }) });
      await onCreated();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><aside className="create-panel"><div className="panel-head"><div><span>NEW RECORD</span><h2>{section === "admin" ? "새 구성원" : section === "emergency" ? "비상연락처 등록" : `${nav.find((n) => n.id === section)?.label ?? "항목"} 등록`}</h2></div><button onClick={onClose}>×</button></div><form onSubmit={submit}>
    <label>{section === "admin" ? "이름" : section === "emergency" ? "연락 대상 이름" : "제목"}<input required value={title} onChange={(e) => setTitle(e.target.value)} /></label>
    {section === "admin" && <div className="form-grid"><label>로그인 아이디<input name="loginId" required /></label><label>초기 비밀번호<input name="password" type="password" required minLength={10} /></label><label>이메일<input name="email" type="email" /></label><label>연락처<input name="phone" /></label><label>직책<input name="position" /></label><label>권한<select name="role"><option value="USER">일반 사용자</option><option value="ADMIN">관리자</option></select></label></div>}
    {section === "emergency" && <><div className="form-grid"><label>직원<select name="userId" required>{users.map((u) => <option value={u.id} key={u.id}>{u.name}</option>)}</select></label><label>관계<input name="relationship" placeholder="배우자, 부모 등" required /></label><label>전화번호<input name="phone" required /></label><label>연락 순서<input name="priority" type="number" min="1" defaultValue="1" required /></label></div><label>메모<textarea name="note" rows={4} /></label></>}
    {section === "meetings" && <><div className="form-grid"><label>회의 일시<input name="meetingAt" type="datetime-local" defaultValue={now} required /></label><label>장소<input name="location" /></label></div><label>참여자<select name="participants" multiple>{users.map((u) => <option value={u.id} key={u.id}>{u.name}</option>)}</select></label></>}
    {section === "repairs" && <div className="form-grid"><label>위치<input name="location" /></label><label>담당자<select name="assigneeId"><option value="">미지정</option>{users.map((u) => <option value={u.id} key={u.id}>{u.name}</option>)}</select></label></div>}
    {section === "schedules" && <><div className="form-grid"><label>구분<select name="type"><option value="PERSONAL">개인 일정</option><option value="VACATION">휴가</option><option value="COMPANY">회사 일정</option></select></label><label>공개 범위<select name="visibility"><option value="PUBLIC">전체 공개</option><option value="PRIVATE">나만 보기</option></select></label><label>시작<input name="startAt" type="datetime-local" defaultValue={now} required /></label><label>종료<input name="endAt" type="datetime-local" defaultValue={now} required /></label></div><label>설명<textarea name="description" rows={5} /></label><label className="check"><input name="allDay" type="checkbox" /> 종일 일정</label></>}
    {section === "manuals" && <><label>설명<textarea name="description" rows={5} /></label><label>PDF 파일<input name="pdf" type="file" accept="application/pdf" required /></label></>}
    {["notices","meetings","repairs"].includes(section) && <div className="editor-field"><span>내용</span><MarkdownEditor onChange={setContent} onUploaded={(id) => setFileIds((old) => [...old, id])} /></div>}
    {section === "notices" && <label className="check"><input name="pinned" type="checkbox" /> 상단 고정</label>}
    {section === "meetings" && <label>결정 사항<textarea name="decisions" rows={4} /></label>}
    {error && <div className="error">{error}</div>}<div className="panel-actions"><button type="button" onClick={onClose}>취소</button><button className="primary" disabled={busy}>{busy ? "저장 중…" : "저장하기"}</button></div>
  </form></aside></div>;
}

function labelFor(section: Section, row: Row) {
  if (section === "repairs") return ({ RECEIVED: "접수", IN_PROGRESS: "처리 중", COMPLETED: "완료" } as Record<string,string>)[String(row.status)] ?? row.status;
  if (section === "schedules") return ({ PERSONAL: "개인", VACATION: "휴가", COMPANY: "회사" } as Record<string,string>)[String(row.type)] ?? row.type;
  if (section === "admin") return row.role === "ADMIN" ? "관리자" : "구성원";
  if (section === "emergency") return String(row.relationship);
  return section === "search" ? String(row.target_type) : section === "manuals" ? String(row.category_name ?? "매뉴얼") : "기록";
}
function metaFor(section: Section, row: Row) {
  if (section === "meetings") return `${formatHour(row.meeting_at)} · ${row.participant_names ?? "참여자 없음"}`;
  if (section === "repairs") return `${row.requester_name} 요청 · ${row.assignee_name ?? "담당자 미지정"}`;
  if (section === "schedules") return `${formatDate(row.start_at)} ~ ${formatDate(row.end_at)} · ${row.user_name ?? "전체"}`;
  if (section === "admin") return `${row.position ?? "직책 미지정"} · ${row.email ?? "이메일 미등록"}`;
  if (section === "emergency") return `${row.user_name}의 비상연락처 · ${row.phone} · ${row.priority}순위`;
  return `${row.author_name ?? ""}${row.created_at ? ` · ${formatDate(row.created_at)}` : ""}`;
}
function plain(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return blockText(parsed).replace(/\s+/g, " ").trim().slice(0, 180);
  } catch { /* Legacy Markdown or HTML. */ }
  return value
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, " ")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_>`~-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}
function blockText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(blockText).join(" ");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (["image", "file", "video", "audio"].includes(String(record.type))) return "";
    return Object.entries(record).filter(([key]) => ["text", "content", "children"].includes(key)).map(([, item]) => blockText(item)).join(" ");
  }
  return "";
}
function detailTarget(section: Section, row: Row): "notices" | "meetings" | "repairs" | "manuals" | null {
  if (["notices", "meetings", "repairs", "manuals"].includes(section)) return section as "notices" | "meetings" | "repairs" | "manuals";
  if (section !== "search") return null;
  return ({ NOTICE: "notices", MEETING: "meetings", REPAIR: "repairs", MANUAL: "manuals" } as const)[String(row.target_type) as "NOTICE" | "MEETING" | "REPAIR" | "MANUAL"] ?? null;
}
function formatDate(value: unknown) { if (!value) return ""; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date); }
function formatHour(value: unknown) { if (!value) return ""; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", hourCycle: "h23" }).format(date); }
function sectionFromPath(pathname: string): Section {
  const segment = pathname.split("/").filter(Boolean)[0] as Section | undefined;
  return segment && ["notices", "meetings", "repairs", "manuals", "schedules", "search", "admin", "emergency"].includes(segment) ? segment : "home";
}
function sectionPath(section: Section) { return section === "home" ? "/" : `/${section}`; }
