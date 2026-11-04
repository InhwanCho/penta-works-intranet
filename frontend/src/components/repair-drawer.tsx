"use client";
import { useEffect,useRef,type ReactNode } from "react";
import { X } from "lucide-react";
export default function RepairDrawer({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const previous=document.activeElement;const overflow=document.body.style.overflow;document.body.style.overflow="hidden";const dialog=ref.current!;dialog.showModal();return()=>{dialog.close();document.body.style.overflow=overflow;if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};},[]);
 return <dialog ref={ref} className="repair-drawer workshop-page work-log-wrap" aria-labelledby="repair-drawer-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><header className="repair-drawer-heading"><h2 id="repair-drawer-title">{title}</h2><button type="button" onClick={onClose} aria-label="수리 기록 닫기"><X aria-hidden/></button></header><div className="repair-drawer-content">{children}</div></dialog>;
}
