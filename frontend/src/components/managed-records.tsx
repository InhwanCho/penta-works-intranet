"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
type Row = Record<string, string | number | boolean | null>;
type Kind = "schedules" | "admin" | "emergency";
const value = (row: Row, key: string) => String(row[key] ?? "");
const active = (v: unknown) => v === true || v === 1 || v === "1";

export function ManagedRecords({ kind, rows, me }: { kind: Kind; rows: Row[]; me: { id: number; role: string } }) {
  const [editing, setEditing] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (editing) dialog.current?.showModal(); }, [editing]);
  const endpoint = kind === "admin" ? "/admin/users" : kind === "emergency" ? "/admin/emergency-contacts" : "/schedules";
  function close() { if (busy) return; dialog.current?.close(); setEditing(null); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing || busy) return;
    const data = new FormData(event.currentTarget); const read = (key: string) => String(data.get(key) ?? "");
    setBusy(true); setError("");
    try {
      const body = kind === "admin" ? { name: read("name"), email: read("email"), phone: read("phone"), position: read("position"), role: read("role"), active: data.has("active"), password: read("password") || null }
        : kind === "emergency" ? { userId: Number(editing.user_id), name: read("name"), relationship: read("relationship"), phone: read("phone"), priority: Number(read("priority")), note: read("note") }
        : { title: read("title"), type: read("type"), visibility: read("visibility"), descriptionMarkdown: read("description"), startAt: read("startAt"), endAt: read("endAt"), allDay: data.has("allDay"), userId: editing.user_id };
      await api(`${endpoint}/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
      dialog.current?.close(); setEditing(null);
    } catch (error) { setError(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function remove(row: Row) {
    if (busy || !window.confirm(kind === "emergency" ? "이 비상연락처를 삭제할까요? 삭제 후 복구할 수 없습니다." : "이 일정을 삭제할까요?")) return;
    setBusy(true); setError("");
    try { await api(`${endpoint}/${row.id}`, { method: "DELETE" }); }
    catch (error) { setError(error instanceof Error ? error.message : "삭제하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <><div className="list-card">{!rows.length && <p className="empty">등록된 내용이 없습니다.</p>}{rows.map(row => {
    const canEdit = me.role === "ADMIN" || (kind === "schedules" && Number(row.created_by) === me.id);
    return <article className="list-row managed-row" key={Number(row.id)}><div className="list-main"><h3>{value(row, kind === "schedules" ? "title" : "name")}</h3>
      {kind === "admin" ? <p>{value(row, "login_id")} · {({ ADMIN: "관리자", USER: "일반 사용자", ACCOUNTING: "회계 담당자" })[value(row, "role")]} · {active(row.active) ? "활성" : "비활성"}</p>
        : kind === "emergency" ? <p>{value(row, "user_name")} · {value(row, "relationship")} · <a href={`tel:${value(row, "phone")}`}>{value(row, "phone")}</a> · {value(row, "priority")}순위</p>
        : <><p>{value(row, "start_at").replace("T", " ")} ~ {value(row, "end_at").replace("T", " ")}{active(row.all_day) ? " · 종일" : ""} · {row.visibility === "PRIVATE" ? "나만 보기" : "전체 공개"}</p><p>{value(row, "description_markdown")}</p></>}
      </div>{canEdit && <div className="managed-actions"><button disabled={busy} onClick={() => { setError(""); setEditing(row); }}>수정</button>{kind !== "admin" && <button disabled={busy} className="danger" onClick={() => void remove(row)}>삭제</button>}</div>}</article>;
  })}</div>{error && !editing && <p className="error" role="alert">{error}</p>}
    <dialog ref={dialog} className="managed-dialog" aria-label="항목 수정" onCancel={event => { if (busy) event.preventDefault(); else setEditing(null); }}>
      {editing && <form onSubmit={save} key={String(editing.id)}><h2>{kind === "admin" ? "구성원 수정" : kind === "emergency" ? "비상연락처 수정" : "일정 수정"}</h2><fieldset disabled={busy} className="save-fieldset">
        {kind === "schedules" ? <><label>제목<input name="title" required defaultValue={value(editing, "title")} /></label><label>구분<select name="type" defaultValue={value(editing,"type")}><option value="PERSONAL">개인 일정</option><option value="VACATION">휴가</option><option value="COMPANY">회사 일정</option></select></label><label>공개 범위<select name="visibility" defaultValue={value(editing,"visibility")}><option value="PUBLIC">전체 공개</option><option value="PRIVATE">나만 보기</option></select></label><label>시작<input name="startAt" type="datetime-local" required defaultValue={value(editing,"start_at").replace(" ","T").slice(0,16)} /></label><label>종료<input name="endAt" type="datetime-local" required defaultValue={value(editing,"end_at").replace(" ","T").slice(0,16)} /></label><label><input name="allDay" type="checkbox" defaultChecked={active(editing.all_day)} /> 종일</label><label>설명<textarea name="description" defaultValue={value(editing,"description_markdown")} /></label></>
          : <><label>이름<input name="name" required defaultValue={value(editing,"name")} /></label><label>전화번호<input name="phone" required={kind === "emergency"} defaultValue={value(editing,"phone")} /></label>{kind === "admin" ? <><label>이메일<input name="email" type="email" defaultValue={value(editing,"email")} /></label><label>직책<input name="position" defaultValue={value(editing,"position")} /></label><label>권한<select name="role" defaultValue={value(editing,"role")}><option value="USER">일반 사용자</option><option value="ACCOUNTING">회계 담당자</option><option value="ADMIN">관리자</option></select></label><label><input name="active" type="checkbox" defaultChecked={active(editing.active)} /> 활성 계정</label><label>새 비밀번호<input name="password" type="password" minLength={10} autoComplete="new-password" placeholder="변경할 때만 입력 (10자 이상)" /></label><small>비활성화·비밀번호 변경 시 기존 로그인도 해제됩니다. 본인 계정의 권한 하향·비활성화는 제한됩니다.</small></> : <><label>관계<input name="relationship" required defaultValue={value(editing,"relationship")} /></label><label>연락 순서<input name="priority" type="number" min="1" required defaultValue={value(editing,"priority")} /></label><label>메모<textarea name="note" defaultValue={value(editing,"note")} /></label></>}</>}
        {error && <p role="alert" className="error">{error}</p>}<div className="managed-actions"><button type="button" onClick={close}>취소</button><button className="primary">{busy ? "저장 중…" : "저장"}</button></div>
      </fieldset></form>}
    </dialog></>;
}
