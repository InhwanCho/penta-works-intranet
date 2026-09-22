"use client";

import Image from "next/image";
import { RepairList } from "@/components/repair-records";
import { recordText as plain } from "@/lib/record-text";
import { useApiQuery } from "@/lib/use-api-query";
import { api } from "@/lib/api";
import { usePreferences } from "@/components/preferences-provider";
import { ALargeSmall, Bell, BookOpenText, Building2, CalendarDays, Home, LogOut, Megaphone, Moon, NotebookTabs, Plus, Search, Settings, Sun, Wrench, type LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import LoadingIndicator, { ButtonSpinner } from "@/components/loading-indicator";

type Row = Record<string, string | number | boolean | null>;
type User = { id: number; name: string; role: "ADMIN" | "USER"; login_id?: string; position?: string };
type Section = "home" | "notices" | "meetings" | "hospitals" | "repairs" | "manuals" | "schedules" | "search" | "admin" | "emergency";

const nav: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "홈", icon: Home }, { id: "notices", label: "공지사항", icon: Megaphone },
  { id: "meetings", label: "회의록", icon: NotebookTabs }, { id: "hospitals", label: "병원·장비", icon: Building2 },
  { id: "repairs", label: "서비스 기록", icon: Wrench },
  { id: "manuals", label: "업무 매뉴얼", icon: BookOpenText }, { id: "schedules", label: "일정", icon: CalendarDays },
];

const endpoint: Partial<Record<Section, string>> = {
  notices: "/notices", meetings: "/meetings", hospitals: "/hospitals", repairs: "/repairs", manuals: "/manuals",
};

export default function PortalPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { dark, largeText, toggleDark, toggleLargeText } = usePreferences();
  const section = sectionFromPath(pathname);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const auth = useApiQuery<User>("/auth/me");
  const me = auth.data;
  const members = useApiQuery<User[]>("/users", Boolean(me));
  const users = members.data ?? [];
  const noticeQuery = useApiQuery<Row[]>("/notifications", Boolean(me));
  const notifications = noticeQuery.data ?? [];
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().slice(0, 10);
  const path = section === "home" ? "/dashboard" : section === "schedules" ? `/schedules?from=${from}&to=${to}` : section === "admin" ? "/admin/users" : section === "emergency" ? "/admin/emergency-contacts" : section === "search" ? `/search?q=${encodeURIComponent(searchQuery)}` : endpoint[section] ?? "/dashboard";
  const dataQuery = useApiQuery<Row | Row[]>(path, Boolean(me) && (section !== "search" || Boolean(searchQuery)));
  const rows = Array.isArray(dataQuery.data) ? dataQuery.data : [];
  const stats = !Array.isArray(dataQuery.data) ? dataQuery.data ?? {} : {};
  const loading = dataQuery.isLoading;
  async function load() { await dataQuery.refetch(); }
  useEffect(() => {
    setShowForm(false);
    if (section === "search") {
      const value = new URLSearchParams(window.location.search).get("q") ?? "";
      setQuery(value); setSearchQuery(value);
    }
  }, [pathname, section]);

  async function go(next: Section) {
    const target = sectionPath(next);
    if (target === pathname) await load();
    else router.push(target);
  }
  function create() {
    if (["notices", "meetings", "hospitals", "repairs", "manuals", "schedules"].includes(section)) router.push(`/write/${section}`);
    else setShowForm(true);
  }
  async function logout() { await api("/auth/logout", { method: "POST" }); router.replace("/login"); }
  async function search(event: FormEvent) {
    event.preventDefault(); if (!query.trim()) return;
    const nextQuery = query.trim();
    router.push(`/search?q=${encodeURIComponent(nextQuery)}`);
    setSearchQuery(nextQuery);
  }

  const unread = notifications.filter((item) => !item.read_at).length;
  const title = section === "home" ? "오늘도 좋은 하루예요" : section === "search" ? `“${query}” 검색 결과` :
    section === "admin" ? "구성원 관리" : section === "emergency" ? "비상연락망" : nav.find((item) => item.id === section)?.label;

  if (auth.isError) return <main className="detail-state"><p>{auth.error.message}</p><button onClick={() => void auth.refetch()}>다시 시도</button></main>;
  if (!me) return <div className="loading-screen"><LoadingIndicator label="업무 공간을 준비하는 중" /></div>;

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
        {showNotifications && <NotificationPanel rows={notifications} onRead={async (id) => { await api("/notifications/read", { method: "PATCH", body: JSON.stringify({ id }) }); }} />}
      </header>
      <section className="content">
        <div className="page-head"><div><p>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(new Date())}</p><h1>{title}</h1></div><div className="page-actions"><button onClick={() => void load()} disabled={dataQuery.isFetching}>새로고침</button>{section === "admin" && <button onClick={() => void go("emergency")}>비상연락망 보기</button>}{section === "emergency" && <button onClick={() => void go("admin")}>구성원 보기</button>}{!['home','search'].includes(section) && (section !== "hospitals" || me.role === "ADMIN") && <button className="primary compact" onClick={create}><Plus aria-hidden /> 새로 만들기</button>}</div></div>
        {dataQuery.isError && <div className="error" role="alert">{dataQuery.error.message} <button onClick={() => void load()}>다시 시도</button></div>}
        {dataQuery.isFetching && !loading && <div className="background-refresh" role="status">최신 내용을 확인하는 중…</div>}
        {loading ? <SectionLoader /> : section === "home" ? <Dashboard stats={stats} notifications={notifications} onGo={go} onCreate={(target) => router.push(`/write/${target}`)} /> : <DataList section={section} rows={rows} onOpen={(target, id) => router.push(`/${target}/${id}`)} />}
      </section>
    </main>
    {showForm && <CreatePanel section={section} users={users} onClose={() => setShowForm(false)} onCreated={async () => { setShowForm(false); }} />}
  </div>;
}

function Dashboard({ stats, notifications, onGo, onCreate }: { stats: Row; notifications: Row[]; onGo: (section: Section) => void; onCreate: (section: "meetings" | "repairs" | "schedules") => void }) {
  const cards = [
    ["공지사항", stats.notices ?? 0, "notices", "coral"], ["등록 병원", stats.hospitals ?? 0, "hospitals", "blue"],
    ["처리할 서비스", stats.openRepairs ?? 0, "repairs", "amber"], ["업무 매뉴얼", stats.manuals ?? 0, "manuals", "mint"],
  ] as const;
  return <><div className="welcome"><div><span>WORKSPACE</span><h2>필요한 업무 정보를<br />빠르게 찾아보세요.</h2><p>기록은 모이고, 업무는 더 선명해집니다.</p></div><div className="welcome-art"><i></i><b>P</b></div></div>
    <div className="stat-grid">{cards.map(([label, value, target, color]) => <button className={`stat ${color}`} key={label} onClick={() => void onGo(target)}><span>{label}</span><strong>{String(value)}</strong><small>바로가기 →</small></button>)}</div>
    <div className="home-grid"><section className="card"><div className="card-title"><h3>최근 알림</h3><span>{notifications.length}개</span></div>{notifications.slice(0, 5).map((n) => <div className="feed" key={String(n.id)}><i></i><div><strong>{String(n.title)}</strong><p>{String(n.message ?? "")}</p></div><time>{formatDate(n.created_at)}</time></div>)}{!notifications.length && <div className="empty slim">새 알림이 없습니다.</div>}</section><section className="card quick"><div className="card-title"><h3>빠른 작성</h3></div><button onClick={() => onCreate("meetings")}><span><Plus /></span>회의록 작성<b>→</b></button><button onClick={() => onCreate("repairs")}><span><Plus /></span>서비스 접수<b>→</b></button><button onClick={() => onCreate("schedules")}><span><Plus /></span>일정 등록<b>→</b></button></section></div></>;
}

function DataList({ section, rows, onOpen }: { section: Section; rows: Row[]; onOpen: (section: "notices" | "meetings" | "hospitals" | "repairs" | "manuals", id: number) => void }) {
  if (section === "repairs") return <RepairList rows={rows} />;
  if (section === "hospitals") return <div className="list-card">{rows.map((row) => <article className="list-row clickable" key={`hospital-${row.id}`} role="link" tabIndex={0} onClick={() => onOpen("hospitals", Number(row.id))} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen("hospitals", Number(row.id)); }}><div className="type-dot"></div><div className="list-main"><div><span className="pill">{String(row.region ?? "지역 미등록")}</span><h3>{String(row.name)}</h3></div><p>{String(row.address ?? row.notes ?? "주소 및 메모가 없습니다.")}</p><small>장비·연락처 정보 · 서비스 기록 {String(row.service_log_count ?? 0)}건 · 준비물 {String(row.open_prep_count ?? 0)}건</small></div></article>)}</div>;
  if (!rows.length) return <div className="empty big">아직 등록된 내용이 없습니다.</div>;
  return <div className="list-card">{rows.map((row) => { const target = detailTarget(section, row); return <article className={`list-row ${target ? "clickable" : ""}`} key={`${section}-${row.id ?? row.target_id}`} role={target ? "link" : undefined} tabIndex={target ? 0 : undefined} onClick={() => target && onOpen(target, Number(row.id ?? row.target_id))} onKeyDown={(event) => { if (target && (event.key === "Enter" || event.key === " ")) onOpen(target, Number(row.id ?? row.target_id)); }}>
    <div className="type-dot"></div><div className="list-main"><div><span className="pill">{labelFor(section, row)}</span><h3>{String(row.title ?? row.equipment_name ?? row.name ?? row.login_id ?? "")}</h3></div>{section !== "manuals" && <p>{plain(String(row.content_markdown ?? row.description_markdown ?? row.message ?? row.email ?? ""))}</p>}<small>{metaFor(section, row)}</small></div>
    {section === "manuals" && <a className="download" onClick={(event) => event.stopPropagation()} href={`/api/v1/files/${row.file_id}/content?download=true`}>PDF 내려받기</a>}
  </article>; })}</div>;
}

function NotificationPanel({ rows, onRead }: { rows: Row[]; onRead: (id: number) => void }) {
  return <div className="notification-panel"><h3>알림</h3>{rows.slice(0, 8).map((row) => <button key={String(row.id)} className={row.read_at ? "read" : ""} onClick={() => void onRead(Number(row.id))}><strong>{String(row.title)}</strong><span>{String(row.message ?? "")}</span></button>)}{!rows.length && <p>새 알림이 없습니다.</p>}</div>;
}

function SectionLoader() { return <div className="section-loader"><LoadingIndicator label="데이터를 불러오는 중" /></div>; }

function CreatePanel({ section, users, onClose, onCreated }: { section: Section; users: User[]; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const now = useMemo(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget);
    try {
      if (section === "schedules") await api("/schedules", { method: "POST", body: JSON.stringify({ title, type: data.get("type"), descriptionMarkdown: data.get("description"), startAt: data.get("startAt"), endAt: data.get("endAt"), allDay: data.get("allDay") === "on", visibility: data.get("visibility"), userId: null }) });
      if (section === "hospitals") await api("/hospitals", { method: "POST", body: JSON.stringify({ name: title, code: data.get("code"), region: data.get("region"), address: data.get("address"), notes: data.get("notes"), pmIntervalMonths: Number(data.get("pmIntervalMonths")) || 6, contacts: [], systems: [] }) });
      if (section === "admin") await api("/admin/users", { method: "POST", body: JSON.stringify({ loginId: data.get("loginId"), password: data.get("password"), name: title, email: data.get("email"), phone: data.get("phone"), position: data.get("position"), role: data.get("role") }) });
      if (section === "emergency") await api("/admin/emergency-contacts", { method: "POST", body: JSON.stringify({ userId: Number(data.get("userId")), name: title, relationship: data.get("relationship"), phone: data.get("phone"), priority: Number(data.get("priority")) || 1, note: data.get("note") }) });
      await onCreated();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><aside className="create-panel"><div className="panel-head"><div><span>NEW RECORD</span><h2>{section === "admin" ? "새 구성원" : section === "emergency" ? "비상연락처 등록" : `${nav.find((n) => n.id === section)?.label ?? "항목"} 등록`}</h2></div><button onClick={onClose}>×</button></div><form onSubmit={submit}>
    <label>{section === "admin" || section === "emergency" ? "이름" : section === "hospitals" ? "병원명" : "제목"}<input required value={title} onChange={(e) => setTitle(e.target.value)} /></label>
    {section === "hospitals" && <><div className="form-grid"><label>관리 코드<input name="code" placeholder="예: H-01" /></label><label>지역<input name="region" placeholder="예: 경기 의정부" /></label><label>주소<input name="address" /></label><label>PM 주기(개월)<input name="pmIntervalMonths" type="number" min="1" defaultValue="6" /></label></div><label>메모<textarea name="notes" rows={4} /></label></>}
    {section === "admin" && <div className="form-grid"><label>로그인 아이디<input name="loginId" required /></label><label>초기 비밀번호<input name="password" type="password" required minLength={10} /></label><label>이메일<input name="email" type="email" /></label><label>연락처<input name="phone" /></label><label>직책<input name="position" /></label><label>권한<select name="role"><option value="USER">일반 사용자</option><option value="ADMIN">관리자</option></select></label></div>}
    {section === "emergency" && <><div className="form-grid"><label>직원<select name="userId" required>{users.map((u) => <option value={u.id} key={u.id}>{u.name}</option>)}</select></label><label>관계<input name="relationship" placeholder="배우자, 부모 등" required /></label><label>전화번호<input name="phone" required /></label><label>연락 순서<input name="priority" type="number" min="1" defaultValue="1" required /></label></div><label>메모<textarea name="note" rows={4} /></label></>}
    {section === "schedules" && <><div className="form-grid"><label>구분<select name="type"><option value="PERSONAL">개인 일정</option><option value="VACATION">휴가</option><option value="COMPANY">회사 일정</option></select></label><label>공개 범위<select name="visibility"><option value="PUBLIC">전체 공개</option><option value="PRIVATE">나만 보기</option></select></label><label>시작<input name="startAt" type="datetime-local" defaultValue={now} required /></label><label>종료<input name="endAt" type="datetime-local" defaultValue={now} required /></label></div><label>설명<textarea name="description" rows={5} /></label><label className="check"><input name="allDay" type="checkbox" /> 종일 일정</label></>}
    {error && <div className="error">{error}</div>}<div className="panel-actions"><button type="button" onClick={onClose}>취소</button><button className="primary" disabled={busy}>{busy ? <><ButtonSpinner /> 저장 중…</> : "저장하기"}</button></div>
  </form></aside></div>;
}

function labelFor(section: Section, row: Row) {
  if (section === "repairs") return ({ RECEIVED: "접수", IN_PROGRESS: "처리 중", COMPLETED: "완료" } as Record<string,string>)[String(row.status)] ?? row.status;
  if (section === "schedules") return ({ PERSONAL: "개인", VACATION: "휴가", COMPANY: "회사" } as Record<string,string>)[String(row.type)] ?? row.type;
  if (section === "admin") return row.role === "ADMIN" ? "관리자" : "구성원";
  if (section === "emergency") return String(row.relationship);
  return section === "search" ? String(row.target_type) : section === "manuals" ? "매뉴얼" : "기록";
}
function metaFor(section: Section, row: Row) {
  if (section === "meetings") return `${formatHour(row.meeting_at)} · ${row.participant_names ?? "참여자 없음"}`;
  if (section === "repairs") return `${row.written_at ? formatDate(row.written_at) : ""} · ${row.requester_name} 작성 · ${row.assignee_name ?? "담당자 미지정"}`;
  if (section === "schedules") return `${formatDate(row.start_at)} ~ ${formatDate(row.end_at)} · ${row.user_name ?? "전체"}`;
  if (section === "admin") return `${row.position ?? "직책 미지정"} · ${row.email ?? "이메일 미등록"}`;
  if (section === "emergency") return `${row.user_name}의 비상연락처 · ${row.phone} · ${row.priority}순위`;
  return `${row.author_name ?? ""}${row.created_at ? ` · ${formatDate(row.created_at)}` : ""}`;
}
function detailTarget(section: Section, row: Row): "notices" | "meetings" | "hospitals" | "repairs" | "manuals" | null {
  if (["notices", "meetings", "hospitals", "repairs", "manuals"].includes(section)) return section as "notices" | "meetings" | "hospitals" | "repairs" | "manuals";
  if (section !== "search") return null;
  return ({ NOTICE: "notices", MEETING: "meetings", HOSPITAL: "hospitals", REPAIR: "repairs", MANUAL: "manuals" } as const)[String(row.target_type) as "NOTICE" | "MEETING" | "HOSPITAL" | "REPAIR" | "MANUAL"] ?? null;
}
function formatDate(value: unknown) { if (!value) return ""; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date); }
function formatHour(value: unknown) { if (!value) return ""; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", hourCycle: "h23" }).format(date); }
function sectionFromPath(pathname: string): Section {
  const segment = pathname.split("/").filter(Boolean)[0] as Section | undefined;
  return segment && ["notices", "meetings", "hospitals", "repairs", "manuals", "schedules", "search", "admin", "emergency"].includes(segment) ? segment : "home";
}
function sectionPath(section: Section) { return section === "home" ? "/" : `/${section}`; }
