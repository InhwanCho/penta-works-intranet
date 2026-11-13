export function bankReviewStatus(row: { classification?: unknown; reviewed_without_plan?: unknown; deposit_amount?: unknown; withdraw_amount?: unknown; allocated_total?: unknown; confirmed_total?: unknown }) {
  const amount = Number(row.deposit_amount ?? 0) + Number(row.withdraw_amount ?? 0);
  if (row.classification === "INTERNAL_TRANSFER") return "내부이체";
  if (Number(row.reviewed_without_plan)) return "확인 완료 · 계획 없음";
  if (amount > 0 && Number(row.confirmed_total ?? 0) >= amount) return "확인 완료";
  if (Number(row.allocated_total ?? 0) >= amount && amount > 0) return "연결됨 · 완료 대기";
  if (Number(row.allocated_total ?? 0) > 0) return "일부 연결";
  return "미확인";
}
