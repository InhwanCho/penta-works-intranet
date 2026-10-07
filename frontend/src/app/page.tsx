"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { getQueryClient } from "@/lib/query-client";
import Link from "next/link";
import { officeNavigation } from "@/lib/office-navigation";

import { recordText as plain } from "@/lib/record-text";
import { useApiQuery } from "@/lib/use-api-query";
import { api } from "@/lib/api";
import { usePreferences } from "@/components/preferences-provider";
import {
  ALargeSmall,
  Bell,
  Building2,
  LogOut,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import LoadingIndicator, {
  ButtonSpinner,
} from "@/components/loading-indicator";
import ServiceCalendar from "@/components/service-calendar";

const WeeklyMeetings = dynamic(() => import("@/components/weekly-meetings"), { loading: () => <SectionLoader /> });
const RepairList = dynamic(() => import("@/components/repair-records").then(module => module.RepairList), { loading: () => <SectionLoader /> });
const ManagedRecords = dynamic(() => import("@/components/managed-records").then(module => module.ManagedRecords), { loading: () => <SectionLoader /> });

const AccountingDashboard = dynamic(
  () =>
    import("@/components/accounting-dashboard").then(
      (module) => module.AccountingDashboard,
    ),
  { loading: () => <SectionLoader /> },
);

const WorkshopRepairs = dynamic(() => import("@/components/workshop-repairs"), { loading: () => <SectionLoader /> });
const WorkLogs = dynamic(() => import("@/components/work-logs"), { loading: () => <SectionLoader /> });

type Row = Record<string, string | number | boolean | null>;
type User = {
  id: number;
  name: string;
  role: "ADMIN" | "ACCOUNTING" | "USER";
  login_id?: string;
  position?: string;
};
type Section =
  | "work-logs"
  | "workshop-repairs"
  | "home"
  | "notices"
  | "meetings"
  | "hospitals"
  | "repairs"
  | "manuals"
  | "schedules"
  | "accounting"
  | "search"
  | "admin"
  | "emergency";

const nav = officeNavigation;

const endpoint: Partial<Record<Section, string>> = {
  notices: "/notices",
  meetings: "/meetings",
  hospitals: "/hospitals",
  repairs: "/repairs",
  manuals: "/manuals",
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
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleMonth, setScheduleMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const auth = useApiQuery<User>("/auth/me");
  const me = auth.data;
  const members = useApiQuery<User[]>(
    "/users",
    Boolean(me) && showForm && section === "emergency",
  );
  const users = members.data ?? [];
  const noticeQuery = useApiQuery<Row[]>("/notifications", Boolean(me));
  const notifications = noticeQuery.data ?? [];
  const canUseAccounting = me?.role === "ADMIN" || me?.role === "ACCOUNTING";
  const [year, month] = scheduleMonth.split("-").map(Number);
  const from = `${scheduleMonth}-01`;
  const to = `${scheduleMonth}-${new Date(year, month, 0).getDate()}`;
  const path =
    section === "home"
      ? "/dashboard"
      : section === "schedules"
        ? `/schedules?from=${from}&to=${to}`
        : section === "admin"
          ? "/admin/users"
          : section === "emergency"
            ? "/admin/emergency-contacts"
            : section === "search"
              ? `/search?q=${encodeURIComponent(searchQuery)}`
              : (endpoint[section] ?? "/dashboard");
  const dataQuery = useApiQuery<Row | Row[]>(
    path,
    Boolean(me) &&
      section !== "accounting" && section !== "work-logs" && section !== "workshop-repairs" &&
      (section !== "search" || Boolean(searchQuery)),
  );
  const rows = Array.isArray(dataQuery.data) ? dataQuery.data : [];
  const stats = !Array.isArray(dataQuery.data) ? (dataQuery.data ?? {}) : {};
  const loading = dataQuery.isLoading;
  async function load() {
    if (section === "home" || section === "schedules") {
      await getQueryClient().invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "api" &&
          [
            "dashboard",
            "service-calendar",
            "schedules",
            "service-prep",
            "notifications",
          ].includes(String(query.queryKey[1]).split("/")[1]?.split("?")[0]),
      });
    } else await dataQuery.refetch();
  }
  useEffect(() => {
    setShowForm(false);
    if (section === "schedules") {
      const date =
        new URLSearchParams(window.location.search).get("date") ?? "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date))) {
        setScheduleDate(date);
        setScheduleMonth(date.slice(0, 7));
      }
    }
    if (section === "search") {
      const value = new URLSearchParams(window.location.search).get("q") ?? "";
      setQuery(value);
      setSearchQuery(value);
    }
  }, [pathname, section]);

  async function go(next: Section) {
    const target = sectionPath(next);
    if (target === pathname) await load();
    else router.push(target);
  }
  function create() {
    if (
      [
        "notices",
        "meetings",
        "hospitals",
        "repairs",
        "manuals",
        "schedules",
      ].includes(section)
    )
      router.push(`/write/${section}`);
    else setShowForm(true);
  }
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login");
  }
  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    const nextQuery = query.trim();
    router.push(`/search?q=${encodeURIComponent(nextQuery)}`);
    setSearchQuery(nextQuery);
  }

  const unread = notifications.filter((item) => !item.read_at).length;
  const title =
    section === "home"
      ? "대시보드"
      : section === "search"
        ? `“${query}” 검색 결과`
        : section === "admin"
          ? "구성원 관리"
          : section === "emergency"
            ? "비상연락망"
            : nav.find((item) => item.id === section)?.label;

  if (auth.isError)
    return (
      <main className="detail-state">
        <p>{auth.error.message}</p>
        <button onClick={() => void auth.refetch()}>다시 시도</button>
      </main>
    );
  if (!me)
    return (
      <div className="loading-screen">
        <LoadingIndicator label="업무 공간을 준비하는 중" />
      </div>
    );

  return (
    <div className="shell">
      <aside className="sidebar">
        <button className="logo" onClick={() => void go("home")}>
          <Image
            className="brand-symbol"
            src="/favicon/android-chrome-192x192.png"
            width={42}
            height={42}
            alt=""
            priority
          />
          <b>
            PENTA <small>OFFICE</small>
          </b>
        </button>
        <nav>
          {nav
            .filter((item) => item.id !== "accounting" || canUseAccounting)
            .map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={sectionPath(item.id)}
                  prefetch={true}
                  aria-current={section === item.id ? "page" : undefined}
                  className={section === item.id ? "active" : ""}
                >
                  <Icon aria-hidden />
                  <span>{item.label}</span>
                </Link>
              );
            })}
        </nav>
        {me.role === "ADMIN" && (
          <div className="nav-bottom">
            <span>관리</span>
            <button
              className={
                ["admin", "emergency"].includes(section) ? "active" : ""
              }
              onClick={() => void go("admin")}
            >
              <Settings aria-hidden />
              구성원·비상연락망
            </button>
          </div>
        )}
        <div className="profile">
          <div className="avatar">{me.name.slice(0, 1)}</div>
          <div>
            <strong>{me.name}</strong>
            <small>{roleLabel(me.role)}</small>
          </div>
          <button onClick={logout} aria-label="로그아웃" title="로그아웃">
            <LogOut aria-hidden />
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header>
          <form className="search" onSubmit={search}>
            <Search aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="병원, 업무일지, 회의록 검색"
            />
            <kbd>Enter</kbd>
          </form>
          <div className="header-actions">
            <button
              className={`view-control ${largeText ? "active" : ""}`}
              onClick={toggleLargeText}
              aria-label="큰 글씨 모드"
              title="큰 글씨 모드"
            >
              <ALargeSmall aria-hidden />
            </button>
            <button
              className="view-control"
              onClick={toggleDark}
              aria-label={dark ? "라이트 모드" : "다크 모드"}
              title={dark ? "라이트 모드" : "다크 모드"}
            >
              {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
            </button>
            <button
              className="bell"
              onClick={() => setShowNotifications(!showNotifications)}
              aria-label="알림"
            >
              <Bell aria-hidden />
              {unread > 0 && <b>{unread}</b>}
            </button>
            <div className="mini-avatar">{me.name.slice(0, 1)}</div>
          </div>
          {showNotifications && (
            <NotificationPanel
              rows={notifications}
              onRead={async (row) => {
                await api("/notifications/read", {
                  method: "PATCH",
                  body: JSON.stringify({ id: row.id }),
                });
                const target = (
                  {
                    NOTICE: "notices",
                    MEETING: "meetings",
                    REPAIR: "repairs",
                    MANUAL: "manuals",
        WORK_LOG: "work-logs",
        WORKSHOP_REPAIR: "workshop-repairs",
                    HOSPITAL: "hospitals",
                  } as Record<string, string>
                )[String(row.target_type)];
                if (target && Number(row.target_id) > 0) {
                  setShowNotifications(false);
                  router.push(`/${target}/${row.target_id}`);
                } else if (row.target_type === "SCHEDULE") {
                  setShowNotifications(false);
                  router.push("/schedules");
                }
              }}
            />
          )}
        </header>
        <section className="content">
          <div className="page-head">
            <div>
              <p>
                {new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(
                  new Date(),
                )}
              </p>
              <h1>{title}</h1>
            </div>
            {section !== "accounting" && section !== "work-logs" && section !== "workshop-repairs" && (
              <div className="page-actions">
                <button
                  onClick={() => void load()}
                  disabled={dataQuery.isFetching}
                >
                  새로고침
                </button>
                {section === "admin" && (
                  <button onClick={() => void go("emergency")}>
                    비상연락망 보기
                  </button>
                )}
                {section === "emergency" && (
                  <button onClick={() => void go("admin")}>구성원 보기</button>
                )}
                {!["home", "search"].includes(section) &&
                  (section !== "hospitals" || me.role === "ADMIN") && (
                    <button className="primary compact" onClick={create}>
                      <Plus aria-hidden /> {({ hospitals: "병원 추가", meetings: "회의록 작성", notices: "공지 작성", manuals: "매뉴얼 등록", schedules: "일정 등록" } as Partial<Record<Section, string>>)[section] ?? "새로 만들기"}
                    </button>
                  )}
              </div>
            )}
          </div>
          {dataQuery.isError && (
            <div className="error" role="alert">
              {dataQuery.error.message}{" "}
              <button onClick={() => void load()}>다시 시도</button>
            </div>
          )}
          {dataQuery.isFetching && !loading && (
            <div className="background-refresh" role="status">
              최신 내용을 확인하는 중…
            </div>
          )}
          {section === "schedules" && (
            <>
              <ServiceCalendar
                key={scheduleDate}
                initialDate={scheduleDate || undefined}
                month={scheduleMonth}
                onMonthChange={setScheduleMonth}
                showOverview={false}
              />
              <h2 id="office-schedule-list" className="office-schedule-heading">
                개인·회사 일정 관리{" "}
                <small>
                  {scheduleMonth} · 서비스 방문 변경은 달력의 병원 관리에서
                  가능합니다.
                </small>
              </h2>
            </>
          )}
          {section === "accounting" ? (
            canUseAccounting ? (
              <AccountingDashboard />
            ) : (
              <div className="empty big">
                회계 담당자와 관리자만 접근할 수 있습니다.
              </div>
            )
          ) : section === "home" ? (
            <Dashboard
              stats={stats}
              statsLoading={dataQuery.isPending}
              notificationsLoading={noticeQuery.isPending}
              notificationsError={noticeQuery.error?.message}
              onRetryNotifications={() => void noticeQuery.refetch()}
              notifications={notifications}
              onGo={go}
              onCreate={(target) => router.push(`/write/${target}`)}
            />
          ) : section === "workshop-repairs" ? (
            <WorkshopRepairs />
          ) : section === "work-logs" ? (
            <WorkLogs />
          ) : loading ? (
            <SectionLoader />
          ) : ["schedules", "admin", "emergency"].includes(section) ? (
            <ManagedRecords
              kind={section as "schedules" | "admin" | "emergency"}
              rows={rows}
              me={me}
            />
          ) : (
            <>
            {section === "hospitals" && <p className="text-muted">MREyes와 연동됩니다. 병원의 MREyes 사이트 ID로 사이트 정보·장비·부품·서비스 이력을 제공합니다.</p>}
            <DataList
              section={section}
              rows={rows}
              onOpen={(target, id) => router.push(`/${target}/${id}`)}
            /></>
          )}
        </section>
      </main>
      {showForm && (
        <CreatePanel
          section={section}
          users={users}
          onClose={() => setShowForm(false)}
          onCreated={async () => {
            setShowForm(false);
          }}
        />
      )}
    </div>
  );
}

function Dashboard({
  stats,
  statsLoading,
  notificationsLoading,
  notificationsError,
  onRetryNotifications,
  notifications,
  onGo,
  onCreate,
}: {
  stats: Row;
  statsLoading: boolean;
  notificationsLoading: boolean;
  notificationsError?: string;
  onRetryNotifications: () => void;
  notifications: Row[];
  onGo: (section: Section) => void;
  onCreate: (section: "meetings" | "repairs" | "schedules") => void;
}) {
  const cards = [
    ["공지사항", stats.notices ?? 0, "notices", "coral"],
    ["등록 병원", stats.hospitals ?? 0, "hospitals", "blue"],
    ["처리할 서비스", stats.openRepairs ?? 0, "hospitals", "amber"],
    ["업무 매뉴얼", stats.manuals ?? 0, "manuals", "mint"],
  ] as const;
  return (
    <>
      <section className="dashboard-intro"><div><span className="eyebrow">PENTA OFFICE</span><h2>오늘의 업무를 한눈에</h2><p>병원 일정과 진행 중인 작업을 확인하고, 이번 주 업무를 이어가세요.</p></div></section>
      <div className="dashboard-actions">
        <button className="primary" onClick={() => onGo("hospitals")}>
          <Building2 /> 병원·장비 보기
        </button>
        <button onClick={() => onCreate("meetings")}>주간 회의록 작성</button>
        <button onClick={() => onCreate("schedules")}>일정 등록</button>
      </div>
      <div className="stat-grid">
        {cards.map(([label, value, target, color]) => (
          <button
            className={`stat ${color}`}
            key={label}
            onClick={() => void onGo(target)}
          >
            <span>{label}</span>
            <strong aria-label={statsLoading ? "불러오는 중" : undefined}>
              {statsLoading ? "—" : String(value)}
            </strong>
            <small>바로가기 →</small>
          </button>
        ))}
      </div>
      <ServiceCalendar />
      <section className="card dashboard-notifications">
        <div className="card-title">
          <h3>최근 알림</h3>
        </div>
        {notificationsError ? (
          <p role="alert">
            {notificationsError}{" "}
            <button onClick={onRetryNotifications}>다시 시도</button>
          </p>
        ) : notificationsLoading ? (
          <p role="status">알림을 불러오는 중…</p>
        ) : (
          notifications.slice(0, 5).map((n) => (
            <div className="feed" key={String(n.id)}>
              <i />
              <div>
                <strong>{String(n.title)}</strong>
                <p>{String(n.message ?? "")}</p>
              </div>
              <time>{formatDate(n.created_at)}</time>
            </div>
          ))
        )}
        {!notificationsLoading &&
          !notificationsError &&
          !notifications.length && (
            <p className="text-muted">새 알림이 없습니다.</p>
          )}
      </section>
    </>
  );
}

function HospitalList({ rows, onOpen }: { rows: Row[]; onOpen: (id: number) => void }) {
  const [keyword, setKeyword] = useState("");
  const filtered = useMemo(() => rows.filter(row => [row.name, row.region, row.address].some(value => String(value ?? "").toLowerCase().includes(keyword.trim().toLowerCase()))), [rows, keyword]);
  return <div className="hospital-directory">
    <div className="directory-toolbar"><label className="search"><Search aria-hidden /><input type="search" aria-label="병원 검색" placeholder="병원명, 지역, 주소 검색" value={keyword} onChange={event => setKeyword(event.target.value)} /></label><span>{filtered.length}개 병원</span></div>
    <div className="hospital-directory-grid">{filtered.map(row => <button className="hospital-directory-card" key={String(row.id)} onClick={() => onOpen(Number(row.id))}>
      <div className="hospital-directory-heading"><span className="hospital-directory-icon"><Building2 aria-hidden /></span><div><h3>{String(row.name)}</h3><p>{String(row.region || "지역 미등록")}</p></div><span aria-hidden>→</span></div>
      <p className="hospital-directory-address">{String(row.address || "주소 미등록")}</p>
      <div className="hospital-directory-facts"><span>서비스 이력 <strong>{String(row.service_log_count ?? 0)}건</strong></span><span>방문 준비물 <strong>{String(row.open_prep_count ?? 0)}건</strong></span></div>
      <small>장비·부품·이력 보기 →</small>
    </button>)}</div>{!filtered.length && <div className="empty big">{rows.length ? "검색 결과가 없습니다." : "등록된 병원이 없습니다."}</div>}
  </div>;
}

function DataList({
  section,
  rows,
  onOpen,
}: {
  section: Section;
  rows: Row[];
  onOpen: (
    section: "notices" | "meetings" | "hospitals" | "repairs" | "manuals" | "work-logs" | "workshop-repairs",
    id: number,
  ) => void;
}) {
  if (section === "meetings") return <WeeklyMeetings rows={rows} />;
  if (section === "repairs") return <RepairList rows={rows} />;
  if (section === "hospitals") return <HospitalList rows={rows} onOpen={id => onOpen("hospitals", id)} />;
  if (!rows.length)
    return <div className="empty big">아직 등록된 내용이 없습니다.</div>;
  return (
    <div className="list-card">
      {rows.map((row) => {
        const target = detailTarget(section, row);
        return (
          <article
            className={`list-row ${target ? "clickable" : ""}`}
            key={`${section}-${row.id ?? row.target_id}`}
            role={target ? "link" : undefined}
            tabIndex={target ? 0 : undefined}
            onClick={() =>
              target && onOpen(target, Number(row.id ?? row.target_id))
            }
            onKeyDown={(event) => {
              if (target && (event.key === "Enter" || event.key === " "))
                onOpen(target, Number(row.id ?? row.target_id));
            }}
          >
            <div className="type-dot"></div>
            <div className="list-main">
              <div>
                <span className="pill">{labelFor(section, row)}</span>
                <h3>
                  {String(
                    row.title ??
                      row.equipment_name ??
                      row.name ??
                      row.login_id ??
                      "",
                  )}
                </h3>
              </div>
              {section !== "manuals" && (
                <p>
                  {plain(
                    String(
                      row.summary ??
                        row.content_markdown ??
                        row.description_markdown ??
                        row.message ??
                        row.email ??
                        "",
                    ),
                  )}
                </p>
              )}
              <small>{metaFor(section, row)}</small>
            </div>
            {section === "manuals" && (
              <a
                className="download"
                onClick={(event) => event.stopPropagation()}
                href={`/api/v1/files/${row.file_id}/content?download=true`}
              >
                PDF 내려받기
              </a>
            )}
          </article>
        );
      })}
    </div>
  );
}

function NotificationPanel({
  rows,
  onRead,
}: {
  rows: Row[];
  onRead: (row: Row) => Promise<void>;
}) {
  const [all, setAll] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="notification-panel">
      <h3>알림</h3>
      {error && <p role="alert">{error}</p>}
      {rows.slice(0, all ? 50 : 8).map((row) => (
        <button
          disabled={busy}
          key={String(row.id)}
          className={row.read_at ? "read" : ""}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onRead(row);
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "알림을 열지 못했습니다.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <strong>{String(row.title)}</strong>
          <span>{String(row.message ?? "")}</span>
        </button>
      ))}
      {rows.length > 8 && (
        <button onClick={() => setAll(!all)}>
          {all ? "접기" : `최근 알림 ${rows.length}건 보기`}
        </button>
      )}
      {!rows.length && <p>새 알림이 없습니다.</p>}
    </div>
  );
}

function SectionLoader() {
  return (
    <div className="section-loader">
      <LoadingIndicator label="데이터를 불러오는 중" />
    </div>
  );
}

function CreatePanel({
  section,
  users,
  onClose,
  onCreated,
}: {
  section: Section;
  users: User[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const now = useMemo(
    () =>
      new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16),
    [],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      if (section === "schedules")
        await api("/schedules", {
          method: "POST",
          body: JSON.stringify({
            title,
            type: data.get("type"),
            descriptionMarkdown: data.get("description"),
            startAt: data.get("startAt"),
            endAt: data.get("endAt"),
            allDay: data.get("allDay") === "on",
            visibility: data.get("visibility"),
            userId: null,
          }),
        });
      if (section === "hospitals")
        await api("/hospitals", {
          method: "POST",
          body: JSON.stringify({
            name: title,
            code: data.get("code"),
            region: data.get("region"),
            address: data.get("address"),
            notes: data.get("notes"),
            pmIntervalMonths: Number(data.get("pmIntervalMonths")) || 2,
            contacts: [],
            systems: [],
          }),
        });
      if (section === "admin")
        await api("/admin/users", {
          method: "POST",
          body: JSON.stringify({
            loginId: data.get("loginId"),
            password: data.get("password"),
            name: title,
            email: data.get("email"),
            phone: data.get("phone"),
            position: data.get("position"),
            role: data.get("role"),
          }),
        });
      if (section === "emergency")
        await api("/admin/emergency-contacts", {
          method: "POST",
          body: JSON.stringify({
            userId: Number(data.get("userId")),
            name: title,
            relationship: data.get("relationship"),
            phone: data.get("phone"),
            priority: Number(data.get("priority")) || 1,
            note: data.get("note"),
          }),
        });
      await onCreated();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "저장하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside className="create-panel">
        <div className="panel-head">
          <div>
            <span>NEW RECORD</span>
            <h2>
              {section === "admin"
                ? "새 구성원"
                : section === "emergency"
                  ? "비상연락처 등록"
                  : `${nav.find((n) => n.id === section)?.label ?? "항목"} 등록`}
            </h2>
          </div>
          <button onClick={onClose}>×</button>
        </div>
        <form onSubmit={submit}>
          <label>
            {section === "admin" || section === "emergency"
              ? "이름"
              : section === "hospitals"
                ? "병원명"
                : "제목"}
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          {section === "hospitals" && (
            <>
              <div className="form-grid">
                <label>
                  관리 코드
                  <input name="code" placeholder="예: H-01" />
                </label>
                <label>
                  지역
                  <input name="region" placeholder="예: 경기 의정부" />
                </label>
                <label>
                  주소
                  <input name="address" />
                </label>
                <label>
                  PM 주기(개월)
                  <input
                    name="pmIntervalMonths"
                    type="number"
                    min="1"
                    defaultValue="2"
                  />
                </label>
              </div>
              <label>
                메모
                <textarea name="notes" rows={4} />
              </label>
            </>
          )}
          {section === "admin" && (
            <div className="form-grid">
              <label>
                로그인 아이디
                <input name="loginId" required />
              </label>
              <label>
                초기 비밀번호
                <input
                  name="password"
                  type="password"
                  required
                  minLength={10}
                />
              </label>
              <label>
                이메일
                <input name="email" type="email" />
              </label>
              <label>
                연락처
                <input name="phone" />
              </label>
              <label>
                직책
                <input name="position" />
              </label>
              <label>
                권한
                <select name="role">
                  <option value="USER">일반 사용자</option>
                  <option value="ACCOUNTING">회계 담당자</option>
                  <option value="ADMIN">관리자</option>
                </select>
              </label>
            </div>
          )}
          {section === "emergency" && (
            <>
              <div className="form-grid">
                <label>
                  직원
                  <select name="userId" required>
                    {users.map((u) => (
                      <option value={u.id} key={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  관계
                  <input
                    name="relationship"
                    placeholder="배우자, 부모 등"
                    required
                  />
                </label>
                <label>
                  전화번호
                  <input name="phone" required />
                </label>
                <label>
                  연락 순서
                  <input
                    name="priority"
                    type="number"
                    min="1"
                    defaultValue="1"
                    required
                  />
                </label>
              </div>
              <label>
                메모
                <textarea name="note" rows={4} />
              </label>
            </>
          )}
          {section === "schedules" && (
            <>
              <div className="form-grid">
                <label>
                  구분
                  <select name="type">
                    <option value="PERSONAL">개인 일정</option>
                    <option value="VACATION">휴가</option>
                    <option value="COMPANY">회사 일정</option>
                  </select>
                </label>
                <label>
                  공개 범위
                  <select name="visibility">
                    <option value="PUBLIC">전체 공개</option>
                    <option value="PRIVATE">나만 보기</option>
                  </select>
                </label>
                <label>
                  시작
                  <input
                    name="startAt"
                    type="datetime-local"
                    defaultValue={now}
                    required
                  />
                </label>
                <label>
                  종료
                  <input
                    name="endAt"
                    type="datetime-local"
                    defaultValue={now}
                    required
                  />
                </label>
              </div>
              <label>
                설명
                <textarea name="description" rows={5} />
              </label>
              <label className="check">
                <input name="allDay" type="checkbox" /> 종일 일정
              </label>
            </>
          )}
          {error && <div className="error">{error}</div>}
          <div className="panel-actions">
            <button type="button" onClick={onClose}>
              취소
            </button>
            <button className="primary" disabled={busy}>
              {busy ? (
                <>
                  <ButtonSpinner /> 저장 중…
                </>
              ) : (
                "저장하기"
              )}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function labelFor(section: Section, row: Row) {
  if (section === "repairs")
    return (
      (
        {
          RECEIVED: "접수",
          IN_PROGRESS: "처리 중",
          REVISIT: "재방문",
          COMPLETED: "완료",
        } as Record<string, string>
      )[String(row.status)] ?? row.status
    );
  if (section === "schedules")
    return (
      (
        { PERSONAL: "개인", VACATION: "휴가", COMPANY: "회사" } as Record<
          string,
          string
        >
      )[String(row.type)] ?? row.type
    );
  if (section === "admin") return roleLabel(String(row.role));
  if (section === "emergency") return String(row.relationship);
  return section === "search"
    ? String(row.target_type)
    : section === "manuals"
      ? "매뉴얼"
      : "기록";
}
function metaFor(section: Section, row: Row) {
  if (section === "meetings")
    return `${formatHour(row.meeting_at)} · ${row.participant_names ?? "참여자 없음"}`;
  if (section === "repairs")
    return `${row.written_at ? formatDate(row.written_at) : ""} · ${row.requester_name} 작성 · ${row.assignee_name ?? "담당자 미지정"}`;
  if (section === "schedules")
    return `${formatDate(row.start_at)} ~ ${formatDate(row.end_at)} · ${row.user_name ?? "전체"}`;
  if (section === "admin")
    return `${row.position ?? "직책 미지정"} · ${row.email ?? "이메일 미등록"}`;
  if (section === "emergency")
    return `${row.user_name}의 비상연락처 · ${row.phone} · ${row.priority}순위`;
  return `${row.author_name ?? ""}${row.created_at ? ` · ${formatDate(row.created_at)}` : ""}`;
}
function detailTarget(
  section: Section,
  row: Row,
): "notices" | "meetings" | "hospitals" | "repairs" | "manuals" | "work-logs" | "workshop-repairs" | null {
  if (
    ["notices", "meetings", "hospitals", "repairs", "manuals"].includes(section)
  )
    return section as
      | "notices"
      | "meetings"
      | "hospitals"
      | "repairs"
      | "manuals";
  if (section !== "search") return null;
  return (
    (
      {
        NOTICE: "notices",
        MEETING: "meetings",
        HOSPITAL: "hospitals",
        REPAIR: "repairs",
        MANUAL: "manuals",
        WORK_LOG: "work-logs",
        WORKSHOP_REPAIR: "workshop-repairs",
      } as const
    )[
      String(row.target_type) as
        | "NOTICE"
        | "MEETING"
        | "HOSPITAL"
        | "REPAIR"
        | "MANUAL"
        | "WORK_LOG"
        | "WORKSHOP_REPAIR"
    ] ?? null
  );
}
function formatDate(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("ko-KR", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}
function formatHour(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("ko-KR", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(date);
}
function sectionFromPath(pathname: string): Section {
  const segment = pathname.split("/").filter(Boolean)[0] as Section | undefined;
  return segment &&
    [
      "workshop-repairs",
      "work-logs",
      "notices",
      "meetings",
      "hospitals",
      "repairs",
      "manuals",
      "schedules",
      "accounting",
      "search",
      "admin",
      "emergency",
    ].includes(segment)
    ? segment
    : "home";
}
function sectionPath(section: Section) {
  return section === "home" ? "/" : `/${section}`;
}
function roleLabel(role: string) {
  return role === "ADMIN"
    ? "관리자"
    : role === "ACCOUNTING"
      ? "회계 담당자"
      : "구성원";
}
