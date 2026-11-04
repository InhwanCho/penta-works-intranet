import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

// Same three sections and Monday–Sunday reporting period as office/intranet.
export const meetingHeadings = ["지난주 진행 내용", "진행 중인 일·이슈", "이번 주·예정 작업"] as const;
export type MeetingSections = [string, string, string];
export function meetingHtml(value: string) {
  return sanitizeHtml(marked.parse(value, { async: false }) as string, {
    allowedTags: ["p", "br", "h1", "h2", "h3", "h4", "ul", "ol", "li", "strong", "b", "em", "i", "s", "blockquote", "pre", "code", "a", "table", "thead", "tbody", "tr", "th", "td", "hr"],
    allowedAttributes: { a: ["href", "title"], th: ["colspan", "rowspan"], td: ["colspan", "rowspan"] },
    allowedSchemes: ["https", "http", "mailto"], allowProtocolRelative: false,
  });
}
export function meetingText(value: string) {
  const named: Record<string,string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return sanitizeHtml(meetingHtml(value).replace(/<br\s*\/?\s*>/gi,"\n").replace(/<li\b[^>]*>/gi,"• ").replace(/<\/(p|div|h[1-6]|li|blockquote|pre|tr)>/gi,"\n"),{allowedTags:[],allowedAttributes:{}})
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi,(entity,code:string)=>{
      if(code[0]!=="#")return named[code.toLowerCase()] ?? entity;
      const hex=code[1]?.toLowerCase()==="x", n=Number.parseInt(code.slice(hex?2:1),hex?16:10);
      return Number.isFinite(n)&&n>=0&&n<=0x10ffff?String.fromCodePoint(n):entity;
    }).replace(/\n{3,}/g,"\n\n").trim();
}
export function splitMeeting(value: string): MeetingSections {
  const matches=[...value.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].filter(match=>meetingHeadings.includes(match[1].replace(/<[^>]+>/g,"").trim() as typeof meetingHeadings[number]));
  if(matches.length!==3||matches.some((match,i)=>meetingText(match[1])!==meetingHeadings[i]))return [value,"",""];
  const parts=matches.map((match,i)=>value.slice(match.index!+match[0].length,i<2?matches[i+1].index:value.length)) as MeetingSections;
  parts[0]=value.slice(0,matches[0].index).trim()+parts[0];
  return parts;
}
export function joinMeeting(edited: MeetingSections, original: MeetingSections): string {
  return meetingHeadings.map((heading,i)=>`<h2>${heading}</h2>${edited[i]===meetingText(original[i])?original[i]:meetingHtml(edited[i])}`).join("");
}
export function meetingReportPeriod(value: string) {
  const day=new Date(value.slice(0,10)+"T12:00:00Z");
  if(!Number.isFinite(day.getTime()))return "";
  day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7-7);
  const start=day.toISOString().slice(0,10);day.setUTCDate(day.getUTCDate()+6);
  return `${start.replaceAll("-",".")} ~ ${day.toISOString().slice(0,10).replaceAll("-",".")}`;
}
