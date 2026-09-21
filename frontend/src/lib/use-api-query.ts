"use client";
import { useQuery } from "@tanstack/react-query";
import { request } from "./api";
import { apiKey, staleTime } from "./query-client";
export function useApiQuery<T>(path: string, enabled = true) {
  return useQuery<T>({ queryKey: apiKey(path), queryFn: ({ signal }) => request<T>(path, { signal }), staleTime: staleTime(path), enabled });
}
