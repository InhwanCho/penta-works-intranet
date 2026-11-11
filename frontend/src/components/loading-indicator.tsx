"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";

export default function LoadingIndicator({ label = "불러오는 중", compact = false, scope = "section" }: { label?: string; compact?: boolean; scope?: "screen" | "workspace" | "section" }) {
  return <div className={`loading-indicator ${compact ? "compact" : ""} loading-${scope}`} role="status" aria-label={label}><LoaderCircle aria-hidden /><p>{label}</p></div>;
}

export function AccountingLoader({ label = "회계 자료를 불러오는 중" }: { label?: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 350);
    return () => window.clearTimeout(timer);
  }, []);
  return visible ? <LoadingIndicator compact label={label} /> : null;
}

export function ButtonSpinner() {
  return <LoaderCircle className="button-spinner" aria-hidden />;
}
