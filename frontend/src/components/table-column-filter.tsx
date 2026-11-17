"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Filter } from "lucide-react";

export function TableColumnFilter({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:{value:string;label:string}[]}) {
  const id=useId();
  const panel=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const [position,setPosition]=useState({top:0,left:0});
  const [open,setOpen]=useState(false);
  const updatePosition=useCallback(()=>{
    const rect=trigger.current?.getBoundingClientRect();
    if(!rect)return;
    setPosition({top:rect.bottom+6,left:rect.left});
  },[]);
  useEffect(()=>{
    if(!open)return;
    updatePosition();
    // Capture scrolls from the page and any horizontally scrolling table.
    window.addEventListener("scroll",updatePosition,true);
    window.addEventListener("resize",updatePosition);
    const observer=new ResizeObserver(updatePosition);
    if(trigger.current)observer.observe(trigger.current);
    return ()=>{window.removeEventListener("scroll",updatePosition,true);window.removeEventListener("resize",updatePosition);observer.disconnect();};
  },[open,updatePosition]);
  function choose(next:string) { onChange(next);panel.current?.hidePopover();trigger.current?.focus(); }
  return <><button ref={trigger} type="button" className="table-column-filter" data-active={!!value} aria-label={`${label} 필터${value?`: ${options.find(option=>option.value===value)?.label}`:""}`} aria-expanded={open} aria-controls={id} onClick={()=>{
    if(open){panel.current?.hidePopover();return;}
    updatePosition();panel.current?.showPopover();
  }}>{label}<Filter size={13} strokeWidth={1.25}/>{value && <span className="table-filter-value">{options.find(option=>option.value===value)?.label}</span>}</button>
  <div ref={panel} id={id} popover="auto" className="table-filter-popover" style={position} onToggle={event=>setOpen(event.newState==="open")}><strong>{label} 필터</strong><div role="group" aria-label={`${label} 조건`}>{options.map(option=><button type="button" key={option.value} aria-pressed={value===option.value} onClick={()=>choose(option.value)}><span aria-hidden>{value===option.value?"✓":""}</span>{option.label}</button>)}</div></div></>;
}
