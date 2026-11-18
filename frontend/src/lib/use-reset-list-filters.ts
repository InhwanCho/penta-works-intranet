"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useOfficePathname } from "@/components/office-tab-context";

// Reset only list controls. Keep query caches and in-progress editors mounted.
export function useResetListFilters(reset: () => void) {
  const active = useOfficePathname() === usePathname();
  const resetRef = useRef(reset);
  useEffect(() => { resetRef.current = reset; });
  useEffect(() => {
    if (!active) resetRef.current();
    let wasHidden = document.visibilityState === "hidden";
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        wasHidden = true;
      } else if (wasHidden) {
        wasHidden = false;
        if (active) resetRef.current();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [active]);
  return active;
}
