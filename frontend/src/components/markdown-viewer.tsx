"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { documentHtml } from "@/components/markdown-editor";
import { ResizableImage } from "@/components/resizable-image";
import { useEffect } from "react";

export default function RichTextViewer({ value }: { value: string }) {
  const editor = useEditor({ immediatelyRender: false, editable: false, extensions: [StarterKit.configure({ link: false }), Link, ResizableImage], content: documentHtml(value), editorProps: { attributes: { class: "notion-content notion-view", "aria-label": "문서 내용" } } });
  useEffect(() => {
    if (editor) editor.commands.setContent(documentHtml(value), { emitUpdate: false });
  }, [editor, value]);
  return <div className="notion-viewer"><EditorContent editor={editor} /></div>;
}
