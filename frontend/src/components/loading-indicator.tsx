export default function LoadingIndicator({ label = "불러오는 중", compact = false }: { label?: string; compact?: boolean }) {
  return <div className={`emoji-loader ${compact ? "compact" : ""}`} role="status" aria-label={label}><span aria-hidden>⚙️</span><p>{label}</p></div>;
}
