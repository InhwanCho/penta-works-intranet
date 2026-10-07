"use client";
import Link from "next/link";
import { useState } from "react";
import { recordText } from "@/lib/record-text";
import { meetingDateLabel, reportWeek, splitWeeklyContent, weekLabel } from "@/lib/weekly-meetings";
type Row=Record<string,string|number|boolean|null>;
export default function WeeklyMeetings({rows}:{rows:Row[]}) {
 const [query,setQuery]=useState("");
 const filtered=rows.filter(r=>`${r.title} ${recordText(String(r.content_markdown??""))}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>String(b.meeting_at).localeCompare(String(a.meeting_at)));
 return <div className="weekly-meetings"><div className="weekly-meeting-intro"><div><span>매주 첫 번째 근무일</span><h2>지난주에 한 일을 함께 확인하는 시간</h2><p>지난주 진행 내용, 진행 중인 일·이슈, 이번 주 계획을 한 회의록에서 이어 봅니다.</p></div><Link href="/write/meetings">회의록 작성</Link></div><label className="weekly-meeting-search">회의록 검색<input type="search" placeholder="병원, 수리 내용, 작업 계획 검색" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="weekly-meeting-list">{filtered.map(row=>{const sections=splitWeeklyContent(String(row.content_markdown??""));return <Link href={`/meetings/${row.id}`} className="weekly-meeting-card" key={String(row.id)}><div className="weekly-meeting-date"><small>회의일</small><strong>{meetingDateLabel(row.meeting_at)}</strong><span>{String(row.meeting_at).slice(0,4)}년</span></div><div className="weekly-meeting-card-main"><h3>{String(row.title)}</h3><p className="weekly-report-period">지난주 보고 · {weekLabel(reportWeek(row.meeting_at))}</p><p>{recordText(sections.lastWeek)||"지난주 진행 내용이 아직 없습니다."}</p><div className="weekly-meeting-tags">{recordText(sections.ongoing)&&<span>진행 중·이슈</span>}{recordText(sections.plans)&&<span>이번 주·예정 작업</span>}</div><small>작성 {String(row.author_name??"")}{row.participant_names?` · 참석 ${row.participant_names}`:""}</small></div></Link>;})}{!filtered.length&&<div className="empty big">{rows.length?"검색에 맞는 회의록이 없습니다.":"첫 주간 회의록을 작성해주세요."}</div>}</div></div>;
}
