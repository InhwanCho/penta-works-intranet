export function AccountingSkeleton() {
  return <div className="accounting-skeleton" role="status" aria-label="회계 자료 불러오는 중" aria-busy="true"><span className="sr-only">회계 자료를 불러오는 중입니다.</span><div className="skeleton-heading" /><div className="skeleton-summary">{Array.from({ length: 4 }, (_, i) => <div key={i} />)}</div>{Array.from({ length: 6 }, (_, i) => <div className="skeleton-row" key={i} />)}</div>;
}
