"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { Building2, CalendarDays, ChevronRight, ClipboardList, FileDown, Printer, RotateCcw, Search, Trash2, UserRound, Wrench, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { recordText } from "@/lib/record-text";
import { useApiQuery } from "@/lib/use-api-query";
import { api } from "@/lib/api";
import { AcrInspectionView, PmInspectionView } from "@/components/service-inspection-forms";

const MarkdownViewer = dynamic(() => import("@/components/markdown-viewer"), { ssr: false });
type RecordRow = Record<string, string | number | boolean | null>;
const statuses = [
  { value: "ALL", label: "전체" },
  { value: "RECEIVED", label: "접수" },
  { value: "IN_PROGRESS", label: "처리 중" },
  { value: "REVISIT", label: "재방문" },
  { value: "COMPLETED", label: "완료" },
];

export function RepairStatus({ value }: { value: unknown }) {
  const status = statuses.find((item) => item.value === value);
  return <span className={`repair-status status-${String(value).toLowerCase()}`}><i aria-hidden />{status?.label ?? "상태 미정"}</span>;
}

export function repairDate(value: unknown) {
  if (!value) return "미기재";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}. ${match[2]}. ${match[3]}.` : String(value);
}

export function RepairList({ rows }: { rows: RecordRow[] }) {
  const [view, setView] = useState("summary");
  useEffect(() => { const saved = localStorage.getItem("penta:repair-list-view"); if (saved === "cards" || saved === "summary") setView(saved); }, []);
  function changeView(value: string) { setView(value); localStorage.setItem("penta:repair-list-view", value); }
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [order, setOrder] = useState("newest");
  const [showTrash, setShowTrash] = useState(false);
  const trash = useApiQuery<RecordRow[]>("/repairs/trash", showTrash);
  const records = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return rows.filter((row) => (status === "ALL" || row.status === status) &&
      [row.equipment_name, row.hospital_name, row.model_name, row.assignee_name, recordText(String(row.description_markdown ?? ""))]
        .some((value) => String(value ?? "").toLocaleLowerCase().includes(keyword)))
      .sort((a, b) => {
        const result = String(b.written_at ?? b.created_at ?? "").localeCompare(String(a.written_at ?? a.created_at ?? "")) || Number(b.id) - Number(a.id);
        return order === "newest" ? result : -result;
      });
  }, [order, query, rows, status]);

  return <div className="repair-list">
    <div className="repair-list-intro"><p>병원과 장비별 서비스 작업 내용과 진행 상태를 한눈에 확인하세요.</p><span>전체 <strong>{rows.length}</strong>건</span></div>
    <div className="repair-overview" aria-label="수리 현황">{statuses.slice(1).map((item) => <button key={item.value} onClick={() => setStatus(item.value)}><span>{item.label}</span><strong>{rows.filter((row) => row.status === item.value).length}<small>건</small></strong></button>)}</div>
    <div className="repair-view-switch" aria-label="목록 보기 방식"><button aria-pressed={view === "summary"} onClick={() => changeView("summary")}>요약 보기</button><button aria-pressed={view === "cards"} onClick={() => changeView("cards")}>카드 보기</button><button onClick={() => exportRepairCsv(records)}><FileDown /> CSV</button><button aria-pressed={showTrash} onClick={() => setShowTrash(!showTrash)}><Trash2 /> 휴지통</button></div>
    {showTrash && <section className="repair-trash"><div className="repair-trash-head"><div><h2>삭제된 서비스 기록</h2><p>삭제 후 30일이 지나면 자동으로 완전 삭제됩니다.</p></div><button onClick={() => setShowTrash(false)}><X /></button></div>{(trash.data ?? []).map((row) => <article key={String(row.id)}><div><strong>{String(row.equipment_name)}</strong><span>{hospitalLabel(row)} · {repairDate(row.written_at)}</span></div><small>{trashDays(row.deleted_at)}일 후 자동삭제</small><button onClick={async () => { await api(`/repairs/${row.id}/restore`, { method: "PATCH" }); await trash.refetch(); }}><RotateCcw /> 복구</button><button className="danger" onClick={async () => { if (!window.confirm("이 기록을 완전히 삭제할까요? 사진과 점검표도 함께 삭제되며 복구할 수 없습니다.")) return; await api(`/repairs/${row.id}/purge`, { method: "DELETE" }); await trash.refetch(); }}><Trash2 /> 완전삭제</button></article>)}{!trash.data?.length && <p className="repair-trash-empty">휴지통이 비어 있습니다.</p>}</section>}
    <div className="repair-toolbar">
      <label className="repair-search"><Search aria-hidden /><span className="sr-only">수리기록 검색</span><input type="search" placeholder="병원, 장비, 작업 내용 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label className="repair-sort"><span className="sr-only">수리기록 정렬</span><select value={order} onChange={(event) => setOrder(event.target.value)}><option value="newest">작성일 최신순</option><option value="oldest">작성일 오래된순</option></select></label>
    </div>
    <div className="repair-filters" aria-label="수리 상태 필터">{statuses.map((item) => <button key={item.value} aria-pressed={status === item.value} onClick={() => setStatus(item.value)}>{item.label}<span>{item.value === "ALL" ? rows.length : rows.filter((row) => row.status === item.value).length}</span></button>)}</div>
    <p className="repair-result-count" role="status">{records.length}건의 서비스 기록</p>
    {view === "summary" && <div className="repair-summary-table"><div className="repair-summary-header" aria-hidden><span>장비 · 병원</span><span>작업 요약</span><span>작성일 · 담당자</span><span>상태</span></div>{records.map((row) => <Link className="repair-summary-row" href={`/repairs/${row.id}`} key={String(row.id)}><div><strong>{String(row.equipment_name)}</strong><small>{hospitalLabel(row)}{row.model_name ? ` · ${row.model_name}` : ""}</small></div><p>{recordText(String(row.description_markdown ?? "")) || "작업 내용이 없습니다."}</p><div className="repair-summary-date"><span>{repairDate(row.written_at)}</span><small>{String(row.assignee_name || "담당자 미지정")}</small></div><RepairStatus value={row.status} /></Link>)}</div>}
    {view === "cards" && <div className="repair-record-list">{records.map((row) => <Link className="repair-record" href={`/repairs/${row.id}`} key={String(row.id)}>
      <div className="repair-record-icon"><Wrench aria-hidden /></div>
      <div className="repair-record-main">
        <div className="repair-record-top"><span className="repair-hospital"><Building2 aria-hidden />{hospitalLabel(row)}</span><RepairStatus value={row.status} /></div>
        <h2>{String(row.equipment_name)}</h2>
        {row.model_name && <p className="repair-model">모델 {String(row.model_name)}</p>}
        <p className="repair-summary">{recordText(String(row.description_markdown ?? "")) || "작업 내용이 없습니다."}</p>
        <div className="repair-record-meta"><span><CalendarDays aria-hidden />{repairDate(row.written_at)}</span><span><UserRound aria-hidden />{row.assignee_name ? `담당 ${row.assignee_name}` : "담당자 미지정"}</span></div>
      </div>
      <ChevronRight className="repair-open-icon" aria-hidden />
    </Link>)}</div>}
    {!records.length && <div className="repair-empty"><ClipboardList aria-hidden /><h2>{rows.length ? "일치하는 서비스 기록이 없습니다" : "첫 서비스 기록을 남겨보세요"}</h2><p>{rows.length ? "검색어나 상태 필터를 바꿔보세요." : "PM, 수리, ACR, Cold Head 작업과 사진을 함께 보관할 수 있습니다."}</p>{rows.length ? <button onClick={() => { setQuery(""); setStatus("ALL"); }}>필터 초기화</button> : <Link href="/write/repairs">서비스 기록 작성</Link>}</div>}
  </div>;
}

export function RepairDetail({ row }: { row: RecordRow }) {
  const photos = useApiQuery<RecordRow[]>(`/service-photos?repairId=${row.id}`, Boolean(row.id));
  const pm = useApiQuery<unknown>(`/repairs/${row.id}/pm`, Boolean(row.id) && row.service_type === "PM");
  const acr = useApiQuery<unknown>(`/repairs/${row.id}/acr`, Boolean(row.id) && row.service_type === "ACR");
  const components = useApiQuery<RecordRow[]>(`/repairs/${row.id}/components`, Boolean(row.id));
  const [activePhoto, setActivePhoto] = useState<number | null>(null);
  const content = String(row.description_markdown ?? "");
  const fees = [["기술료", row.labor_fee], ["부품비", row.parts_fee], ["출장비", row.travel_fee], ["합계", row.total_fee]] as const;
  const hasFees = fees.some(([, value]) => present(value));
  const equipment = [["형명·모델명", row.model_name], ["서비스 구분", serviceTypeLabel(row.service_type, row.acr_kind)], ["계약 구분", row.contract_type], ["담당 엔지니어", row.engineer_name]] as const;
  const work = [["작업일", row.work_date ? repairDate(row.work_date) : null], ["작업시간", row.work_start_time || row.work_end_time ? `${String(row.work_start_time ?? "미기재").slice(0, 5)} ~ ${String(row.work_end_time ?? "미기재").slice(0, 5)}` : null], ["교통시간", present(row.travel_minutes) ? `${row.travel_minutes}분` : null]] as const;
  return <div className="repair-detail-grid">
    <div className="repair-detail-main">
      <div className="repair-print-actions"><button onClick={() => window.print()}><Printer /> 인쇄·PDF 저장</button></div>
      {present(row.symptom) && <TextPanel title="증상·요청사항" value={row.symptom} />}
      <section className="repair-panel repair-work-content"><h2><ClipboardList aria-hidden />주요 작업 내역</h2><MarkdownViewer value={content} /></section>
      {present(row.special_notes) && <TextPanel title="특기사항" value={row.special_notes} />}
      {present(row.parts_details) && <TextPanel title="부품 내역" value={row.parts_details} />}
      {Boolean(components.data?.length) && <section className="repair-panel"><h2>연결 부품</h2><div className="repair-component-links">{components.data?.map((component) => <article key={String(component.component_id)}><strong>{String(component.name)}</strong><span>{[component.equipment_model, component.part_number && `P/N ${component.part_number}`, component.serial_number && `S/N ${component.serial_number}`].filter(Boolean).join(" · ")}</span><small>{String(component.action_type)} · {String(component.quantity)}개</small></article>)}</div></section>}
      {row.service_type === "PM" && <PmInspectionView payload={pm.data} />}
      {row.service_type === "ACR" && <AcrInspectionView payload={acr.data} />}
      {present(row.follow_up) && <TextPanel title="후속 조치·재방문 계획" value={row.follow_up} />}
      {present(row.remarks) && <TextPanel title="비고" value={row.remarks} />}
      {Boolean(photos.data?.length) && <section className="repair-panel"><h2>작업 사진</h2><div className="service-photo-grid">{photos.data?.map((photo, index) => <button type="button" onClick={() => setActivePhoto(index)} key={String(photo.id)}><Image src={`/api/v1/service-photos/${photo.id}/thumbnail`} width={Number(photo.thumbnail_width_px ?? photo.width_px) || 480} height={Number(photo.thumbnail_height_px ?? photo.height_px) || 360} unoptimized alt={String(photo.original_name || "작업 사진")} /></button>)}</div></section>}
    </div>
    <aside className="repair-detail-aside" aria-label="수리기록 정보">
      <section className="repair-panel"><h2>기록 정보</h2><dl className="repair-facts">{field("병원명", hospitalLabel(row))}{field("작성일", repairDate(row.written_at))}{field("작성자", row.requester_name)}{field("담당자", row.assignee_name || "미지정")}</dl></section>
      {equipment.some(([, value]) => present(value)) && <section className="repair-panel"><h2>장비 정보</h2><dl className="repair-facts">{equipment.map(([label, value]) => field(label, value))}</dl></section>}
      {work.some(([, value]) => present(value)) && <section className="repair-panel"><h2>작업 일정</h2><dl className="repair-facts">{work.map(([label, value]) => field(label, value))}</dl></section>}
      {[row.he_level,row.coldhead_position,row.coldhead_serial,row.coldhead_in_date].some(present) && <section className="repair-panel"><h2>Cold Head·헬륨</h2><dl className="repair-facts">{field("헬륨 레벨", present(row.he_level) ? `${row.he_level}%` : null)}{field("위치", row.coldhead_position)}{field("Serial Number", row.coldhead_serial)}{field("입고일", row.coldhead_in_date ? repairDate(row.coldhead_in_date) : null)}</dl></section>}
      {hasFees && <section className="repair-panel"><h2>청구 내역</h2><dl className="repair-facts repair-fees">{fees.map(([label, value]) => field(label, present(value) ? `${Number(value).toLocaleString("ko-KR")}원` : null))}</dl></section>}
      {present(row.customer_confirmation) && <TextPanel title="고객 확인" value={row.customer_confirmation} />}
    </aside>{activePhoto != null && photos.data?.[activePhoto] && <PhotoLightbox photos={photos.data} index={activePhoto} onChange={setActivePhoto} onClose={() => setActivePhoto(null)} />}
  </div>;
}

function present(value: unknown) { return value !== null && value !== undefined && value !== ""; }
function hospitalLabel(row: RecordRow) { return String(row.hospital_name || "병원명 미기재"); }
function field(label: string, value: unknown) { return present(value) ? <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div> : null; }
function TextPanel({ title, value }: { title: string; value: unknown }) { return <section className="repair-panel"><h2>{title}</h2><p className="pre-line">{String(value)}</p></section>; }

function PhotoLightbox({ photos, index, onChange, onClose }: { photos: RecordRow[]; index: number; onChange: (index: number) => void; onClose: () => void }) {
  const photo = photos[index];
  return <div className="service-lightbox" role="dialog" aria-modal="true" aria-label="작업 사진 크게 보기" onClick={(event) => event.target === event.currentTarget && onClose()}><button className="lightbox-close" onClick={onClose}><X /></button>{index > 0 && <button className="lightbox-prev" onClick={() => onChange(index - 1)}>‹</button>}<Image src={`/api/v1/service-photos/${photo.id}/content`} width={Number(photo.width_px) || 1920} height={Number(photo.height_px) || 1080} unoptimized alt={String(photo.original_name || "작업 사진")} />{index < photos.length - 1 && <button className="lightbox-next" onClick={() => onChange(index + 1)}>›</button>}<span>{index + 1} / {photos.length}</span></div>;
}
function serviceTypeLabel(type: unknown, acrKind: unknown) { if (type === "ACR") return `ACR ${acrKind === "full" ? "정밀" : acrKind === "pretest" ? "사전 TEST" : "서류"}`; return ({ PM:"정기점검(PM)",REPAIR:"고장수리",COLDHEAD:"Cold Head",CALL:"Call",ETC:"기타" } as Record<string,string>)[String(type)] ?? String(type ?? ""); }
function trashDays(value: unknown) { const deleted = new Date(String(value)); return Math.max(0, 30 - Math.floor((Date.now() - deleted.getTime()) / 86400000)); }
function exportRepairCsv(rows: RecordRow[]) {
  const columns: Array<[string, keyof RecordRow]> = [["작성일","written_at"],["병원","hospital_name"],["장비","equipment_name"],["모델","model_name"],["구분","service_type"],["상태","status"],["작업내용","description_markdown"],["증상","symptom"],["부품","parts_details"],["담당","assignee_name"]];
  const escape = (value: unknown) => { const text = String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
  const csv = "\uFEFF" + [columns.map(([label]) => label).join(","), ...rows.map((row) => columns.map(([,key]) => escape(row[key])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `penta-service-${new Date().toISOString().slice(0,10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
}
