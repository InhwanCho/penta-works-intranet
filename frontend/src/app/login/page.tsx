"use client";

import { api } from "@/lib/api";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ButtonSpinner } from "@/components/loading-indicator";

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const redirectIfLoggedIn = () => { void api("/auth/me").then(() => router.replace("/")).catch(() => undefined); };
    redirectIfLoggedIn();
    window.addEventListener("pageshow", redirectIfLoggedIn);
    return () => window.removeEventListener("pageshow", redirectIfLoggedIn);
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify({ loginId, password }) });
      router.replace("/");
    } catch (reason) { setBusy(false); setError(reason instanceof Error ? reason.message : "로그인에 실패했습니다."); }
  }

  return <main className="signin-page">
    <section className="signin-panel" aria-labelledby="signin-title">
      <header className="signin-brand">
        <Image src="/favicon/android-chrome-192x192.png" width={44} height={44} alt="" priority />
        <div><strong>PENTA OFFICE</strong><span>사내 업무 포털</span></div>
      </header>
      <form className="signin-form" onSubmit={submit}>
        <div className="signin-heading"><h1 id="signin-title">로그인</h1><p>회사 계정으로 접속하세요.</p></div>
        <label htmlFor="login-id">아이디</label>
        <input id="login-id" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={loginId} onChange={(e) => setLoginId(e.target.value)} />
        <label htmlFor="login-password">비밀번호</label>
        <div className="signin-password">
          <input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"} aria-pressed={showPassword}>{showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}</button>
        </div>
        {error && <div className="signin-error" role="alert">{error}</div>}
        <button className="signin-submit" disabled={busy || !loginId || !password}>{busy ? <><ButtonSpinner /> 로그인 중…</> : "로그인"}</button>
      </form>
      <footer>PENTA WORKS</footer>
    </section>
  </main>;
}
