"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import MarkdownViewer from "@/components/markdown-viewer";
import WorkshopRepairForm from "@/components/workshop-repair-form";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";
import { workshopStatus, workshopStatusLabel, type WorkshopRepairDetail } from "@/lib/workshop-repairs";

const listPath = "/workshop-repairs";

export default function WorkshopRepairRecord({ id, edit }: { id?: string; edit?: boolean }) {
  const auth = useApiQuery<{ id: number; role: string }>("/auth/me");
  const detail = useApiQuery<WorkshopRepairDetail>(`${listPath}/${id}`, Boolean(id && auth.data));
  const record = detail.data;
  const detailPath = `${listPath}/${id}`;
  const canManage = Boolean(record && auth.data && (auth.data.role === "ADMIN" || auth.data.id === Number(record.author_id)));
  const title = !id ? "수리 기록 작성" : edit ? "수리 기록 수정" : record?.equipment_name ?? "수리 기록 상세";
  const error = auth.error ?? (id ? detail.error : null);
  const loading = auth.isPending || Boolean(id && detail.isPending);

  return <div className="work-log-wrap workshop-page workshop-entry">
    <header className="workshop-entry-heading">
      <Link href={edit ? detailPath : listPath} className="workshop-entry-back"><ArrowLeft aria-hidden />{edit ? "상세로" : "수리 기록 목록"}</Link>
      <div className="workshop-heading">
        <h1>{title}</h1>
        {!edit && canManage && <div className="cash-actions"><Link href={`${detailPath}/edit`}>수정·상태 변경</Link></div>}
      </div>
    </header>
    {error ? <p className="error" role="alert">{error.message}</p>
      : loading ? <p role="status">불러오는 중…</p>
      : !id ? <WorkshopRepairForm key="new" />
      : edit && !canManage ? <p className="error" role="alert">작성자 또는 관리자만 수정할 수 있습니다.</p>
      : record && (edit ? <WorkshopRepairForm record={record} key={id} /> : <WorkshopRepairDetailView record={record} canManage={canManage} key={id} />)}
  </div>;
}

function WorkshopRepairDetailView({ record, canManage }: { record: WorkshopRepairDetail; canManage: boolean }) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const hasPhotos = record.workshop_photos.length > 0 || record.photos.length > 0;

  async function deleteRecord(button: HTMLButtonElement) {
    if (deleting) return;
    setDeleting(true);
    setError("");
    try {
      await api(`${listPath}/${record.id}`, { method: "DELETE" });
      if (button.isConnected) router.replace(listPath);
    } catch (error) {
      setError(error instanceof Error ? error.message : "삭제 실패");
      setDeleting(false);
    }
  }

  return <>
    <article className="repair-panel">
      <div className="workshop-detail-meta">
        <time dateTime={record.work_date}>{record.work_date}</time>
        <span className={`workshop-status status-${workshopStatus(record.status)}`}>{workshopStatusLabel(record.status)}</span>
        <span>{record.author_name}</span>
      </div>
      <MarkdownViewer value={record.description_markdown} />

      {record.units.length > 0 && <section className="workshop-units" aria-labelledby="workshop-units-detail-title">
        <header className="workshop-units-heading">
          <h2 id="workshop-units-detail-title">개별 장비·부품</h2>
          <span>{record.units.length} EA</span>
        </header>
        <div className="workshop-unit-list">
          {record.units.map(unit => (
            <article className="workshop-unit-detail" key={unit.unit_no}>
              <header className="workshop-unit-heading">
                <h3>{unit.unit_no}번</h3>
                <span className={`workshop-status status-${workshopStatus(unit.status)}`}>{workshopStatusLabel(unit.status)}</span>
              </header>
              {(unit.serial_number || unit.fault_axis) && <dl className="workshop-unit-meta">
                {unit.serial_number && <div><dt>S/N</dt><dd>{unit.serial_number}</dd></div>}
                {unit.fault_axis && <div><dt>오류 축</dt><dd>{unit.fault_axis}축</dd></div>}
              </dl>}
              {unit.test_result && <p className="workshop-unit-result">{unit.test_result}</p>}
            </article>
          ))}
        </div>
      </section>}

      {(hasPhotos || record.files.length > 0) && <section className="workshop-attachments" aria-labelledby="workshop-attachments-title">
        <h2 id="workshop-attachments-title">첨부파일</h2>
        {hasPhotos && <div className="workshop-photo-grid">
          {record.workshop_photos.map(photo => {
            const path = `/api/v1/workshop-repairs/photos/${photo.id}/content`;
            return <a key={`workshop-${photo.id}`} href={path} target="_blank" rel="noreferrer">
              <Image src={path} width={photo.width_px || 480} height={photo.height_px || 360} unoptimized alt={photo.original_name || "수리 기록 사진"} />
            </a>;
          })}
          {record.photos.map(photo => <a key={photo.id} href={`/api/v1/service-photos/${photo.id}/content`} target="_blank" rel="noreferrer">
            <Image src={`/api/v1/service-photos/${photo.id}/thumbnail`} width={480} height={360} unoptimized alt={photo.original_name || "수리 사진"} />
          </a>)}
        </div>}
        {record.files.map(file => <a key={file.id} href={`/api/v1/files/${file.id}/content`} target="_blank" rel="noreferrer">{file.original_name}</a>)}
      </section>}
    </article>

    {canManage && <div className="workshop-delete">
      {confirmDelete && <p role="status">이 수리 기록을 삭제할까요?</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="cash-actions">
        {confirmDelete ? <>
          <button type="button" disabled={deleting} onClick={() => { setConfirmDelete(false); setError(""); }}>취소</button>
          <button type="button" className="accounting-cancel" disabled={deleting} onClick={event => void deleteRecord(event.currentTarget)}>{deleting ? "삭제 중…" : "삭제 확인"}</button>
        </> : <button type="button" className="accounting-cancel" onClick={() => setConfirmDelete(true)}>삭제</button>}
      </div>
    </div>}
  </>;
}
