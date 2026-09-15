"use client";

import "@toast-ui/editor/dist/toastui-editor-viewer.css";
import { useEffect, useRef } from "react";

export default function MarkdownViewer({ value }: { value: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let viewer: { destroy(): void } | null = null;
    void import("@toast-ui/editor").then(({ Viewer }) => {
      if (host.current) viewer = new Viewer({ el: host.current, initialValue: value || "내용이 없습니다.", usageStatistics: false });
    });
    return () => viewer?.destroy();
  }, [value]);

  return <div className="markdown-viewer" ref={host} />;
}
