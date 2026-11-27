"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { api, upload } from "@/lib/api";
import { defaultWorkshopStatus, workshopStatus, workshopStatuses, type WorkshopRepairDetail } from "@/lib/workshop-repairs";

type Unit = { serialNumber: string; status: string; faultAxis: string; testResult: string };
const blankUnit = (status = defaultWorkshopStatus): Unit => ({ serialNumber: "", status, faultAxis: "", testResult: "" });
const statusOptions = Object.entries(workshopStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>);

export default function WorkshopRepairForm({ record }: { record?: WorkshopRepairDetail }) {
  const router = useRouter();
  const [name, setName] = useState(record?.equipment_name ?? "");
  const [content, setContent] = useState(record?.description_markdown ?? "");
  const [date, setDate] = useState(() => record?.work_date ?? new Intl.DateTimeFormat("sv-SE").format(new Date()));
  const [status, setStatus] = useState(record ? workshopStatus(record.status) : defaultWorkshopStatus);
  const [units, setUnits] = useState<Unit[]>(() => record ? record.units.map(unit => ({
    serialNumber: unit.serial_number ?? "",
    status: workshopStatus(unit.status),
    faultAxis: unit.fault_axis ?? "",
    testResult: unit.test_result ?? "",
  })) : [blankUnit()]);
  const [attachments, setAttachments] = useState<{ id: number; name: string }[]>([]);
  const [busy, setBusy] = useState<"save" | "upload" | null>(null);
  const [error, setError] = useState("");

  function changeStatus(value: string) {
    setStatus(value);
    if (value === "COMPLETED") setUnits(previous => previous.map(unit => ({ ...unit, status: value })));
  }

  function changeUnit(index: number, patch: Partial<Unit>) {
    setUnits(previous => previous.map((unit, i) => i === index ? { ...unit, ...patch } : unit));
    if (patch.status === "TEST_FAILED") setStatus(patch.status);
  }

  async function attachFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || busy) return;
    setBusy("upload");
    setError("");
    try {
      const attachment = await upload(file);
      setAttachments(previous => [...previous, attachment]);
    } catch (error) {
      setError(error instanceof Error ? error.message : "업로드 실패");
    } finally {
      input.value = "";
      setBusy(null);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    setBusy("save");
    setError("");
    try {
      const result = await api<{ id: number }>(record ? `/workshop-repairs/${record.id}` : "/workshop-repairs", {
        method: record ? "PUT" : "POST",
        body: JSON.stringify({
          equipmentName: name,
          contentMarkdown: content,
          workDate: date,
          status,
          units,
          fileIds: attachments.map(file => file.id),
        }),
      });
      if (form.isConnected) router.replace(`/workshop-repairs/${record?.id ?? result.id}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "저장 실패");
      setBusy(null);
    }
  }

  return <form className="repair-panel" onSubmit={save}>
    <fieldset className="workshop-form-fields" disabled={Boolean(busy)} aria-busy={Boolean(busy)}>
      <div className="form-grid workshop-form-basics">
        <label>장비·부품명<input required maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label>
        <label>작업일<input required type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
        <label>전체 상태<select value={status} onChange={event => changeStatus(event.target.value)}>{statusOptions}</select></label>
      </div>
      <label>작업 내용<textarea required rows={8} value={content} onChange={event => setContent(event.target.value)} /></label>

      <section className="workshop-units" aria-labelledby="workshop-units-edit-title">
        <header className="workshop-units-heading">
          <h2 id="workshop-units-edit-title">개별 장비·부품</h2>
          <span>{units.length} EA</span>
          <button type="button" className="workshop-unit-add" disabled={units.length >= 100} onClick={() => setUnits(previous => [...previous, blankUnit(status)])}>
            <Plus aria-hidden />장비·부품 추가
          </button>
        </header>
        {units.map((unit, index) => (
          <section className="workshop-unit-editor" aria-labelledby={`workshop-unit-edit-${index}`} key={index}>
            <header className="workshop-unit-heading">
              <h3 id={`workshop-unit-edit-${index}`}>{index + 1}번</h3>
              {units.length > 1 && <button type="button" className="workshop-unit-remove" aria-label={`${index + 1}번 장비·부품 제거`} onClick={() => setUnits(previous => previous.filter((_, i) => index !== i))}>제거</button>}
            </header>
            <div className="workshop-unit-fields">
              <label>S/N (선택)<input value={unit.serialNumber} onChange={event => changeUnit(index, { serialNumber: event.target.value })} /></label>
              <label>상태<select value={unit.status} onChange={event => changeUnit(index, { status: event.target.value })}>{statusOptions}</select></label>
              <label>오류 축<select value={unit.faultAxis} onChange={event => changeUnit(index, { faultAxis: event.target.value })}>
                <option value="">없음·미지정</option>
                {["X", "Y", "Z"].map(axis => <option key={axis} value={axis}>{axis}축</option>)}
              </select></label>
              <label className="workshop-unit-result-field">테스트 결과·고장 내용<textarea required={unit.status === "TEST_FAILED"} rows={3} value={unit.testResult} onChange={event => changeUnit(index, { testResult: event.target.value })} /></label>
            </div>
          </section>
        ))}
      </section>

      <label>사진·PDF 첨부<input type="file" className="workshop-file-input" accept="image/jpeg,image/png,image/gif,image/webp,application/pdf" onChange={attachFile} /></label>
      {attachments.length > 0 && <ul className="workshop-form-attachments">{attachments.map(file => <li key={file.id}>{file.name}</li>)}</ul>}
    </fieldset>
    {busy === "upload" && <p role="status">첨부파일을 업로드하는 중…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <footer className="cash-actions workshop-form-actions">
      <button type="button" disabled={Boolean(busy)} onClick={() => router.replace(record ? `/workshop-repairs/${record.id}` : "/workshop-repairs")}>취소</button>
      <button type="submit" className="cash-create" disabled={Boolean(busy)}>{busy === "save" ? "저장 중…" : "저장"}</button>
    </footer>
  </form>;
}
