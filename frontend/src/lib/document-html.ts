import { marked } from "marked";

export function documentHtml(value: string) {
  if (!value) return "";
  return /<([a-z][\w-]*)\b[^>]*>/i.test(value) ? value : marked.parse(value, { async: false }) as string;
}
