"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function CashDialog({ title, onClose, children, wide = false, closeDisabled = false }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean; closeDisabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const backdropDown = useRef(false);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  function close() {
    if (!closeDisabled && !ref.current?.querySelector('form[aria-busy="true"]')) onClose();
  }
  function outsideDialog(clientX: number, clientY: number) {
    const rect = ref.current?.getBoundingClientRect();
    return !!rect && (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom);
  }
  return <dialog ref={ref} aria-labelledby={titleId} className={`cash-dialog${wide ? " cash-dialog-wide" : ""}`}
    onCancel={e => { e.preventDefault(); close(); }}
    onPointerDown={e => { backdropDown.current = e.target === e.currentTarget && outsideDialog(e.clientX, e.clientY); }}
    onClick={e => { if (backdropDown.current && e.target === e.currentTarget && outsideDialog(e.clientX, e.clientY)) close(); backdropDown.current = false; }}>
    <header><h2 id={titleId}>{title}</h2><button type="button" className="modal-close-button" aria-label="닫기" disabled={closeDisabled} onClick={close}><X aria-hidden /></button></header>
    <div className="cash-dialog-body">{children}</div>
  </dialog>;
}
