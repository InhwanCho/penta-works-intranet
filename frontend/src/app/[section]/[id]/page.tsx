"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { ALargeSmall, ArrowLeft, Download, Moon, Pencil, Sun, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { usePreferences } from "@/components/preferences-provider";
import { api } from "@/lib/api";
import LoadingIndicator from "@/components/loading-indicator";
import { RepairDetail, RepairStatus } from "@/components/repair-records";
import { DetailHistory, RecordSidebar } from "@/components/record-navigation";

const MarkdownViewer = dynamic(() => import("@/components/markdown-viewer"), { ssr: false });
type DetailSection = "notices" | "meetings" | "repairs" | "manuals";
type Detail = Record<string, string | number | boolean | null>;
type Me = { id: number; role: "ADMIN" | "USER" };

const labels: Record<DetailSection, string> = { notices: "공지사항", meetings: "회의록", repairs: "수리 기록", manuals: "업무 매뉴얼" };

export default function DetailPage() {
  const params = useParams<{ section: string; id: string }>();
  const router = useRouter();
  const { dark, largeText, toggleDark, toggleLargeText } = usePreferences();
  const section = params.section as DetailSection;
  const valid = section in labels && /^\d+$/.test(params.id);
  const [row, setRow] = useState<Detail | null>(null);
  const [rows, setRows] = useState<Detail[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!valid) { router.replace("/"); return; }
    void Promise.all([api<Detail>(`/${section}/${params.id}`), api<Detail[]>(`/${section}`), api<Me>("/auth/me")]).then(([detail, history, current]) => { setRow(detail); setRows(history); setMe(current); }).catch((reason) => setError(reason instanceof Error ? reason.message : "내용을 불러오지 못했습니다."));
  }, [params.id, router, section, valid]);

  if (!valid) return null;
  if (error) return <main className="detail-state"><p>{error}</p><button onClick={() => router.back()}>돌아가기</button></main>;
  if (!row || !me) return <PageLoader />;

  const content = String(row.content_markdown ?? row.description_markdown ?? "");
  const ownerId = Number(section === "repairs" ? row.requester_id : row.author_id);
  const canManage = me.role === "ADMIN" || me.id === ownerId;
  const canEdit = section === "meetings" || canManage;
  async function remove() {
    if (!window.confirm("삭제한 내용은 목록에서 사라집니다. 삭제할까요?")) return;
    try { await api(`/${section}/${params.id}`, { method: "DELETE" }); router.replace(`/${section}`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "삭제하지 못했습니다."); }
  }
  return <div className="shell record-shell"><RecordSidebar activeSection={section} /><main className="detail-page record-main">
    <header className="write-header">
      <button className="icon-button" onClick={() => router.push(`/${section}`)} aria-label="목록으로 돌아가기"><ArrowLeft /></button>
      <button className="write-logo brand-lockup" onClick={() => router.push("/")} aria-label="대시보드로 이동"><Image src="/favicon/android-chrome-192x192.png" width={38} height={38} alt="" /><b>PENTA <small>OFFICE</small></b></button>
      <div className="write-header-actions"><button className={`icon-button ${largeText ? "active" : ""}`} onClick={toggleLargeText} aria-label="큰 글씨 모드"><ALargeSmall /></button><button className="icon-button" onClick={toggleDark} aria-label={dark ? "라이트 모드" : "다크 모드"}>{dark ? <Sun /> : <Moon />}</button></div>
    </header>
    <div className="detail-layout"><article className={`detail-wrap ${section === "repairs" ? "repair-detail-wrap" : ""}`}>
      <div className="detail-heading"><div><span>{labels[section]}{section === "repairs" && <span className="repair-record-number">#{params.id.padStart(4, "0")}</span>}</span><h1>{String(row.title ?? row.equipment_name ?? "")}</h1><p>{detailMeta(section, row)}</p>{section === "repairs" && <div className="repair-heading-status"><RepairStatus value={row.status} /></div>}</div>{(canEdit || canManage) && <div className="detail-actions">{canEdit && <button onClick={() => router.push(`/edit/${section}/${params.id}`)}><Pencil /> 수정</button>}{canManage && <button className="danger" onClick={() => void remove()}><Trash2 /> 삭제</button>}</div>}</div>
      {section === "meetings" && <div className="detail-facts"><div><small>참여자</small><strong>{String(row.participant_names ?? "참여자 없음")}</strong></div></div>}
      {section === "repairs" && <RepairDetail row={row} />}
      {section !== "manuals" && section !== "repairs" && <section className="detail-content"><MarkdownViewer value={content} /></section>}
      {section === "manuals" && <a className="detail-download primary" href={`/api/v1/files/${row.file_id}/content?download=true`}><Download /> PDF 내려받기 <small>{String(row.original_name ?? "")}</small></a>}
    </article><DetailHistory section={section} currentId={Number(params.id)} rows={rows} /></div>
  </main></div>;
}

function detailMeta(section: DetailSection, row: Detail) {
  if (section === "meetings") return `${formatDate(row.meeting_at, true)} · 작성 ${row.author_name ?? ""} · 마지막 수정 ${row.updated_by_name ?? row.author_name ?? ""}`;
  if (section === "repairs") return `${row.requester_name ?? ""} 작성 · ${formatDate(row.written_at ?? row.created_at)}`;
  if (section === "manuals") return `버전 ${row.version_no ?? 1} · ${row.author_name ?? ""}`;
  return `${row.author_name ?? ""} · ${formatDate(row.created_at)}`;
}
function formatDate(value: unknown, hourOnly = false) { if (!value) return ""; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("ko-KR", hourOnly ? { year: "numeric", month: "long", day: "numeric", hour: "2-digit", hourCycle: "h23" } : { year: "numeric", month: "long", day: "numeric" }).format(date); }
function PageLoader() { return <main className="page-loader"><LoadingIndicator label="내용을 불러오는 중" /></main>; }
