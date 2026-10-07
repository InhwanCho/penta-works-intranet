"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Section = "notices" | "meetings" | "hospitals" | "repairs" | "manuals" | "schedules" | "accounting" | "work-logs" | "workshop-repairs";
type Row = Record<string, string | number | boolean | null>;
export function DetailHistory({ section, currentId, rows }: { section: Section; currentId: number; rows: Row[] }) {
  const ordered = [...rows].sort((a, b) => historyDate(b).localeCompare(historyDate(a)) || Number(b.id) - Number(a.id));
  const currentIndex = ordered.findIndex((row) => Number(row.id) === currentId);
  const previous = currentIndex >= 0 ? ordered[currentIndex + 1] : null;
  const next = currentIndex > 0 ? ordered[currentIndex - 1] : null;
  return <aside className="detail-history" aria-label="다른 이력으로 이동">
    <div className="detail-history-heading"><strong>다른 이력</strong><Link href={section === "repairs" ? `/hospitals/${rows.find(row => row.hospital_id)?.hospital_id ?? ""}` : `/${section}`}>전체 보기</Link></div>
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
