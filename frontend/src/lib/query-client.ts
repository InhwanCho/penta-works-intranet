import { QueryClient } from "@tanstack/react-query";

export function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: {
    staleTime: 5 * 60_000, gcTime: 60 * 60_000,
    retry: (count, error) => count < 1 && !("status" in error && Number(error.status) < 500),
    refetchOnWindowFocus: true,
  } } });
}
let browserClient: QueryClient | undefined;
export function getQueryClient() {
  if (typeof window === "undefined") return createQueryClient();
  return browserClient ??= createQueryClient();
}
export const apiKey = (path: string) => ["api", path] as const;
export function staleTime(path: string) {
  if (path === "/accounting/status" || path === "/accounting/cash/status") return 30 * 60_000;
  if (path.startsWith("/accounting/cash?") || path.startsWith("/accounting/bank-transactions?")) return 60_000;
  if (path === "/auth/me" || path === "/notifications") return 30_000;
  if (path === "/dashboard" || path.startsWith("/schedules") || path.startsWith("/service-calendar") || path.startsWith("/service-prep")) return 60_000;
  return 5 * 60_000;
}
