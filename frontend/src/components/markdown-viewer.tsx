"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { documentHtml } from "@/components/markdown-editor";

export default function RichTextViewer({ value }: { value: string }) {
  const editor = useEditor({ immediatelyRender: false, editable: false, extensions: [StarterKit.configure({ link: false }), Link, Image], content: documentHtml(value), editorProps: { attributes: { class: "notion-content notion-view", "aria-label": "문서 내용" } } });
  return <div className="notion-viewer"><EditorContent editor={editor} /></div>;
}
