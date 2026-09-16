import { LoaderCircle } from "lucide-react";

export default function LoadingIndicator({ label = "불러오는 중", compact = false }: { label?: string; compact?: boolean }) {
  return <div className={`loading-indicator ${compact ? "compact" : ""}`} role="status" aria-label={label}><LoaderCircle aria-hidden /><p>{label}</p></div>;
}

export function ButtonSpinner() {
  return <LoaderCircle className="button-spinner" aria-hidden />;
}
