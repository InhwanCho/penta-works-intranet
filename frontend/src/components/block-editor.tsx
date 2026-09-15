"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { Block } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { useEffect, useRef, useState } from "react";
import { usePreferences } from "@/components/preferences-provider";
import { upload } from "@/lib/api";

export default function BlockEditor({ value = "", onChange, onUploaded, editable = true }: {
  value?: string;
  onChange?: (value: string) => void;
  onUploaded?: (id: number) => void;
  editable?: boolean;
}) {
  const { dark } = usePreferences();
  const [ready, setReady] = useState(!value);
  const loaded = useRef(false);
  const editor = useCreateBlockNote({
    uploadFile: async (file) => {
      const result = await upload(file);
      onUploaded?.(result.id);
      return result.url;
    },
  });

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void (async () => {
      if (value) {
        const blocks = await parseContent(editor, value);
        if (blocks.length) editor.replaceBlocks(editor.document, blocks);
      }
      setReady(true);
    })();
  }, [editor, value]);

  if (!ready) return <div className="blocknote-loading"></div>;
  return <div className={editable ? "blocknote-shell" : "blocknote-viewer"}>
    <BlockNoteView editor={editor} editable={editable} theme={dark ? "dark" : "light"} onChange={editable ? () => onChange?.(JSON.stringify(editor.document)) : undefined} />
  </div>;
}

async function parseContent(editor: ReturnType<typeof useCreateBlockNote>, value: string): Promise<Block[]> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed as Block[];
  } catch { /* Legacy content is converted below. */ }
  return /<([a-z][\w-]*)\b[^>]*>/i.test(value) ? editor.tryParseHTMLToBlocks(value) : editor.tryParseMarkdownToBlocks(value);
}
