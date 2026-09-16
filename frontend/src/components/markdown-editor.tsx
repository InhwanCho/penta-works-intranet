"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Bold, Code2, Heading1, Heading2, Heading3, Heading4, ImagePlus, Italic, Link2, List, ListOrdered, Pilcrow, Quote, Redo2, Undo2 } from "lucide-react";
import { ChangeEvent, useEffect, useRef } from "react";
import { marked } from "marked";
import { upload } from "@/lib/api";
import { ResizableImage } from "@/components/resizable-image";

export function documentHtml(value: string) {
  if (!value) return "";
  return /<([a-z][\w-]*)\b[^>]*>/i.test(value) ? value : marked.parse(value, { async: false }) as string;
}

export default function RichTextEditor({ value = "", onChange, onUploaded }: { value?: string; onChange: (value: string) => void; onUploaded?: (id: number) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ link: false }), Link.configure({ openOnClick: false }), ResizableImage],
    content: documentHtml(value),
    editorProps: {
      attributes: { class: "notion-content", "aria-label": "문서 내용" },
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.type.startsWith("image/"));
        if (!files.length) return false;
        event.preventDefault();
        const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
        void (async () => {
          const images = [];
          for (const file of files) {
            const result = await upload(file);
            onUploaded?.(result.id);
            images.push({ type: "image", attrs: { src: result.url, alt: result.name, width: 100 } });
          }
          editorRef.current?.chain().focus().insertContentAt(position, images).run();
        })().catch((reason) => window.alert(reason instanceof Error ? reason.message : "이미지를 업로드하지 못했습니다."));
        return true;
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  });

  useEffect(() => { editorRef.current = editor; }, [editor]);

  if (!editor) return <div className="notion-editor loading-editor"></div>;

  async function addImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const result = await upload(file); onUploaded?.(result.id);
    editor?.chain().focus().setImage({ src: result.url, alt: result.name }).run();
    event.target.value = "";
  }
  function addLink() {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("연결할 주소를 입력하세요.", previous ?? "https://");
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
  }

  const tool = (label: string, active: boolean, action: () => void, icon: React.ReactNode) => <button type="button" aria-label={label} title={label} className={active ? "active" : ""} onClick={action}>{icon}</button>;
  return <div className="notion-editor"><div className="notion-toolbar">
    {tool("본문", editor.isActive("paragraph"), () => editor.chain().focus().setParagraph().run(), <Pilcrow />)}
    {tool("제목 1", editor.isActive("heading", { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), <Heading1 />)}
    {tool("제목 2", editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 />)}
    {tool("제목 3", editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <Heading3 />)}
    {tool("제목 4", editor.isActive("heading", { level: 4 }), () => editor.chain().focus().toggleHeading({ level: 4 }).run(), <Heading4 />)}
    {tool("굵게", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), <Bold />)}
    {tool("기울임", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), <Italic />)}
    {tool("글머리 목록", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), <List />)}
    {tool("번호 목록", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered />)}
    {tool("인용", editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), <Quote />)}
    {tool("코드", editor.isActive("codeBlock"), () => editor.chain().focus().toggleCodeBlock().run(), <Code2 />)}
    {tool("링크", editor.isActive("link"), addLink, <Link2 />)}
    {tool("이미지", false, () => fileInput.current?.click(), <ImagePlus />)}
    <span></span>
    {tool("실행 취소", false, () => editor.chain().focus().undo().run(), <Undo2 />)}
    {tool("다시 실행", false, () => editor.chain().focus().redo().run(), <Redo2 />)}
    <input ref={fileInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(event) => void addImage(event)} />
  </div><EditorContent editor={editor} /></div>;
}
