export function recordText(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return blockText(parsed).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 320);
  } catch { /* Legacy Markdown or HTML. */ }
  return decodeEntities(value
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, " ")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|pre)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_>`~-]/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 320));
}
function blockText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(blockText).join(" ");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (["image", "file", "video", "audio"].includes(String(record.type))) return "";
    return Object.entries(record).filter(([key]) => ["text", "content", "children"].includes(key)).map(([, item]) => blockText(item)).join(" ");
  }
  return "";
}
function decodeEntities(value: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] !== "#") return named[code.toLowerCase()] ?? entity;
    const hex = code[1]?.toLowerCase() === "x";
    const number = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
  });
}
