"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, LogOut, Settings } from "lucide-react";
import { accountingNavigation, officeNavigation } from "@/lib/office-navigation";
import { useApiQuery } from "@/lib/use-api-query";
import { api } from "@/lib/api";

type User = { name: string; role: "ADMIN" | "ACCOUNTING" | "USER" };

export default function OfficeFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("office-sidebar-collapsed") === "true"); } catch {}
  }, []);
  function toggleSidebar() {
    setCollapsed(value => {
      const next = !value;
      try { localStorage.setItem("office-sidebar-collapsed", String(next)); } catch {}
      return next;
    });
  }
  useEffect(() => {
    if (isLogin) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (event.defaultPrevented || event.repeat || event.altKey || event.shiftKey ||
          !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "b" ||
          (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [role='textbox']")))) return;
      event.preventDefault();
      toggleSidebar();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isLogin]);
  const sidebarAction = collapsed ? "사이드바 펼치기" : "사이드바 접기";
  const me = useApiQuery<User>("/auth/me", !isLogin).data;
  const segments = pathname.split("/").filter(Boolean);
  const section = ["write", "edit"].includes(segments[0]) ? segments[1] : segments[0] ?? "home";
  const active = section === "repairs" ? "hospitals" : section;

  if (isLogin) return children;
  return <div className={`office-frame${collapsed ? " sidebar-collapsed" : ""}`}>
    <button type="button" className="sidebar-toggle" onClick={toggleSidebar} aria-label={sidebarAction}
      aria-controls="office-sidebar" aria-expanded={!collapsed} aria-keyshortcuts="Meta+B Control+B"
      title={`${sidebarAction} (⌘B / Ctrl+B)`} data-tooltip={`${sidebarAction} · ⌘B / Ctrl+B`}>
      {collapsed ? <ChevronRight aria-hidden /> : <ChevronLeft aria-hidden />}
    </button>
    <button type="button" className="sidebar-edge-toggle" tabIndex={-1} aria-hidden="true" onClick={toggleSidebar} title={`${sidebarAction} (⌘B / Ctrl+B)`} />
    <aside id="office-sidebar" className="sidebar record-sidebar" aria-label="주 메뉴">
      <Link className="logo" href="/" aria-label="대시보드로 이동"><Image className="brand-symbol" src="/favicon/android-chrome-192x192.png" width={42} height={42} alt="" priority /><b>PENTA <small>OFFICE</small></b></Link>
      <div className="sidebar-menus">
        <nav aria-label="사내 업무"><h2 className="sidebar-group-title">사내 업무</h2>{officeNavigation.filter(item => item.id !== "accounting").map(({ href, id, label, icon: Icon }) => <Link key={href} href={href} title={label} className={id === active ? "active" : ""} aria-current={id === active ? "page" : undefined}><Icon aria-hidden /><span>{label}</span></Link>)}</nav>
        {(me?.role === "ADMIN" || me?.role === "ACCOUNTING") && <nav aria-label="회계"><h2 className="sidebar-group-title">회계</h2>{accountingNavigation.map(({ href, label, icon: Icon }) => {
          const selected = href === "/accounting" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return <Link key={href} href={href} title={label} className={selected ? "active" : ""} aria-current={selected ? "page" : undefined}><Icon aria-hidden /><span>{label}</span></Link>;
        })}</nav>}

      </div>
      {me?.role === "ADMIN" && <div className="nav-bottom"><span>관리</span><button className={["admin", "emergency"].includes(section) ? "active" : ""} onClick={() => router.push("/admin")} title="구성원·비상연락망" aria-label="구성원·비상연락망"><Settings aria-hidden /><span>구성원·비상연락망</span></button></div>}
      {me && <div className="profile"><div className="avatar">{me.name.slice(0,1)}</div><div><strong>{me.name}</strong><small>{me.role === "ADMIN" ? "관리자" : me.role === "ACCOUNTING" ? "회계 담당자" : "구성원"}</small></div><button onClick={async () => { await api("/auth/logout", { method: "POST" }); router.replace("/login"); }} aria-label="로그아웃" title="로그아웃"><LogOut aria-hidden /></button></div>}
    </aside>
    {children}
  </div>;
}
