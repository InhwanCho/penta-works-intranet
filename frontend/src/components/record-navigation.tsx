"use client";

import Image from "next/image";
import Link from "next/link";
import { BookOpenText, Building2, CalendarDays, ChevronLeft, ChevronRight, Home, Megaphone, NotebookTabs, Wrench, type LucideIcon } from "lucide-react";

type Section = "notices" | "meetings" | "hospitals" | "repairs" | "manuals" | "schedules";
type Row = Record<string, string | number | boolean | null>;

const navigation: { href: string; section?: Section; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "홈", icon: Home },
  { href: "/notices", section: "notices", label: "공지사항", icon: Megaphone },
  { href: "/meetings", section: "meetings", label: "회의록", icon: NotebookTabs },
  { href: "/hospitals", section: "hospitals", label: "병원·장비", icon: Building2 },
  { href: "/repairs", section: "repairs", label: "서비스 기록", icon: Wrench },
  { href: "/manuals", section: "manuals", label: "업무 매뉴얼", icon: BookOpenText },
  { href: "/schedules", section: "schedules", label: "일정", icon: CalendarDays },
];

export function RecordSidebar({ activeSection }: { activeSection: Section }) {
  return <aside className="sidebar record-sidebar">
    <Link className="logo" href="/" aria-label="대시보드로 이동"><Image className="brand-symbol" src="/favicon/android-chrome-192x192.png" width={42} height={42} alt="" priority /><b>PENTA <small>OFFICE</small></b></Link>
    <nav>{navigation.map(({ href, section, label, icon: Icon }) => <Link key={href} href={href} className={section === activeSection ? "active" : ""}><Icon aria-hidden />{label}</Link>)}</nav>
  </aside>;
}

export function DetailHistory({ section, currentId, rows }: { section: Section; currentId: number; rows: Row[] }) {
  const ordered = [...rows].sort((a, b) => historyDate(b).localeCompare(historyDate(a)) || Number(b.id) - Number(a.id));
  const currentIndex = ordered.findIndex((row) => Number(row.id) === currentId);
  const previous = currentIndex >= 0 ? ordered[currentIndex + 1] : null;
  const next = currentIndex > 0 ? ordered[currentIndex - 1] : null;
  return <aside className="detail-history" aria-label="다른 이력으로 이동">
    <div className="detail-history-heading"><strong>다른 이력</strong><Link href={`/${section}`}>전체 보기</Link></div>
    <div className="detail-history-step">
      {previous ? <Link href={`/${section}/${previous.id}`}><ChevronLeft aria-hidden /><span>이전</span></Link> : <span />}
      {next ? <Link href={`/${section}/${next.id}`}><span>다음</span><ChevronRight aria-hidden /></Link> : <span />}
    </div>
    <nav>{ordered.slice(0, 8).map((row) => <Link key={String(row.id)} className={Number(row.id) === currentId ? "active" : ""} href={`/${section}/${row.id}`} aria-current={Number(row.id) === currentId ? "page" : undefined}><small>{historyLabel(section, row)}</small><span>{String(row.title ?? row.equipment_name ?? "제목 없음")}</span></Link>)}</nav>
  </aside>;
}

function historyDate(row: Row) { return String(row.written_at ?? row.meeting_at ?? row.created_at ?? row.updated_at ?? ""); }
function historyLabel(section: Section, row: Row) {
  const value = section === "repairs" ? row.written_at : section === "meetings" ? row.meeting_at : row.created_at;
  const matched = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return matched ? `${matched[1]}.${matched[2]}.${matched[3]}` : section === "manuals" ? `버전 ${row.version_no ?? 1}` : "날짜 미기재";
}
