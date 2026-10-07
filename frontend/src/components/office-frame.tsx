"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { officeNavigation } from "@/lib/office-navigation";
import { useApiQuery } from "@/lib/use-api-query";
import { api } from "@/lib/api";

type User = { name: string; role: "ADMIN" | "ACCOUNTING" | "USER" };

export default function OfficeFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";
  const me = useApiQuery<User>("/auth/me", !isLogin).data;
  const segments = pathname.split("/").filter(Boolean);
  const section = ["write", "edit"].includes(segments[0]) ? segments[1] : segments[0] ?? "home";
  const active = section === "repairs" ? "hospitals" : section;

  if (isLogin) return children;
  return <div className="office-frame">
    <aside className="sidebar record-sidebar" aria-label="주 메뉴">
      <Link className="logo" href="/" aria-label="대시보드로 이동"><Image className="brand-symbol" src="/favicon/android-chrome-192x192.png" width={42} height={42} alt="" priority /><b>PENTA <small>OFFICE</small></b></Link>
      <nav>{officeNavigation.filter(item => item.id !== "accounting" || me?.role === "ADMIN" || me?.role === "ACCOUNTING").map(({ href, id, label, icon: Icon }) => <Link key={href} href={href} prefetch={true} className={id === active ? "active" : ""} aria-current={id === active ? "page" : undefined}><Icon aria-hidden /><span>{label}</span></Link>)}</nav>
      {me?.role === "ADMIN" && <div className="nav-bottom"><span>관리</span><button className={["admin", "emergency"].includes(section) ? "active" : ""} onClick={() => router.push("/admin")}><Settings aria-hidden />구성원·비상연락망</button></div>}
      {me && <div className="profile"><div className="avatar">{me.name.slice(0,1)}</div><div><strong>{me.name}</strong><small>{me.role === "ADMIN" ? "관리자" : me.role === "ACCOUNTING" ? "회계 담당자" : "구성원"}</small></div><button onClick={async () => { await api("/auth/logout", { method: "POST" }); router.replace("/login"); }} aria-label="로그아웃" title="로그아웃"><LogOut aria-hidden /></button></div>}
    </aside>
    {children}
  </div>;
}
