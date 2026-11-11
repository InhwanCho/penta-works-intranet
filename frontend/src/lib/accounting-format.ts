export function minute(v: unknown) { return v ? String(v).replace("T", " ").slice(0, 16) : "아직 없음"; }
