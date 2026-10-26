"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, upload } from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";
import MarkdownViewer from "@/components/markdown-viewer";

type Row = Record<string, string | number | null>;
type Detail = Row & { files: Row[]; photos: Row[] };
const categories: Record<string,string> = { EVENT: "사내행사", TOOLS: "공구·사내정리", OFFICE: "사내업무", OTHER: "기타" };
export default function WorkLogs() {
  const logs = useApiQuery<Row[]>("/work-logs");
  const me = useApiQuery<{ id: number; role: string }>("/auth/me").data;
  const [id,setId] = useState<number | null>(null);
  useEffect(() => { const record = new URLSearchParams(window.location.search).get("record"); if (record && /^\d+$/.test(record)) setId(Number(record)); }, []);
  const detail = useApiQuery<Detail>(`/work-logs/${id}`,id !== null);
  const [editing,setEditing] = useState(false);
  const [title,setTitle] = useState("");
  const [content,setContent] = useState("");
  const [date,setDate] = useState(new Intl.DateTimeFormat("sv-SE").format(new Date()));
  const [category,setCategory] = useState("OTHER");
  const [fileIds,setFileIds] = useState<number[]>([]);
  const [fileNames,setFileNames] = useState<string[]>([]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [migration,setMigration] = useState(false);
  const [query,setQuery] = useState("");
  const candidates = useApiQuery<Row[]>("/work-logs/migration-candidates",migration && me?.role === "ADMIN");
  async function save() {
    setBusy(true); setError("");
    try { const result = await api<{id:number}>(id ? `/work-logs/${id}` : "/work-logs",{ method:id ? "PUT" : "POST",body:JSON.stringify({ title,contentMarkdown:content,workDate:date,category,fileIds }) }); if (!id) setId(result.id); setEditing(false); }
    catch(e) { setError(e instanceof Error ? e.message : "저장 실패"); } finally { setBusy(false); }
  }
  function edit(row?: Row) { setId(row ? Number(row.id) : null); setTitle(String(row?.title ?? "")); setContent(String(row?.content_markdown ?? "")); setDate(String(row?.work_date ?? new Intl.DateTimeFormat("sv-SE").format(new Date()))); setCategory(String(row?.category ?? "OTHER"));setFileIds([]);setFileNames([]);setEditing(true);setError(""); }
  async function move(row:Row) {
    if (!window.confirm(`“${row.service_title || row.equipment_name}” 기록을 ${categories[category]} 업무일지로 옮길까요?`)) return;
    setBusy(true);setError("");
    try { const result=await api<{id:number}>(`/work-logs/from-repair/${row.id}`,{method:"POST",body:JSON.stringify({category})});setId(result.id);setEditing(false); }
    catch(e) { setError(e instanceof Error ? e.message : "이동 실패"); } finally {setBusy(false);}
  }
  const row=detail.data;
  return <div className="work-log-wrap">
    <p className="text-muted">사내행사, 공구 정리와 일반 사내업무를 기록합니다. 병원 방문·점검·수리 이력은 병원·장비에서 관리합니다.</p>
    <div className="page-actions"><button className="primary" onClick={() => edit()}>업무일지 작성</button>{me?.role === "ADMIN" && <button onClick={() => setMigration(!migration)}>기존 서비스 기록 이동</button>}</div>
    {error && <div className="error" role="alert">{error}</div>}
    {migration && <section className="repair-panel"><h2>기존 기록 이동</h2><p>사내 활동 기록만 골라 이동하세요. 병원 연결이 있는 기록도 내용을 확인해 선택할 수 있습니다. 연결된 부품·일정이 있으면 이동이 차단됩니다.</p><label>이동할 분류<select value={category} onChange={e => setCategory(e.target.value)}>{Object.entries(categories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><input aria-label="이동할 기록 검색" placeholder="환송회, 복스알 등 제목 검색" value={query} onChange={e=>setQuery(e.target.value)}/>{candidates.isPending ? <p>불러오는 중…</p> : candidates.isError ? <p className="error">{candidates.error.message}</p> : <div className="hospital-log-list">{candidates.data?.filter(r=>`${r.equipment_name} ${r.service_title}`.includes(query)).map(r=><div key={String(r.id)}><strong>{String(r.service_title || r.equipment_name)}</strong><small>{String(r.written_at)} · {String(r.hospital_name || "병원 미연결")}</small><details><summary>기록 내용 확인</summary><MarkdownViewer value={String(r.description_markdown || "")}/></details><Link href={`/repairs/${r.id}`}>원본 기록 보기·병원 연결 수정</Link><button disabled={busy} onClick={()=>void move(r)}>업무일지로 이동</button></div>)}</div>}</section>}
    {editing ? <form className="repair-panel" onSubmit={e=>{e.preventDefault();void save();}}><div className="form-grid"><label>제목<input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>날짜<input required type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>분류<select value={category} onChange={e=>setCategory(e.target.value)}>{Object.entries(categories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div><label>내용<textarea required rows={10} value={content} onChange={e=>setContent(e.target.value)}/></label><label>사진·PDF 첨부<input type="file" accept="image/jpeg,image/png,image/gif,image/webp,application/pdf" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);try{const f=await upload(file);setFileIds(old=>[...old,f.id]);setFileNames(old=>[...old,f.name]);}catch(err){setError(err instanceof Error?err.message:"업로드 실패");}finally{setBusy(false);e.target.value="";}}}/></label>{fileNames.map((name,i)=><p key={i}>{name}</p>)}<button className="primary" disabled={busy}>저장</button><button type="button" disabled={busy} onClick={()=>setEditing(false)}>취소</button></form> : id !== null && (detail.isPending ? <p>불러오는 중…</p> : detail.isError ? <p className="error">{detail.error.message}</p> : row && <section className="repair-panel"><div className="hospital-section-heading"><h2>{String(row.title)}</h2><button onClick={()=>setId(null)}>닫기</button></div><p>{String(row.work_date)} · {categories[String(row.category)]} · {String(row.author_name)}</p><MarkdownViewer value={String(row.content_markdown)}/>{row.photos.map(photo=><p key={String(photo.id)}><a href={`/api/v1/service-photos/${photo.id}/content`} target="_blank" rel="noreferrer"><Image src={`/api/v1/service-photos/${photo.id}/thumbnail`} width={480} height={360} unoptimized alt={String(photo.original_name || "업무일지 사진")}/></a></p>)}{row.files.map(file=><p key={String(file.id)}><a href={`/api/v1/files/${file.id}/content`} target="_blank" rel="noreferrer">{String(file.original_name)}</a></p>)}{(me?.role==="ADMIN" || me?.id===Number(row.author_id)) && <div className="page-actions"><button onClick={()=>edit(row)}>수정</button><button disabled={busy} onClick={async()=>{if(!window.confirm("업무일지를 삭제할까요?"))return;setBusy(true);try{await api(`/work-logs/${id}`,{method:"DELETE"});setId(null);}catch(e){setError(e instanceof Error?e.message:"삭제 실패");}finally{setBusy(false);}}}>삭제</button></div>}</section>)}
    {logs.isPending ? <p>불러오는 중…</p> : logs.isError ? <p className="error">{logs.error.message}</p> : <div className="list-card">{logs.data?.map(log=><button className="list-row" key={String(log.id)} onClick={()=>{setId(Number(log.id));setEditing(false);}}><div className="list-main"><h3>{String(log.title)}</h3><small>{String(log.work_date)} · {categories[String(log.category)]} · {String(log.author_name)}</small></div></button>)}{!logs.data?.length && <p className="text-muted">등록된 업무일지가 없습니다.</p>}</div>}
  </div>;
}
