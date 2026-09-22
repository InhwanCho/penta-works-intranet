"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { Building2, CalendarDays, ChevronRight, ClipboardList, Search, UserRound, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { recordText } from "@/lib/record-text";
import { useApiQuery } from "@/lib/use-api-query";

const MarkdownViewer = dynamic(() => import("@/components/markdown-viewer"), { ssr: false });
type RecordRow = Record<string, string | number | boolean | null>;
const statuses = [
  { value: "ALL", label: "전체" },
  { value: "RECEIVED", label: "접수" },
  { value: "IN_PROGRESS", label: "처리 중" },
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
    <div className="repair-view-switch" aria-label="목록 보기 방식"><button aria-pressed={view === "summary"} onClick={() => changeView("summary")}>요약 보기</button><button aria-pressed={view === "cards"} onClick={() => changeView("cards")}>카드 보기</button></div>
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
  const content = String(row.description_markdown ?? "");
  const fees = [["기술료", row.labor_fee], ["부품비", row.parts_fee], ["출장비", row.travel_fee], ["합계", row.total_fee]] as const;
  const hasFees = fees.some(([, value]) => present(value));
  const equipment = [["형명·모델명", row.model_name], ["제조사", row.manufacturer], ["제조국", row.manufacture_country], ["제조년월일", row.manufacture_date ? repairDate(row.manufacture_date) : null], ["서비스 구분", row.service_type], ["계약 구분", row.contract_type]] as const;
  const work = [["작업일", row.work_date ? repairDate(row.work_date) : null], ["작업시간", row.work_start_time || row.work_end_time ? `${String(row.work_start_time ?? "미기재").slice(0, 5)} ~ ${String(row.work_end_time ?? "미기재").slice(0, 5)}` : null], ["교통시간", present(row.travel_minutes) ? `${row.travel_minutes}분` : null]] as const;
  return <div className="repair-detail-grid">
    <div className="repair-detail-main">
      <section className="repair-panel repair-work-content"><h2><ClipboardList aria-hidden />주요 작업 내역</h2><MarkdownViewer value={content} /></section>
      {present(row.special_notes) && <TextPanel title="특기사항" value={row.special_notes} />}
      {present(row.parts_details) && <TextPanel title="부품 내역" value={row.parts_details} />}
      {present(row.remarks) && <TextPanel title="비고" value={row.remarks} />}
      {Boolean(photos.data?.length) && <section className="repair-panel"><h2>작업 사진</h2><div className="service-photo-grid">{photos.data?.map((photo) => <a href={`/api/v1/service-photos/${photo.id}/content`} target="_blank" rel="noreferrer" key={String(photo.id)}><Image src={`/api/v1/service-photos/${photo.id}/content`} width={Number(photo.width_px) || 640} height={Number(photo.height_px) || 480} unoptimized alt={String(photo.original_name || "작업 사진")} /></a>)}</div></section>}
    </div>
    <aside className="repair-detail-aside" aria-label="수리기록 정보">
      <section className="repair-panel"><h2>기록 정보</h2><dl className="repair-facts">{field("병원명", hospitalLabel(row))}{field("작성일", repairDate(row.written_at))}{field("작성자", row.requester_name)}{field("담당자", row.assignee_name || "미지정")}</dl></section>
      {equipment.some(([, value]) => present(value)) && <section className="repair-panel"><h2>장비 정보</h2><dl className="repair-facts">{equipment.map(([label, value]) => field(label, value))}</dl></section>}
      {work.some(([, value]) => present(value)) && <section className="repair-panel"><h2>작업 일정</h2><dl className="repair-facts">{work.map(([label, value]) => field(label, value))}</dl></section>}
      {hasFees && <section className="repair-panel"><h2>청구 내역</h2><dl className="repair-facts repair-fees">{fees.map(([label, value]) => field(label, present(value) ? `${Number(value).toLocaleString("ko-KR")}원` : null))}</dl></section>}
      {present(row.customer_confirmation) && <TextPanel title="고객 확인" value={row.customer_confirmation} />}
    </aside>
  </div>;
}

function present(value: unknown) { return value !== null && value !== undefined && value !== ""; }
function hospitalLabel(row: RecordRow) { return String(row.hospital_name || "병원명 미기재"); }
function field(label: string, value: unknown) { return present(value) ? <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div> : null; }
function TextPanel({ title, value }: { title: string; value: unknown }) { return <section className="repair-panel"><h2>{title}</h2><p className="pre-line">{String(value)}</p></section>; }
