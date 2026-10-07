"use client";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { joinWeeklyContent, reportWeek, splitWeeklyContent, weekLabel, weeklyHeadings, type WeeklySections } from "@/lib/weekly-meetings";
const Editor=dynamic(()=>import("@/components/markdown-editor"),{ssr:false});
export default function WeeklyMeetingEditor({value,meetingAt,onChange,onUploaded}:{value:string;meetingAt:string;onChange:(value:string)=>void;onUploaded:(id:number)=>void}) {
 const sections=useMemo(()=>splitWeeklyContent(value),[value]);
 const keys: Array<keyof WeeklySections>=["lastWeek","ongoing","plans"];
 const descriptions=[`보고 기간 ${weekLabel(reportWeek(meetingAt))}. 지난주 수행한 방문·점검·수리와 결과를 기록하세요.`,"계속 진행하는 작업, 테스트 실패, 병원별 이슈와 후속 조치를 기록하세요.","이번 주 방문·PM·수리 계획과 미리 확인해야 할 예정 작업을 기록하세요."];
 return <div className="weekly-meeting-editor">{keys.map((key,i)=><section className="form-section weekly-meeting-section" key={key}><div className="weekly-section-heading"><span>{String(i+1).padStart(2,"0")}</span><div><h2>{weeklyHeadings[i]}</h2><p>{descriptions[i]}</p></div></div><Editor value={sections[key]} onChange={content=>onChange(joinWeeklyContent({...sections,[key]:content}))} onUploaded={onUploaded}/></section>)}</div>;
}
