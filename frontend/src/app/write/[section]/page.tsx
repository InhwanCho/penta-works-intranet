"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { ALargeSmall, ArrowLeft, Camera, Moon, Plus, Sun, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePreferences } from "@/components/preferences-provider";
import { api, upload } from "@/lib/api";
import LoadingIndicator, { ButtonSpinner } from "@/components/loading-indicator";
import { RecordSidebar } from "@/components/record-navigation";
import { AcrInspectionEditor, AcrState, createAcrState, createPmItems, hydrateAcr, hydratePm, PmInspectionEditor, PmItem, serializeAcr } from "@/components/service-inspection-forms";

const MarkdownEditor = dynamic(() => import("@/components/markdown-editor"), { ssr: false });

type WriteSection = "notices" | "meetings" | "repairs" | "manuals";
type User = { id: number; login_id?: string; name: string };
type Hospital = { id: number; name: string };
type AvailableComponent = { id: number; name: string; componentType?: string; partNumber?: string; serialNumber?: string; equipmentModel?: string };
type SelectedComponent = { componentId: number; actionType: string; quantity: number; note: string };
type ExistingPhoto = { id: number; original_name?: string };
type Draft = {
  title: string;
  content: string;
  fileIds: number[];
  meetingAt: string;
  location: string;
  participantIds: string[];
  assigneeId: string;
  manualFileId: number | null;
  manualFileName: string;
  writtenAt: string;
  hospitalName: string;
  hospitalId: string;
  modelName: string;
  serviceType: string;
  acrKind: string;
  contractType: string;
  serviceTitle: string;
  engineerName: string;
  symptom: string;
  workDate: string;
  workStartTime: string;
  workEndTime: string;
  travelMinutes: string;
  specialNotes: string;
  partsDetails: string;
  laborFee: string;
  partsFee: string;
  travelFee: string;
  totalFee: string;
  remarks: string;
  followUp: string;
  heLevel: string;
  countsAsPm: boolean;
  coldheadPosition: string;
  coldheadSerial: string;
  coldheadInDate: string;
  customerConfirmation: string;
  scheduleId: string;
  prepItems: string;
  pinned: boolean;
  savedAt: string;
};

const titles: Record<WriteSection, string> = { notices: "공지사항 작성", meetings: "회의록 작성", repairs: "서비스 기록 작성", manuals: "업무 매뉴얼 작성" };
const emptyDraft = (): Draft => ({
  title: "", content: "", fileIds: [], location: "", participantIds: [], assigneeId: "", manualFileId: null, manualFileName: "", pinned: false,
  writtenAt: localDate(), hospitalName: "", hospitalId: "", modelName: "", serviceType: "", acrKind: "doc", contractType: "", serviceTitle: "", engineerName: "", symptom: "",
  workDate: "", workStartTime: "", workEndTime: "", travelMinutes: "", specialNotes: "", partsDetails: "", laborFee: "", partsFee: "", travelFee: "", totalFee: "", remarks: "", followUp: "", heLevel: "", countsAsPm: false,
  coldheadPosition: "", coldheadSerial: "", coldheadInDate: "", customerConfirmation: "", scheduleId: "", prepItems: "",
  meetingAt: currentMondayAtTen(), savedAt: "",
});

export default function WritePage() {
  const params = useParams<{ section: string; id?: string }>();
  const router = useRouter();
  const { dark, largeText, toggleDark, toggleLargeText } = usePreferences();
  const section = params.section as WriteSection;
  const valid = section in titles;
  const editing = Boolean(params.id);
  const [me, setMe] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [servicePhotos, setServicePhotos] = useState<File[]>([]);
  const [pmItems, setPmItems] = useState<PmItem[]>(createPmItems);
  const [acrState, setAcrState] = useState<AcrState>(createAcrState);
  const [availableComponents, setAvailableComponents] = useState<AvailableComponent[]>([]);
  const [selectedComponents, setSelectedComponents] = useState<SelectedComponent[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<ExistingPhoto[]>([]);
  const draftKey = useMemo(() => me && valid && !editing ? `penta-office:draft:${me.id}:${section}` : "", [editing, me, section, valid]);

  useEffect(() => {
    if (!valid) { router.replace("/"); return; }
    void Promise.all([api<User>("/auth/me"), api<User[]>("/users"), api<Hospital[]>("/hospitals")]).then(async ([current, members, hospitalRows]) => {
      setMe(current); setUsers(members); setHospitals(hospitalRows);
      if (editing) {
        const row = await api<Record<string, string | number | boolean | null>>(`/${section}/${params.id}`);
        setDraft({ ...emptyDraft(), title: String(row.title ?? row.equipment_name ?? ""), content: String(row.content_markdown ?? row.description_markdown ?? ""), meetingAt: toLocalInput(row.meeting_at), location: String(row.location ?? ""), participantIds: String(row.participant_ids ?? "").split(",").filter(Boolean), assigneeId: String(row.assignee_id ?? ""), manualFileId: row.file_id ? Number(row.file_id) : null, manualFileName: String(row.original_name ?? ""), pinned: Boolean(row.pinned), writtenAt: String(row.written_at ?? localDate()), hospitalName: String(row.hospital_name ?? ""), hospitalId: String(row.hospital_id ?? ""), modelName: String(row.model_name ?? ""), serviceType: String(row.service_type ?? ""), acrKind: String(row.acr_kind ?? "doc"), contractType: String(row.contract_type ?? ""), serviceTitle: String(row.service_title ?? ""), engineerName: String(row.engineer_name ?? ""), symptom: String(row.symptom ?? ""), workDate: String(row.work_date ?? ""), workStartTime: String(row.work_start_time ?? "").slice(0,5), workEndTime: String(row.work_end_time ?? "").slice(0,5), travelMinutes: String(row.travel_minutes ?? ""), specialNotes: String(row.special_notes ?? ""), partsDetails: String(row.parts_details ?? ""), laborFee: String(row.labor_fee ?? ""), partsFee: String(row.parts_fee ?? ""), travelFee: String(row.travel_fee ?? ""), totalFee: String(row.total_fee ?? ""), remarks: String(row.remarks ?? ""), followUp: String(row.follow_up ?? ""), heLevel: String(row.he_level ?? ""), countsAsPm: Boolean(row.counts_as_pm), coldheadPosition: String(row.coldhead_position ?? ""), coldheadSerial: String(row.coldhead_serial ?? ""), coldheadInDate: String(row.coldhead_in_date ?? ""), customerConfirmation: String(row.customer_confirmation ?? "") });
        if (section === "repairs") {
          const [pm, acr, componentRows, photoRows] = await Promise.all([api<unknown>(`/repairs/${params.id}/pm`), api<unknown>(`/repairs/${params.id}/acr`), api<Array<Record<string, unknown>>>(`/repairs/${params.id}/components`), api<ExistingPhoto[]>(`/service-photos?repairId=${params.id}`)]);
          setPmItems(hydratePm(pm)); setAcrState(hydrateAcr(acr));
          setSelectedComponents(componentRows.map((item) => ({ componentId: Number(item.component_id), actionType: String(item.action_type ?? "CHECKED"), quantity: Number(item.quantity ?? 1), note: String(item.note ?? "") })));
          setExistingPhotos(photoRows);
        }
        setReady(true);
      }
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "작성 화면을 불러오지 못했습니다."));
  }, [editing, params.id, router, section, valid]);

  useEffect(() => {
    if (!draftKey) return;
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try {
        const stored = JSON.parse(saved) as Draft;
        const untouchedMeeting = section === "meetings" && !stored.title && !stored.content && !stored.fileIds?.length;
        const restored = { ...emptyDraft(), ...stored };
        setDraft(untouchedMeeting ? { ...emptyDraft(), participantIds: users.map((user) => String(user.id)) } : restored);
      }
      catch { localStorage.removeItem(draftKey); }
    } else if (section === "meetings") setDraft((old) => ({ ...old, participantIds: users.map((user) => String(user.id)) }));
    if (section === "repairs" && !editing) {
      const query = new URLSearchParams(window.location.search);
      const hospitalId = query.get("hospitalId") ?? "";
      const hospital = hospitals.find((item) => String(item.id) === hospitalId);
      if (hospital) setDraft((old) => ({ ...old, hospitalId, hospitalName: hospital.name,
        writtenAt: query.get("date") ?? old.writtenAt, workDate: query.get("date") ?? old.workDate,
        serviceType: query.get("type") ?? old.serviceType, serviceTitle: query.get("note") ?? old.serviceTitle,
        scheduleId: query.get("scheduleId") ?? "", acrKind: query.get("acrKind") ?? old.acrKind }));
    }
    setReady(true);
  }, [draftKey, editing, hospitals, section, users]);

  useEffect(() => {
    if (!ready || !draftKey) return;
    const timer = window.setTimeout(() => {
      const next = { ...draft, savedAt: new Date().toISOString() };
      localStorage.setItem(draftKey, JSON.stringify(next));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft, draftKey, ready]);

  useEffect(() => {
    if (section !== "repairs" || !draft.hospitalId) { setAvailableComponents([]); return; }
    void api<Record<string, unknown>>(`/hospitals/${draft.hospitalId}`).then((hospital) => {
      const systems = Array.isArray(hospital.systems) ? hospital.systems as Array<Record<string, unknown>> : [];
      setAvailableComponents(systems.flatMap((system) => (Array.isArray(system.components) ? system.components as Array<Record<string, unknown>> : []).map((component) => ({ id: Number(component.id), name: String(component.name ?? ""), componentType: String(component.componentType ?? ""), partNumber: String(component.partNumber ?? ""), serialNumber: String(component.serialNumber ?? ""), equipmentModel: String(system.model ?? "") }))));
    }).catch(() => setAvailableComponents([]));
  }, [draft.hospitalId, section]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft((old) => ({ ...old, [key]: value })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (section === "repairs" && !draft.content.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim()) throw new Error("수리 내용을 입력하세요.");
      const method = editing ? "PUT" : "POST";
      const suffix = editing ? `/${params.id}` : "";
      if (section === "notices") await api(`/notices${suffix}`, { method, body: JSON.stringify({ title: draft.title, contentMarkdown: draft.content, pinned: draft.pinned, fileIds: draft.fileIds }) });
      if (section === "meetings") await api(`/meetings${suffix}`, { method, body: JSON.stringify({ title: draft.title, meetingAt: draft.meetingAt, contentMarkdown: draft.content, participantIds: draft.participantIds.map(Number), fileIds: draft.fileIds }) });
      if (section === "repairs") {
        const payload = { hospitalId: Number(draft.hospitalId) || null, equipmentName: draft.title, contentMarkdown: draft.content,
          writtenAt: draft.writtenAt, hospitalName: blank(draft.hospitalName), modelName: blank(draft.modelName),
          serviceType: blank(draft.serviceType), acrKind: draft.serviceType === "ACR" ? draft.acrKind : null,
          contractType: blank(draft.contractType), serviceTitle: blank(draft.serviceTitle), engineerName: blank(draft.engineerName),
          symptom: blank(draft.symptom), workDate: blank(draft.workDate), workStartTime: blank(draft.workStartTime),
          workEndTime: blank(draft.workEndTime), travelMinutes: numberOrNull(draft.travelMinutes), specialNotes: blank(draft.specialNotes),
          partsDetails: blank(draft.partsDetails), laborFee: numberOrNull(draft.laborFee), partsFee: numberOrNull(draft.partsFee),
          travelFee: numberOrNull(draft.travelFee), totalFee: numberOrNull(draft.totalFee), remarks: blank(draft.remarks),
          followUp: blank(draft.followUp), heLevel: blank(draft.heLevel), countsAsPm: draft.countsAsPm,
          coldheadPosition: blank(draft.coldheadPosition), coldheadSerial: blank(draft.coldheadSerial),
          coldheadInDate: blank(draft.coldheadInDate), customerConfirmation: blank(draft.customerConfirmation),
          assigneeId: Number(draft.assigneeId) || null, scheduleId: Number(draft.scheduleId) || null, fileIds: draft.fileIds };
        const saved = await api<{ id?: number }>(`/repairs${suffix}`, { method, body: JSON.stringify(payload) });
        const repairId = editing ? Number(params.id) : Number(saved?.id);
        if (draft.serviceType === "PM") await api(`/repairs/${repairId}/pm`, { method: "PUT", body: JSON.stringify({ items: pmItems }) });
        if (draft.serviceType === "ACR") await api(`/repairs/${repairId}/acr`, { method: "PUT", body: JSON.stringify(serializeAcr(acrState)) });
        await api(`/repairs/${repairId}/components`, { method: "PUT", body: JSON.stringify(selectedComponents) });
        if (draft.hospitalId && draft.prepItems.trim()) {
          for (const text of draft.prepItems.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
            await api("/service-prep", { method: "POST", body: JSON.stringify({ hospitalId: Number(draft.hospitalId), text }) });
          }
        }
        for (const photo of servicePhotos) {
          const form = new FormData(); form.append("file", photo);
          await api(`/service-photos?repairId=${repairId}`, { method: "POST", body: form });
        }
        localStorage.removeItem(draftKey);
        router.replace(`/repairs/${repairId}`);
        return;
      }
      if (section === "manuals") {
        const saved = manualFile ? await upload(manualFile) : null;
        const fileId = saved?.id ?? draft.manualFileId;
        if (!fileId) throw new Error("PDF 파일을 선택하세요.");
        await api(`/manuals${suffix}`, { method, body: JSON.stringify({ title: draft.title, fileId }) });
      }
      localStorage.removeItem(draftKey);
      router.replace(editing ? `/${section}/${params.id}` : `/${section}`);
    } catch (reason) { setBusy(false); setError(reason instanceof Error ? reason.message : "저장하지 못했습니다."); }
  }

  if (error && !ready) return <main className="detail-state"><p>{error}</p><button onClick={() => window.location.reload()}>다시 시도</button></main>;
  if (!valid || !me || !ready) return valid ? <div className="shell record-shell"><RecordSidebar activeSection={section} /><main className="record-main"><LoadingIndicator label="작성 화면을 불러오는 중" scope="workspace" /></main></div> : <LoadingIndicator scope="screen" />;

  return <div className="shell record-shell"><RecordSidebar activeSection={section} /><main className="write-page record-main">
    <header className="write-header">
      <button className="icon-button" onClick={() => router.back()} aria-label="뒤로 가기"><ArrowLeft /></button>
      <button className="write-logo brand-lockup" type="button" onClick={() => router.push("/")} aria-label="대시보드로 이동"><Image src="/favicon/android-chrome-192x192.png" width={38} height={38} alt="" priority /><b>PENTA <small>OFFICE</small></b></button>
      <div className="write-header-actions"><button className={`icon-button ${largeText ? "active" : ""}`} onClick={toggleLargeText} aria-label="큰 글씨 모드"><ALargeSmall /></button><button className="icon-button" onClick={toggleDark} aria-label={dark ? "라이트 모드" : "다크 모드"}>{dark ? <Sun /> : <Moon />}</button></div>
    </header>
    <section className="write-wrap">
      <div className="write-title"><div><span>{editing ? "EDIT RECORD" : "NEW RECORD"}</span><h1>{editing ? `${titles[section].replace("작성", "수정")}` : titles[section]}</h1><p>{editing ? "내용을 수정한 뒤 저장하세요." : "작성 내용은 이 브라우저에 계정별로 자동 임시저장됩니다."}</p></div></div>
      <form className="write-form" onSubmit={submit}>
        <label>{section === "repairs" ? "장비명" : "제목"}<input required value={draft.title} onChange={(event) => update("title", event.target.value)} placeholder={section === "repairs" ? "장비명을 입력하세요" : "제목을 입력하세요"} /></label>
        {section === "notices" && <label className="pin-control"><input type="checkbox" checked={draft.pinned} onChange={(event) => update("pinned", event.target.checked)} /><span><strong>상단 고정</strong><small>중요 공지를 목록 가장 위에 표시합니다.</small></span></label>}
        {section === "meetings" && <><label>회의 일시<input type="datetime-local" required value={draft.meetingAt} onChange={(event) => update("meetingAt", event.target.value)} /></label><label>참여자<select multiple value={draft.participantIds} onChange={(event) => update("participantIds", Array.from(event.target.selectedOptions, (option) => option.value))}>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><small>기본값은 전체 참여자입니다. 여러 명은 Ctrl(Windows) 또는 Command(Mac)를 누른 채 선택하세요.</small></label></>}
        {section === "repairs" && <>
          <div className="form-section service-primary-section"><div className="service-section-head"><div><span>FIELD SERVICE LOG</span><h2>기본 정보</h2></div><div className="service-type-segments">{[["PM","PM"],["REPAIR","고장수리"],["COLDHEAD","Cold Head"],["ACR","ACR"],["CALL","Call"],["ETC","기타"]].map(([value, label]) => <button type="button" className={draft.serviceType === value ? "active" : ""} onClick={() => update("serviceType", value)} key={value}>{label}</button>)}</div></div>
            <div className="form-grid"><label>작성일<input type="date" required value={draft.writtenAt} onChange={(event) => update("writtenAt", event.target.value)} /></label><label>등록 병원<select value={draft.hospitalId} onChange={(event) => { const id = event.target.value; update("hospitalId", id); const hospital = hospitals.find((item) => String(item.id) === id); if (hospital) update("hospitalName", hospital.name); }}><option value="">직접 입력</option>{hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.name}</option>)}</select></label>{!draft.hospitalId && <label>병원명<input value={draft.hospitalName} onChange={(event) => update("hospitalName", event.target.value)} /></label>}<label>형명·모델명<input value={draft.modelName} onChange={(event) => update("modelName", event.target.value)} /></label><label>담당 엔지니어<input value={draft.engineerName} onChange={(event) => update("engineerName", event.target.value)} /></label><label>담당자<select value={draft.assigneeId} onChange={(event) => update("assigneeId", event.target.value)}><option value="">미지정</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>{draft.serviceType !== "CALL" && <label>계약 구분<select value={draft.contractType} onChange={(event) => update("contractType", event.target.value)}><option value="">선택 안 함</option><option value="C">C</option><option value="W">W</option><option value="On-call">On-call</option><option value="기타">기타</option></select></label>}</div>
            {draft.serviceType === "ACR" && <div className="service-kind-row"><span>ACR 종류</span>{[["doc","서류"],["full","정밀"],["pretest","사전 TEST"]].map(([value,label]) => <button type="button" className={draft.acrKind === value ? "active" : ""} onClick={() => update("acrKind", value)} key={value}>{label}</button>)}</div>}
            {draft.serviceType === "COLDHEAD" && <div className="form-grid service-subfields"><label>Cold Head 위치<select value={draft.coldheadPosition} onChange={(event) => update("coldheadPosition", event.target.value)}><option value="">선택</option><option value="A2">A2</option><option value="A3">A3</option></select></label><label>Serial Number<input value={draft.coldheadSerial} onChange={(event) => update("coldheadSerial", event.target.value)} /></label><label>입고일<input type="date" value={draft.coldheadInDate} onChange={(event) => update("coldheadInDate", event.target.value)} /></label></div>}
          </div>
          <label>작업 제목<input value={draft.serviceTitle} onChange={(event) => update("serviceTitle", event.target.value)} placeholder="예: 정기 예방점검 / RF 앰프 교체" /></label>
          {draft.serviceType === "REPAIR" && <label>증상·요청사항<textarea rows={3} value={draft.symptom} onChange={(event) => update("symptom", event.target.value)} placeholder="접수 내용, 에러코드, 발생 상황" /></label>}
          <div className="editor-field"><span>{draft.serviceType === "CALL" ? "Call 내용" : "조치 내용·특이사항"}</span><MarkdownEditor value={draft.content} onChange={(value) => update("content", value)} onUploaded={(id) => setDraft((old) => ({ ...old, fileIds: [...old.fileIds, id] }))} /></div>
          {draft.serviceType === "PM" && <PmInspectionEditor items={pmItems} onChange={setPmItems} />}
          {draft.serviceType === "ACR" && <AcrInspectionEditor value={acrState} onChange={setAcrState} tesla={draft.modelName.match(/3(?:\.0)?\s*T/i) ? "3" : "1.5"} />}
          {draft.serviceType !== "ACR" && <section className="service-photo-uploader"><div><Camera /><span><strong>현장 사진</strong><small>자동으로 장변 1920px, 썸네일 480px로 최적화됩니다.</small></span></div><label className="photo-add-button"><Plus /> 사진 추가<input type="file" accept="image/*" multiple onChange={(event) => { const incoming = Array.from(event.target.files ?? []).filter((file) => file.size <= 20 * 1024 * 1024); setServicePhotos((old) => [...old, ...incoming].slice(0, Math.max(0, 20 - existingPhotos.length))); event.currentTarget.value = ""; }} /></label>{(existingPhotos.length > 0 || servicePhotos.length > 0) && <div className="photo-queue">{existingPhotos.map((photo) => <article key={photo.id}><Image src={`/api/v1/service-photos/${photo.id}/thumbnail`} width={160} height={120} unoptimized alt={photo.original_name ?? "기존 작업 사진"} /><button type="button" onClick={async () => { if (!window.confirm("이 사진을 삭제할까요?")) return; await api(`/service-photos/${photo.id}`, { method: "DELETE" }); setExistingPhotos((old) => old.filter((item) => item.id !== photo.id)); }} aria-label="기존 사진 제거"><X /></button><small>{photo.original_name ?? "작업 사진"}</small></article>)}{servicePhotos.map((file, index) => <PhotoPreview file={file} key={`${file.name}-${file.lastModified}-${index}`} onRemove={() => setServicePhotos((old) => old.filter((_, current) => current !== index))} />)}</div>}</section>}
          <details className="form-section form-disclosure" open><summary>작업 정보 <small>시간·부품·후속조치</small></summary><div className="form-disclosure-body"><div className="form-grid"><label>작업일<input type="date" value={draft.workDate} onChange={(event) => update("workDate", event.target.value)} /></label><label>작업 시작<input type="time" value={draft.workStartTime} onChange={(event) => update("workStartTime", event.target.value)} /></label><label>작업 종료<input type="time" value={draft.workEndTime} onChange={(event) => update("workEndTime", event.target.value)} /></label><label>교통시간(분)<input type="number" min="0" value={draft.travelMinutes} onChange={(event) => update("travelMinutes", event.target.value)} /></label>{["REPAIR","COLDHEAD"].includes(draft.serviceType) && <label>헬륨 레벨(%)<input type="number" min="0" max="100" step="0.01" value={draft.heLevel} onChange={(event) => update("heLevel", event.target.value)} /></label>}</div>{draft.serviceType !== "CALL" && <><label>특기사항<textarea rows={3} value={draft.specialNotes} onChange={(event) => update("specialNotes", event.target.value)} /></label><label>부품 내역<textarea rows={4} placeholder="부품번호, 부품명, 수량, 단가, 금액 등을 입력하세요." value={draft.partsDetails} onChange={(event) => update("partsDetails", event.target.value)} /></label>{availableComponents.length > 0 && <div className="repair-component-picker"><strong>등록 부품 연결</strong>{availableComponents.map((component) => { const selected = selectedComponents.find((item) => item.componentId === component.id); return <article key={component.id}><label><input type="checkbox" checked={Boolean(selected)} onChange={(event) => setSelectedComponents((old) => event.target.checked ? [...old, { componentId: component.id, actionType: "CHECKED", quantity: 1, note: "" }] : old.filter((item) => item.componentId !== component.id))} /><span><b>{component.name}</b><small>{[component.equipmentModel, component.partNumber && `P/N ${component.partNumber}`, component.serialNumber && `S/N ${component.serialNumber}`].filter(Boolean).join(" · ")}</small></span></label>{selected && <div><select value={selected.actionType} onChange={(event) => setSelectedComponents((old) => old.map((item) => item.componentId === component.id ? { ...item, actionType: event.target.value } : item))}><option value="CHECKED">점검</option><option value="REPLACED">교체</option><option value="INSTALLED">설치</option><option value="REMOVED">제거</option></select><input type="number" min="1" value={selected.quantity} onChange={(event) => setSelectedComponents((old) => old.map((item) => item.componentId === component.id ? { ...item, quantity: Number(event.target.value) || 1 } : item))} /></div>}</article>; })}</div>}</>}<label>후속 조치·재방문 계획<textarea rows={3} value={draft.followUp} onChange={(event) => update("followUp", event.target.value)} /></label>{["REPAIR","COLDHEAD","ACR","ETC"].includes(draft.serviceType) && <label className="check service-pm-count"><input type="checkbox" checked={draft.countsAsPm} onChange={(event) => update("countsAsPm", event.target.checked)} /> 이 방문을 다음 PM 주기 계산에 포함</label>}</div></details>
          {draft.hospitalId && <label className="form-section service-prep-from-log">다음 방문 준비물<textarea rows={3} value={draft.prepItems} onChange={(event) => update("prepItems", event.target.value)} placeholder="다음 방문에 가져갈 부품·물품을 한 줄에 하나씩 입력하세요." /><small>저장하면 이 병원의 미완료 준비물 목록에 추가됩니다.</small></label>}
          <details className="form-section form-disclosure"><summary>청구 및 확인 <small>필요할 때 펼쳐서 입력</small></summary><div className="form-disclosure-body"><div className="form-grid"><label>기술료<input type="number" min="0" step="0.01" value={draft.laborFee} onChange={(event) => update("laborFee", event.target.value)} /></label><label>부품비<input type="number" min="0" step="0.01" value={draft.partsFee} onChange={(event) => update("partsFee", event.target.value)} /></label><label>출장비<input type="number" min="0" step="0.01" value={draft.travelFee} onChange={(event) => update("travelFee", event.target.value)} /></label><label>합계<input type="number" min="0" step="0.01" value={draft.totalFee} onChange={(event) => update("totalFee", event.target.value)} /></label><label>고객 확인<input value={draft.customerConfirmation} onChange={(event) => update("customerConfirmation", event.target.value)} /></label></div><label>비고<textarea rows={3} value={draft.remarks} onChange={(event) => update("remarks", event.target.value)} /></label></div></details>
        </>}
        {section === "manuals" ? <label>PDF 첨부파일<input type="file" accept="application/pdf" required={!editing && !draft.manualFileId} onChange={(event) => setManualFile(event.target.files?.[0] ?? null)} />{editing && draft.manualFileName && <small>현재 파일: {draft.manualFileName} · 새 파일을 선택하지 않으면 그대로 유지됩니다.</small>}</label> : section !== "repairs" && <div className="editor-field"><span>내용</span><MarkdownEditor value={draft.content} onChange={(value) => update("content", value)} onUploaded={(id) => setDraft((old) => ({ ...old, fileIds: [...old.fileIds, id] }))} /></div>}
        {error && <div className="error">{error}</div>}
        <div className="write-actions"><button type="button" onClick={() => router.back()}>취소</button><button className="primary" disabled={busy}>{busy ? <><ButtonSpinner /> 저장 중…</> : editing ? "수정 저장" : "등록하기"}</button></div>
      </form>
    </section>
  </main></div>;
}

function toLocalInput(value: unknown) { if (!value) return emptyDraft().meetingAt; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value).slice(0, 16) : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function currentMondayAtTen() {
  const date = new Date();
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  date.setHours(10, 0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function localDate() { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function blank(value: string) { return value.trim() || null; }
function numberOrNull(value: string) { return value.trim() ? Number(value) : null; }

function PhotoPreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => { const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next); }, [file]);
  return <article>{url && <Image src={url} width={160} height={120} unoptimized alt={file.name} />}<button type="button" onClick={onRemove} aria-label={`${file.name} 제거`}><X /></button><small>{file.name}</small></article>;
}
