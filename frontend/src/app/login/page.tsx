"use client";

import { api } from "@/lib/api";
import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";

export default function LoginPage() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const redirectIfLoggedIn = () => { void api("/auth/me").then(() => window.location.replace("/")).catch(() => undefined); };
    redirectIfLoggedIn();
    window.addEventListener("pageshow", redirectIfLoggedIn);
    return () => window.removeEventListener("pageshow", redirectIfLoggedIn);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify({ loginId, password }) });
      window.location.replace("/");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "로그인에 실패했습니다."); }
    finally { setBusy(false); }
  }

  return <main className="login-page">
    <section className="login-brand">
      <div className="login-logo brand-lockup"><Image src="/favicon/android-chrome-192x192.png" width={46} height={46} alt="" priority /><b>PENTA <small>OFFICE</small></b></div>
      <p>PENTA OFFICE</p>
      <h1>일이 정리되는<br />우리의 공간.</h1>
      <span>회의부터 일정, 매뉴얼과 수리 기록까지 한곳에서 관리하세요.</span>
    </section>
    <section className="login-panel">
      <form className="login-card" onSubmit={submit}>
        <span className="eyebrow">PENTA OFFICE</span>
        <h2>다시 오신 것을 환영합니다</h2>
        <p>회사 계정으로 로그인하세요.</p>
        <label>아이디<input autoFocus value={loginId} onChange={(e) => setLoginId(e.target.value)} /></label>
        <label>비밀번호<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy || !loginId || !password}>{busy ? "로그인 중…" : "로그인"}</button>
      </form>
    </section>
  </main>;
}
