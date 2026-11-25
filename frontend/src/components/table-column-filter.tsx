"use client";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Filter, FilterX } from "lucide-react";

export type ColumnFilterValue = { selected: string[] | null; from: string; to: string; sort: "asc" | "desc" | "" };
export const emptyColumnFilter: ColumnFilterValue = {selected:null,from:"",to:"",sort:""};
export function TableColumnFilter({label,value,onChange,options,dates=false}:{label:string;value:ColumnFilterValue;onChange:(value:ColumnFilterValue)=>void;options:{value:string;label:string}[];dates?:boolean}) {
  const id=useId(),panel=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const [position,setPosition]=useState({top:0,left:0,maxHeight:600});
  const [open,setOpen]=useState(false),[searchInput,setSearch]=useState("");
  const search=useDebouncedValue(searchInput);
  const [draft,setDraft]=useState(value);
  const active=value.selected!==null||!!value.from||!!value.to;
  const updatePosition=useCallback(()=>{
    const rect=trigger.current?.getBoundingClientRect();if(!rect)return;
    const below=window.innerHeight-rect.bottom-14,above=rect.top-14;
    const height=Math.min(panel.current?.scrollHeight || (dates?550:300),window.innerHeight-24);
    const flip=below<height && above>below;
    const available=Math.max(80,flip?above:below);
    setPosition({top:flip?Math.max(8,rect.top-Math.min(height,available)-6):rect.bottom+6,left:Math.max(8,Math.min(rect.left,window.innerWidth-294)),maxHeight:available});
  },[dates]);
  useEffect(()=>{
    if(!open)return;
    updatePosition();window.addEventListener("scroll",updatePosition,true);window.addEventListener("resize",updatePosition);
    const observer=new ResizeObserver(updatePosition);if(trigger.current)observer.observe(trigger.current);
    return ()=>{window.removeEventListener("scroll",updatePosition,true);window.removeEventListener("resize",updatePosition);observer.disconnect();};
  },[open,updatePosition]);
  function close(){panel.current?.hidePopover();trigger.current?.focus();}
  function apply(next:ColumnFilterValue){onChange(next);close();}
  const shown=options.filter(option=>option.label.toLowerCase().includes(search.toLowerCase()));
  const selected=draft.selected??options.map(option=>option.value);
  const allShown=shown.length>0&&shown.every(option=>selected.includes(option.value));
  function toggle(values:string[],checked:boolean){const next=checked?[...new Set([...selected,...values])]:selected.filter(item=>!values.includes(item));setDraft({...draft,selected:options.every(option=>next.includes(option.value))?null:next});}
  const invalid=!!draft.from&&!!draft.to&&draft.from>draft.to;
  return <><button ref={trigger} type="button" className="table-column-filter" data-active={active||!!value.sort} aria-label={`${label} 필터`} aria-expanded={open} aria-controls={id} onClick={()=>{if(open){close();return;}setDraft(value);setSearch("");updatePosition();panel.current?.showPopover();}}>{label}<Filter size={13} strokeWidth={1.25}/>{value.sort&&<span aria-label={value.sort==="asc"?"오름차순 적용":"내림차순 적용"}>{value.sort==="asc"?"↑":"↓"}</span>}{active&&<span className="table-filter-value">필터 적용</span>}</button>
  <div ref={panel} id={id} popover="auto" className="table-filter-popover excel-filter" style={position} onToggle={event=>setOpen(event.newState==="open")}>
    <strong>{label}</strong>
    {dates&&<div className="excel-filter-sort"><button type="button" aria-pressed={value.sort==="asc"} onClick={()=>apply({...value,sort:"asc"})}><ArrowUpNarrowWide size={15}/>오름차순 정렬 <small>이전 날짜부터</small></button><button type="button" aria-pressed={value.sort==="desc"} onClick={()=>apply({...value,sort:"desc"})}><ArrowDownWideNarrow size={15}/>내림차순 정렬 <small>최근 날짜부터</small></button></div>}
    <button type="button" className="excel-filter-clear" onClick={()=>apply({...emptyColumnFilter})}><FilterX size={15}/>이 열의 필터·정렬 지우기</button>
    {dates&&<div className="excel-filter-dates"><label>시작일<input type="date" value={draft.from} onChange={event=>setDraft({...draft,from:event.target.value})}/></label><label>종료일<input type="date" value={draft.to} onChange={event=>setDraft({...draft,to:event.target.value})}/></label></div>}
    {(!dates || options.length>0)&&<><input type="search" aria-label={`${label} 필터 값 검색`} placeholder={dates?"상태 검색":"값 검색"} value={searchInput} onChange={event=>setSearch(event.target.value)}/>
    <div className="excel-filter-values" role="group" aria-label={`${label} 값 선택`}>
      <label><input type="checkbox" checked={allShown} disabled={!shown.length} ref={node=>{if(node)node.indeterminate=!allShown&&shown.some(option=>selected.includes(option.value));}} onChange={event=>toggle(shown.map(option=>option.value),event.target.checked)}/>{search?"검색된 값 모두 선택":"모두 선택"}</label>
      {shown.map(option=><label key={option.value}><input type="checkbox" checked={selected.includes(option.value)} onChange={event=>toggle([option.value],event.target.checked)}/>{option.label}</label>)}
      {!shown.length&&<p>일치하는 값이 없습니다.</p>}
    </div>
    </>}
    {invalid&&<p role="alert">종료일은 시작일 이후로 선택해주세요.</p>}
    <footer><button type="button" onClick={close}>취소</button><button type="button" className="excel-filter-apply" disabled={invalid} onClick={()=>apply(draft)}>적용</button></footer>
  </div></>;
}
