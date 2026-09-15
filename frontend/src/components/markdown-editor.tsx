"use client";

import "@toast-ui/editor/dist/toastui-editor.css";
import { upload } from "@/lib/api";
import { useEffect, useRef } from "react";

type ToastEditor = {
  getMarkdown(): string;
  destroy(): void;
};

export default function MarkdownEditor({ value = "", onChange, onUploaded }: {
  value?: string;
  onChange: (value: string) => void;
  onUploaded?: (id: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let editor: ToastEditor | null = null;
    void import("@toast-ui/editor").then(({ default: Editor }) => {
      if (!host.current) return;
      editor = new Editor({
        el: host.current,
        height: "320px",
        initialEditType: "wysiwyg",
        previewStyle: "vertical",
        initialValue: value,
        usageStatistics: false,
        hooks: {
          addImageBlobHook: async (blob: Blob, callback: (url: string, text: string) => void) => {
            const file = blob instanceof File ? blob : new File([blob], "image.png", { type: blob.type });
            const result = await upload(file);
            onUploaded?.(result.id);
            callback(result.url, result.name);
          },
        },
        events: { change: () => editor && onChange(editor.getMarkdown()) },
      });
    });
    return () => editor?.destroy();
    // Toast UI owns this DOM node until the form closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="editor-shell" ref={host} />;
}
