"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, LogOut, Settings, X, ALargeSmall, Moon, Sun } from "lucide-react";
import { accountingNavigation, officeNavigation } from "@/lib/office-navigation";
import { useApiQuery } from "@/lib/use-api-query";
import { api } from "@/lib/api";

import { usePreferences } from "./preferences-provider";
import PortalPage from "./portal-page";
import { OfficeTabPath } from "./office-tab-context";

const menuItems = [...accountingNavigation, ...officeNavigation];
const isMenuPath = (path: string) => menuItems.some(item => item.href === path);

type User = { name: string; role: "ADMIN" | "ACCOUNTING" | "USER" };

export default function OfficeFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { dark, largeText, toggleDark, toggleLargeText } = usePreferences();
  const router = useRouter();
  const isLogin = pathname === "/login";
  const [tabs, setTabs] = useState<string[]>([]);
  const openTabs = isLogin ? [] : Array.from(new Set([...tabs, ...(isMenuPath(pathname) ? [pathname] : [])]));
  useEffect(() => {
    if (isLogin) { setTabs([]); return; }
    if (isMenuPath(pathname)) setTabs(previous => previous.includes(pathname) ? previous : [...previous, pathname]);
  }, [pathname, isLogin]);
  function closeTab(path: string) {
    const remaining = openTabs.filter(item => item !== path);
    setTabs(remaining);
    if (pathname === path) router.push(remaining[Math.max(0, openTabs.indexOf(path) - 1)] ?? "/");
  }
  useEffect(() => {
    document.querySelector('.office-tab.active')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);
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
  const currentItem = [...accountingNavigation, ...officeNavigation].find(item => item.href === pathname)
    ?? (section === "accounting" ? accountingNavigation.find(item => item.href !== "/accounting" && pathname.startsWith(item.href)) : officeNavigation.find(item => item.id === active));

  if (isLogin) return children;
  return <div className={`office-frame${collapsed ? " sidebar-collapsed" : ""}`}>
    <div className="office-product-bar"><Link className="office-product-name" href="/">PENTA <span>OFFICE</span></Link><nav aria-label="업무 영역"><Link href="/" aria-current={section !== "accounting" ? "page" : undefined}>사내 업무</Link>{(me?.role === "ADMIN" || me?.role === "ACCOUNTING") && <Link href="/accounting" aria-current={section === "accounting" ? "page" : undefined}>회계·자금관리</Link>}</nav><div className="office-preferences"><button onClick={toggleLargeText} aria-label="큰 글씨 모드" aria-pressed={largeText} title="큰 글씨 모드"><ALargeSmall size={18} /></button><button onClick={toggleDark} aria-label="다크 모드" aria-pressed={dark} title={dark ? "라이트 모드로 변경" : "다크 모드로 변경"}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button><span className="office-product-user">{me?.name}</span></div></div>
    <div className="office-location-bar"><span>{section === "accounting" ? "회계·자금관리" : "사내 업무"}</span><nav className="office-tabs" aria-label="열린 업무 탭">{openTabs.map(path => <div key={path} className={`office-tab${pathname === path ? " active" : ""}`}>
      <Link href={path} aria-current={pathname === path ? "page" : undefined}>{menuItems.find(item => item.href === path)?.label}</Link>
      {openTabs.length > 1 && <button type="button" onClick={() => closeTab(path)} aria-label={`${menuItems.find(item => item.href === path)?.label} 탭 닫기`}><X size={13} /></button>}
    </div>)}{!isMenuPath(pathname) && <div className="office-tab active"><span>{currentItem?.label ?? "상세 보기"}</span></div>}</nav></div>
    <button type="button" className="sidebar-toggle" onClick={toggleSidebar} aria-label={sidebarAction}
      aria-controls="office-sidebar" aria-expanded={!collapsed} aria-keyshortcuts="Meta+B Control+B"
       >
      {collapsed ? <ChevronRight aria-hidden /> : <ChevronLeft aria-hidden />}
    </button>
    <button type="button" className="sidebar-edge-toggle" tabIndex={-1} aria-hidden="true" onClick={toggleSidebar}  />
    <aside id="office-sidebar" className="sidebar record-sidebar" aria-label="주 메뉴">
      <Link className="logo" href="/" aria-label="대시보드로 이동"><Image className="brand-symbol" src="/favicon/android-chrome-192x192.png" width={42} height={42} alt="" priority /><b>PENTA <small>OFFICE</small></b></Link>
      <div className="sidebar-menus">
        <nav aria-label="사내 업무"><h2 className="sidebar-group-title">사내 업무</h2>{officeNavigation.filter(item => item.id !== "accounting").map(({ href, id, label, icon: Icon }) => <Link key={href} href={href} aria-label={label} className={id === active ? "active" : ""} aria-current={id === active ? "page" : undefined}><Icon aria-hidden /><span>{label}</span></Link>)}</nav>
        {(me?.role === "ADMIN" || me?.role === "ACCOUNTING") && <nav aria-label="회계"><h2 className="sidebar-group-title">회계</h2>{accountingNavigation.map(({ href, label, icon: Icon }) => {
          const selected = href === "/accounting" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return <Link key={href} href={href} aria-label={label} className={selected ? "active" : ""} aria-current={selected ? "page" : undefined}><Icon aria-hidden /><span>{label}</span></Link>;
        })}</nav>}

      </div>
      {me?.role === "ADMIN" && <div className="nav-bottom"><span>관리</span><button className={["admin", "emergency"].includes(section) ? "active" : ""} onClick={() => router.push("/admin")} aria-label="구성원·비상연락망"><Settings aria-hidden /><span>구성원·비상연락망</span></button></div>}
      {me && <div className="profile"><div className="avatar">{me.name.slice(0,1)}</div><div><strong>{me.name}</strong><small>{me.role === "ADMIN" ? "관리자" : me.role === "ACCOUNTING" ? "회계 담당자" : "구성원"}</small></div><button onClick={async () => { await api("/auth/logout", { method: "POST" }); router.replace("/login"); }} aria-label="로그아웃"><LogOut aria-hidden /></button></div>}
    </aside>
    {openTabs.map(path => <div className="office-tab-panel" key={path} hidden={pathname !== path}>
      <OfficeTabPath.Provider value={path}><PortalPage /></OfficeTabPath.Provider>
    </div>)}
    {!isMenuPath(pathname) && children}
  </div>;
}
