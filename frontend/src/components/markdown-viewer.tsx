"use client";

import BlockEditor from "@/components/block-editor";

export default function BlockViewer({ value }: { value: string }) {
  return <BlockEditor value={value} editable={false} />;
}
