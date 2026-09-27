/** A schedule ending at midnight does not occupy the following day. */
export function occursOnDay(startValue: unknown, endValue: unknown, date: string) {
  const start = new Date(String(startValue).replace(" ", "T")).getTime();
  const end = new Date(String(endValue).replace(" ", "T")).getTime();
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  return Number.isFinite(start) && Number.isFinite(end) && start < dayEnd.getTime() && end > dayStart.getTime();
}
