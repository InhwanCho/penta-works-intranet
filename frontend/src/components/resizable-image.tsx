"use client";

import ImageExtension from "@tiptap/extension-image";
import { mergeAttributes } from "@tiptap/core";
import { NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { PointerEvent, useRef } from "react";

function ResizableImageView({ node, editor, selected, updateAttributes }: NodeViewProps) {
  const wrapper = useRef<HTMLDivElement>(null);

  function beginResize(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault(); event.stopPropagation();
    const element = wrapper.current;
    const container = element?.parentElement;
    if (!element || !container) return;
    const startX = event.clientX;
    const startWidth = element.getBoundingClientRect().width;
    const containerWidth = container.getBoundingClientRect().width;
    const move = (next: globalThis.PointerEvent) => {
      const width = Math.min(100, Math.max(20, ((startWidth + next.clientX - startX) / containerWidth) * 100));
      updateAttributes({ width: Math.round(width) });
    };
    const finish = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish, { once: true });
  }

  return <NodeViewWrapper ref={wrapper} className={`resizable-image ${selected ? "selected" : ""}`} style={{ width: `${node.attrs.width ?? 100}%` }}>
    {/* User uploads use authenticated API URLs, so the editor must render them directly. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={node.attrs.src} alt={node.attrs.alt ?? ""} title={node.attrs.title ?? undefined} draggable={false} />
    {editor.isEditable && <button type="button" className="image-resize-handle" contentEditable={false} onPointerDown={beginResize} aria-label="이미지 크기 조절" title="드래그해서 크기 조절" />}
  </NodeViewWrapper>;
}

export const ResizableImage = ImageExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: 100,
        parseHTML: (element) => Number(element.getAttribute("data-width")) || 100,
        renderHTML: (attributes) => ({ "data-width": attributes.width, style: `width:${attributes.width}%;height:auto` }),
      },
    };
  },
  renderHTML({ HTMLAttributes }) { return ["img", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]; },
  addNodeView() { return ReactNodeViewRenderer(ResizableImageView); },
}).configure({ allowBase64: false });
