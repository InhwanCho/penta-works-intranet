"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { ALargeSmall, ArrowLeft, Download, Moon, Pencil, Sun, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { usePreferences } from "@/components/preferences-provider";
import { api } from "@/lib/api";
import LoadingIndicator from "@/components/loading-indicator";

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
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!valid) { router.replace("/"); return; }
    void Promise.all([api<Detail>(`/${section}/${params.id}`), api<Me>("/auth/me")]).then(([detail, current]) => { setRow(detail); setMe(current); }).catch((reason) => setError(reason instanceof Error ? reason.message : "내용을 불러오지 못했습니다."));
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
  return <main className="detail-page">
    <header className="write-header">
      <button className="icon-button" onClick={() => router.back()} aria-label="뒤로 가기"><ArrowLeft /></button>
      <button className="write-logo brand-lockup" onClick={() => router.push("/")} aria-label="대시보드로 이동"><Image src="/favicon/android-chrome-192x192.png" width={38} height={38} alt="" /><b>PENTA <small>OFFICE</small></b></button>
      <div className="write-header-actions"><button className={`icon-button ${largeText ? "active" : ""}`} onClick={toggleLargeText} aria-label="큰 글씨 모드"><ALargeSmall /></button><button className="icon-button" onClick={toggleDark} aria-label={dark ? "라이트 모드" : "다크 모드"}>{dark ? <Sun /> : <Moon />}</button></div>
    </header>
    <article className="detail-wrap">
      <div className="detail-heading"><div><span>{labels[section]}</span><h1>{String(row.title ?? row.equipment_name ?? "")}</h1><p>{detailMeta(section, row)}</p></div>{(canEdit || canManage) && <div className="detail-actions">{canEdit && <button onClick={() => router.push(`/edit/${section}/${params.id}`)}><Pencil /> 수정</button>}{canManage && <button className="danger" onClick={() => void remove()}><Trash2 /> 삭제</button>}</div>}</div>
      {section === "meetings" && <div className="detail-facts"><div><small>참여자</small><strong>{String(row.participant_names ?? "참여자 없음")}</strong></div></div>}
      {section === "repairs" && <><div className="detail-facts">{fact("작성일", row.written_at)}{fact("병원명", row.hospital_name)}{fact("형명·모델명", row.model_name)}{fact("서비스 구분", row.service_type)}{fact("계약 구분", row.contract_type)}{fact("제조국", row.manufacture_country)}{fact("제조사", row.manufacturer)}{fact("제조년월일", row.manufacture_date)}{fact("작업일", row.work_date)}{fact("작업시간", row.work_start_time || row.work_end_time ? `${String(row.work_start_time ?? "").slice(0,5)} ~ ${String(row.work_end_time ?? "").slice(0,5)}` : null)}{fact("교통시간", row.travel_minutes != null ? `${row.travel_minutes}분` : null)}{fact("담당자", row.assignee_name ?? "미지정")}{fact("상태", repairStatus(row.status))}</div>{row.special_notes && <section className="detail-sub"><h2>특기사항</h2><p className="pre-line">{String(row.special_notes)}</p></section>}{row.parts_details && <section className="detail-sub"><h2>부품 내역</h2><p className="pre-line">{String(row.parts_details)}</p></section>}<div className="detail-facts">{fact("기술료", money(row.labor_fee))}{fact("부품비", money(row.parts_fee))}{fact("출장비", money(row.travel_fee))}{fact("합계", money(row.total_fee))}{fact("고객 확인", row.customer_confirmation)}</div>{row.remarks && <section className="detail-sub"><h2>비고</h2><p className="pre-line">{String(row.remarks)}</p></section>}</>}
      {section !== "manuals" && <section className="detail-content"><MarkdownViewer value={content} /></section>}
      {section === "manuals" && <a className="detail-download primary" href={`/api/v1/files/${row.file_id}/content?download=true`}><Download /> PDF 내려받기 <small>{String(row.original_name ?? "")}</small></a>}
    </article>
  </main>;
}

function detailMeta(section: DetailSection, row: Detail) {
  if (section === "meetings") return `${formatDate(row.meeting_at, true)} · 작성 ${row.author_name ?? ""} · 마지막 수정 ${row.updated_by_name ?? row.author_name ?? ""}`;
  if (section === "repairs") return `${row.requester_name ?? ""} 작성 · ${formatDate(row.written_at ?? row.created_at)}`;
  if (section === "manuals") return `버전 ${row.version_no ?? 1} · ${row.author_name ?? ""}`;
  return `${row.author_name ?? ""} · ${formatDate(row.created_at)}`;
}
function formatDate(value: unknown, hourOnly = false) { if (!value) return ""; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("ko-KR", hourOnly ? { year: "numeric", month: "long", day: "numeric", hour: "2-digit", hourCycle: "h23" } : { year: "numeric", month: "long", day: "numeric" }).format(date); }
function repairStatus(value: unknown) { return ({ RECEIVED: "접수", IN_PROGRESS: "처리 중", COMPLETED: "완료" } as Record<string, string>)[String(value)] ?? String(value ?? ""); }
function fact(label: string, value: unknown) { return value === null || value === undefined || value === "" ? null : <div key={label}><small>{label}</small><strong>{String(value)}</strong></div>; }
function money(value: unknown) { if (value === null || value === undefined || value === "") return null; return `${Number(value).toLocaleString("ko-KR")}원`; }
function PageLoader() { return <main className="page-loader"><LoadingIndicator label="내용을 불러오는 중" /></main>; }
