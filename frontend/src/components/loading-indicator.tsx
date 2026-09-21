import { LoaderCircle } from "lucide-react";

export default function LoadingIndicator({ label = "불러오는 중", compact = false, scope = "section" }: { label?: string; compact?: boolean; scope?: "screen" | "workspace" | "section" }) {
  return <div className={`loading-indicator ${compact ? "compact" : ""} loading-${scope}`} role="status" aria-label={label}><LoaderCircle aria-hidden /><p>{label}</p></div>;
}

export function ButtonSpinner() {
  return <LoaderCircle className="button-spinner" aria-hidden />;
}
