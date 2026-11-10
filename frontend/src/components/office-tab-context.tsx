"use client";
import { createContext, useContext } from "react";
import { usePathname } from "next/navigation";
export const OfficeTabPath = createContext<string | null>(null);
export function useOfficePathname() {
  const route = usePathname();
  return useContext(OfficeTabPath) ?? route;
}
