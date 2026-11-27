"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search, ArrowUpRight } from "lucide-react";
import { recordText } from "@/lib/record-text";
import { useApiQuery } from "@/lib/use-api-query";
import { workshopStatuses as statuses, type WorkshopRepairRow } from "@/lib/workshop-repairs";

export default function WorkshopRepairs() {
 const list=useApiQuery<WorkshopRepairRow[]>("/workshop-repairs");
 const [query,setQuery]=useState("");
 const [filter,setFilter]=useState("");
 const records=list.data??[];
 const filtered=records.filter(r=>(!filter||r.status===filter)&&`${r.equipment_name} ${r.description_markdown??""}`.toLowerCase().includes(query.trim().toLowerCase()));
 return <div className="work-log-wrap workshop-page"><header className="workshop-heading"><h1>수리 기록</h1><Link href="/workshop-repairs/new" className="workshop-create"><Plus aria-hidden/>수리 기록 작성</Link></header>
 <section className="workshop-directory" aria-label="수리 기록 목록">
 <div className="workshop-tools"><label className="workshop-search"><Search aria-hidden/><input type="search" aria-label="수리 기록 검색" placeholder="장비·부품명, 작업 내용 검색" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 <fieldset className="workshop-filters"><legend className="sr-only">수리 상태 필터</legend>{[["","전체"],...Object.entries(statuses)].map(([key,label])=><label key={key} className={filter===key?"selected":""}><input type="radio" name="workshop-status" value={key} checked={filter===key} onChange={()=>setFilter(key)}/><span>{label}</span><small>{records.filter(r=>!key||r.status===key).length}</small></label>)}</fieldset></div>
 <div className="workshop-result-count">수리 기록 <strong>{filtered.length}</strong>건</div>
 {list.isPending?<p role="status">불러오는 중…</p>:list.isError?<p className="error">{list.error.message}</p>:<div className="workshop-records">
 <div className="workshop-column-head" aria-hidden="true"><span>장비·부품 / 작업 내용</span><span>수량</span><span>상태</span><span>작업일 / 작성자</span><span/></div>
 {filtered.map(r=><Link className="workshop-record" key={String(r.id)} href={`/workshop-repairs/${r.id}`}><div className="workshop-record-title"><h2>{String(r.equipment_name)}</h2><p>{recordText(String(r.description_markdown??""))||"작업 내용 없음"}</p></div><span className="workshop-quantity">{String(r.quantity)}<small>EA</small></span><span className={`workshop-status status-${r.status}`}>{statuses[String(r.status)]??String(r.status)}</span><div className="workshop-record-meta"><time>{String(r.work_date).slice(0,10).replaceAll("-",".")}</time><span>{String(r.author_name)}</span></div><ArrowUpRight className="workshop-record-arrow" aria-hidden/></Link>)}
 {!filtered.length&&<div className="workshop-empty">{records.length?"검색 조건에 맞는 수리 기록이 없습니다.":"등록된 수리 기록이 없습니다."}</div>}</div>}
 </section></div>;
}
