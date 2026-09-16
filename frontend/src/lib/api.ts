const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api/v1").replace(/\/$/, "");
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function cookie(name: string) {
  if (typeof document === "undefined") return "";
  return document.cookie.split("; ").find((item) => item.startsWith(`${name}=`))?.split("=")[1] ?? "";
}

export async function csrf() {
  const response = await fetchWithTimeout(`${API_BASE}/auth/csrf`, { credentials: "include" }, 30_000);
  if (!response.ok) throw new Error(await responseError(response));
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method ?? "GET";
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) await csrf();
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const token = decodeURIComponent(cookie("XSRF-TOKEN"));
  if (token) headers.set("X-XSRF-TOKEN", token);
  let response: Response;
  try {
    response = await fetchWithTimeout(`${API_BASE}${path}`, { ...options, headers, credentials: "include" }, options.body instanceof FormData ? 180_000 : 30_000);
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "AbortError") throw new Error("요청 시간이 초과되었습니다. 네트워크 상태를 확인하고 다시 시도해주세요.");
    throw new Error("서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  if (response.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
    window.location.href = "/login";
  }
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function upload(file: File) {
  if (file.size > MAX_FILE_SIZE) throw new Error("파일은 최대 50MB까지 업로드할 수 있습니다.");
  if (!["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"].includes(file.type)) throw new Error("JPG, PNG, GIF, WebP 이미지 또는 PDF 파일만 업로드할 수 있습니다.");
  const form = new FormData();
  form.append("file", file);
  return api<{ id: number; url: string; name: string }>("/files", { method: "POST", body: form });
}

async function fetchWithTimeout(url: string, options: RequestInit, timeout: number) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { window.clearTimeout(timer); }
}

async function responseError(response: Response) {
  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  if (body?.message) return body.message;
  return ({
    400: "입력값을 확인해주세요.", 401: "로그인이 만료되었습니다. 다시 로그인해주세요.",
    403: "이 작업을 수행할 권한이 없습니다.", 404: "요청한 내용을 찾을 수 없습니다.",
    409: "이미 처리되었거나 중복된 요청입니다.", 413: "파일은 최대 50MB까지 업로드할 수 있습니다.",
    415: "지원하지 않는 파일 형식입니다.", 500: "서버에서 오류가 발생했습니다.",
    502: "서버가 일시적으로 응답하지 않습니다.", 503: "서비스를 잠시 사용할 수 없습니다.",
  } as Record<number, string>)[response.status] ?? `요청을 처리하지 못했습니다. (${response.status})`;
}
