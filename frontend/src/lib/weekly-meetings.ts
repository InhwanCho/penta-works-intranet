import { marked } from "marked";

export type WeeklySections = { lastWeek: string; ongoing: string; plans: string };
export const weeklyHeadings = ["지난주 진행 내용", "진행 중인 일·이슈", "이번 주·예정 작업"] as const;
function dateOnly(value: unknown) { return String(value ?? "").slice(0,10); }
function format(date: Date) { return date.toISOString().slice(0,10); }
export function meetingWeek(value: unknown) {
 const text=dateOnly(value);const date=new Date(`${text}T12:00:00Z`);
 if (Number.isNaN(date.getTime())) return null;
 date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
 const start=format(date);date.setUTCDate(date.getUTCDate()+6);
 return {start,end:format(date)};
}
export function reportWeek(value: unknown) {
 const week=meetingWeek(value);if(!week)return null;
 const date=new Date(`${week.start}T12:00:00Z`);date.setUTCDate(date.getUTCDate()-7);
 const start=format(date);date.setUTCDate(date.getUTCDate()+6);
 return {start,end:format(date)};
}
export function weekLabel(week: {start:string;end:string}|null) {return week ? `${week.start.replaceAll("-",".")} ~ ${week.end.replaceAll("-",".")}` : "회의일을 선택해주세요";}
export function meetingDateLabel(value: unknown) {
 const date=new Date(`${dateOnly(value)}T12:00:00Z`);
 return Number.isNaN(date.getTime()) ? "회의일 미입력" : new Intl.DateTimeFormat("ko-KR",{month:"long",day:"numeric",weekday:"short",timeZone:"UTC"}).format(date);
}
export function weeklyMeetingTitle(value: unknown) {const text=dateOnly(value);return /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${Number(text.slice(5,7))}월 ${Number(text.slice(8,10))}일 주간 회의록` : "주간 회의록";}
export function splitWeeklyContent(value: string): WeeklySections {
 const sections={lastWeek:"",ongoing:"",plans:""};
 const keys=["lastWeek","ongoing","plans"] as const;
 const regex=/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi;
 const matches=[...value.matchAll(regex)].filter(match=>weeklyHeadings.includes(match[1].replace(/<[^>]+>/g,"").trim() as typeof weeklyHeadings[number]));
 if(matches.length!==3 || matches.some((m,i)=>m[1].replace(/<[^>]+>/g,"").trim()!==weeklyHeadings[i])) return {...sections,lastWeek:value};
 const prefix=value.slice(0,matches[0].index).trim();
 for(let i=0;i<3;i++){const match=matches[i];sections[keys[i]]=value.slice(match.index!+match[0].length,i<2?matches[i+1].index:value.length);}
 if(prefix)sections.lastWeek=prefix+sections.lastWeek;
 return sections;
}
export function joinWeeklyContent(sections: WeeklySections) {
 const html=(text:string)=>/<([a-z][\w-]*)\b[^>]*>/i.test(text) ? text : marked.parse(text,{async:false}) as string;
 return `<h2>${weeklyHeadings[0]}</h2>${html(sections.lastWeek)}<h2>${weeklyHeadings[1]}</h2>${html(sections.ongoing)}<h2>${weeklyHeadings[2]}</h2>${html(sections.plans)}`;
}
export function hasWeeklyContent(value: string) {
 const sections=splitWeeklyContent(value);
 return Object.values(sections).some(text=>text.replace(/<[^>]+>/g,"").replace(/&nbsp;/g," ").trim());
}
