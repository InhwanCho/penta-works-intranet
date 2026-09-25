"use client";

import { CheckCircle2, ClipboardCheck, FlaskConical } from "lucide-react";
import { useRef } from "react";

export type PmField = { label: string; value: string; type?: "text" | "range" | "check"; suffix?: string };
export type PmItem = { section: string; kind: string; name: string; purpose: string; result: string; comment: string; fields: PmField[] };
type PmDefinition = [string, string, { noCheck?: boolean; fields?: Array<string | { label: string; suffix?: string; default?: string; type?: "text" | "range" | "check" }>; options?: Array<[string, string]> }?];

const PM_SECTIONS: Array<[string, PmDefinition[]]> = [
  ["Image Quality", [
    ["Alignment Light Check", "IQ"],
    ["DQA Tool", "IQ", { noCheck: true, fields: ["New iso center", "X", "Y", "Z"] }],
    ["DAQA", "IQ", { noCheck: true, fields: [{ label: "Coil", default: "Head coil" }, "AXI", "COR", "SAG"] }],
    ["Performed Save Info", "", { options: [["done", "시행"], ["skip", "미시행"]] }],
  ]],
  ["RF / System Cabinet", [
    ["Fan & Filter for SFRD", "Clean"], ["Check RF Output Power", "Check"], ["Power Monitor Check", "Check"],
  ]],
  ["Patient Handling", [["Patient Table Check", "Safety"]]],
  ["Gradient", [
    ["Lytron System Check", "Check temp.", { noCheck: true, fields: [{ label: "온도", suffix: "°C" }, "비고"] }],
    ["LV Shim", "IQ", { fields: [{ label: "주파수", suffix: "Hz" }, "X", "Y", "Z"], options: [["done", "시행"], ["skip", "미시행"], ["cant", "시행불가"]] }],
  ]],
  ["Computer", [
    ["Storelog", "", { options: [["done", "시행"], ["skip", "미시행"]] }], ["Clean Dust / Set Time", ""],
  ]],
  ["Magnet", [
    ["Inspect MRU", "Safety"],
    ["Check Magnet LHe Level", "Safety", { noCheck: true, fields: [{ label: "LHe Level", suffix: "%" }] }],
    ["Check Magnet Pressure", "Safety", { noCheck: true, fields: [{ label: "Magnet Pressure", suffix: "psi" }, { label: "Shield Cooler", suffix: "MPa", type: "range" }, { label: "He 보충 시행", type: "check" }] }],
  ]],
];

export function createPmItems(): PmItem[] {
  return PM_SECTIONS.flatMap(([section, definitions]) => definitions.map(([name, purpose, options]) => ({
    section, name, purpose, kind: options?.noCheck ? "fields" : "check",
    result: options?.noCheck ? "" : options?.options?.[0]?.[0] ?? "pass", comment: "",
    fields: (options?.fields ?? []).map((field) => typeof field === "string"
      ? { label: field, value: "", type: "text" }
      : { label: field.label, value: field.default ?? "", type: field.type ?? "text", suffix: field.suffix }),
  })));
}

export function hydratePm(payload: unknown): PmItem[] {
  const raw = payload as { items?: Array<Record<string, unknown>> } | null;
  if (!raw?.items?.length) return createPmItems();
  return raw.items.map((item) => ({
    section: String(item.section_name ?? ""), kind: String(item.item_kind ?? "check"), name: String(item.item_name ?? ""),
    purpose: String(item.purpose ?? ""), result: String(item.result ?? ""), comment: String(item.comment ?? ""),
    fields: Array.isArray(item.fields) ? item.fields.map((field) => {
      const row = field as Record<string, unknown>;
      const type = ["range", "check"].includes(String(row.input_type)) ? String(row.input_type) as "range" | "check" : "text";
      return { label: String(row.label ?? ""), value: String(row.value_text ?? ""), type, suffix: row.suffix ? String(row.suffix) : undefined };
    }) : [],
  }));
}

export function PmInspectionEditor({ items, onChange }: { items: PmItem[]; onChange: (items: PmItem[]) => void }) {
  const sections = Array.from(new Set(items.map((item) => item.section)));
  const update = (index: number, next: PmItem) => onChange(items.map((item, current) => current === index ? next : item));
  return <div className="inspection-editor">
    <header><span className="inspection-icon"><ClipboardCheck /></span><div><b>Planned Maintenance Form</b><small>GE Signa 정기점검 보고서 기준</small></div></header>
    {sections.map((section) => <details className="inspection-section" key={section} open>
      <summary>{section}<span>{items.filter((item) => item.section === section).length}항목</span></summary>
      <div className="inspection-items">{items.map((item, index) => item.section !== section ? null : <article className="pm-item" key={`${section}-${item.name}`}>
        <div className="pm-item-title"><div><strong>{item.name}</strong>{item.purpose && <small>{item.purpose}</small>}</div>{item.kind === "check" && <select value={item.result} onChange={(event) => update(index, { ...item, result: event.target.value })} className={`inspection-result result-${item.result}`}>
          {(pmOptions(item.name)).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>}</div>
        {item.fields.length > 0 && <div className="inspection-field-grid">{item.fields.map((field, fieldIndex) => <PmFieldEditor field={field} key={`${field.label}-${fieldIndex}`} onChange={(value) => update(index, { ...item, fields: item.fields.map((old, current) => current === fieldIndex ? { ...old, value } : old) })} />)}</div>}
        {item.kind === "check" && <input className="inspection-comment" value={item.comment} onChange={(event) => update(index, { ...item, comment: event.target.value })} placeholder="비고 또는 측정 특이사항" />}
      </article>)}</div>
    </details>)}
  </div>;
}

function PmFieldEditor({ field, onChange }: { field: PmField; onChange: (value: string) => void }) {
  if (field.type === "check") return <label className="pm-field-check"><span>{field.label}</span><input type="checkbox" checked={field.value === "Y"} onChange={(event) => onChange(event.target.checked ? "Y" : "")} /></label>;
  if (field.type === "range") {
    const [from = "", to = ""] = field.value.split("~", 2);
    const set = (left: string, right: string) => onChange(left || right ? `${left}~${right}` : "");
    return <label><span>{field.label}</span><div className="pm-range"><input value={from} inputMode="decimal" onChange={(event) => set(event.target.value, to)} aria-label={`${field.label} 시작값`} /><b>~</b><input value={to} inputMode="decimal" onChange={(event) => set(from, event.target.value)} aria-label={`${field.label} 종료값`} />{field.suffix && <em>{field.suffix}</em>}</div></label>;
  }
  return <label><span>{field.label}</span><div><input value={field.value} onChange={(event) => onChange(event.target.value)} />{field.suffix && <em>{field.suffix}</em>}</div></label>;
}

export function PmInspectionView({ payload }: { payload: unknown }) {
  const items = hydratePm(payload);
  if (!(payload as { items?: unknown[] } | null)?.items?.length) return null;
  const sections = Array.from(new Set(items.map((item) => item.section)));
  return <section className="repair-panel inspection-view"><h2><ClipboardCheck /> PM 점검 결과</h2>{sections.map((section) => <div className="inspection-view-section" key={section}><h3>{section}</h3>{items.filter((item) => item.section === section).map((item) => <article key={item.name}><div><strong>{item.name}</strong><small>{item.purpose}</small></div>{item.kind === "check" && <span className={`inspection-result result-${item.result}`}>{pmOptions(item.name).find(([value]) => value === item.result)?.[1] ?? item.result}</span>}<dl>{item.fields.filter((field) => field.value).map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.type === "check" ? "시행" : field.type === "range" ? field.value.replace("~", " ~ ") : field.value}{field.type !== "check" && field.suffix}</dd></div>)}</dl>{item.comment && <p>{item.comment}</p>}</article>)}</div>)}</section>;
}

function pmOptions(name: string): Array<[string, string]> {
  for (const [, definitions] of PM_SECTIONS) {
    const found = definitions.find(([itemName]) => itemName === name);
    if (found?.[2]?.options) return found[2].options;
  }
  return [["pass", "적합"], ["fail", "부적합"], ["na", "N/A"]];
}

type AcrInput = [string, string, "text" | "check" | "calc"];
type AcrSection = { key: string; title: string; method: string[]; criteria: string; inputs: AcrInput[] };
export type AcrState = { overallResult: string; fields: Record<string, string>; pulse: Record<string, string[]> };

export const ACR_PULSE_ROWS = ["시상위치확인", "표준 T1", "표준 T2", "병원 T1", "병원 T2"];
export const ACR_PULSE_COLS = ["Seq", "TR", "TE", "FOV", "#slice", "두께", "Gap", "NEX", "Matrix"];
const ACR_PULSE_DEFAULT: Record<string, string[]> = {
  "시상위치확인": ["SE", "200", "20", "25", "1", "20", "N/A", "1", "256"],
  "표준 T1": ["SE", "500", "20", "25", "11", "5", "5", "1", "256"],
  "표준 T2": ["SE", "2000", "20/80", "25", "11", "5", "5", "1", "256"],
  "병원 T1": ["", "", "", "", "", "", "", "", ""], "병원 T2": ["", "", "", "", "", "", "", "", ""],
};

export const ACR_SECTIONS: AcrSection[] = [
  { key: "sag0", title: "0. 시상 위치확인 영상", method: ["시상위치확인 영상에서 표준 T1·T2 촬영 조건으로 각각 Save Screen합니다."], criteria: "T1·T2 두 영상 모두 저장하면 합격", inputs: [["img1", "[1] Sag Local T1 저장", "check"], ["img2", "[2] Sag Local T2 저장", "check"]] },
  { key: "geo", title: "1. 기하학적 정확도", method: ["팬텀 경계가 가장 뚜렷한 상태에서 시상과 표준 T1 #5의 길이를 측정합니다."], criteria: "시상 148±2mm · T1 #5 가로세로/대각선 190±2mm", inputs: [["geoval", "Window level 측정값", "text"], ["geoww", "WW", "calc"], ["geowl", "WL(절반)", "calc"], ["sag", "시상 상하 길이(mm)", "text"], ["img3", "[3] 시상 영상 저장", "check"], ["axc", "T1 #5 가로세로(mm)", "text"], ["img4", "[4] 가로세로 영상 저장", "check"], ["axd", "T1 #5 대각선(mm)", "text"], ["img5", "[5] 대각선 영상 저장", "check"]] },
  { key: "hcsr", title: "2. 공간분해능", method: ["표준·병원 T1/T2 #1의 1.0mm hole array가 구별되는지 확인합니다."], criteria: "UL·LR 모두 1.0mm 이하 구별", inputs: Array.from({ length: 8 }, (_, index) => [`img${index + 6}`, `[${index + 6}] 측정영상 저장`, "check"] as AcrInput) },
  { key: "sta", title: "3. 절편 두께 정확도", method: ["상·하 ROI 평균과 ramp 길이를 입력하면 절편 두께를 자동 계산합니다."], criteria: "표준 T1·T2 절편두께 4.3~5.7mm", inputs: [["t1rtop", "T1 상부 ROI", "text"], ["t1rbot", "T1 하부 ROI", "text"], ["t1wl", "T1 WL 평균", "calc"], ["img14", "[14] T1 ROI 영상", "check"], ["t1top", "T1 상부 ramp(mm)", "text"], ["t1bot", "T1 하부 ramp(mm)", "text"], ["t1thk", "T1 절편두께(mm)", "calc"], ["img15", "[15] T1 ramp 영상", "check"], ["t2rtop", "T2 상부 ROI", "text"], ["t2rbot", "T2 하부 ROI", "text"], ["t2wl", "T2 WL 평균", "calc"], ["img16", "[16] T2 ROI 영상", "check"], ["t2top", "T2 상부 ramp(mm)", "text"], ["t2bot", "T2 하부 ramp(mm)", "text"], ["t2thk", "T2 절편두께(mm)", "calc"], ["img17", "[17] T2 ramp 영상", "check"]] },
  { key: "spa", title: "4. 절편 위치 정확도", method: ["표준 T1·T2 #1과 #11의 수직막대 길이 차이를 측정합니다."], criteria: "4개 측정값 모두 5mm 이하", inputs: [["t1peak", "T1 #1 최대 신호", "text"], ["t1peakhalf", "T1 WL 절반", "calc"], ["t1s1", "T1 #1 길이차(mm)", "text"], ["img18", "[18] T1 #1 저장", "check"], ["t1s11", "T1 #11 길이차(mm)", "text"], ["img19", "[19] T1 #11 저장", "check"], ["t2peak", "T2 #1 최대 신호", "text"], ["t2peakhalf", "T2 WL 절반", "calc"], ["t2s1", "T2 #1 길이차(mm)", "text"], ["img20", "[20] T2 #1 저장", "check"], ["t2s11", "T2 #11 길이차(mm)", "text"], ["img21", "[21] T2 #11 저장", "check"]] },
  { key: "piu", title: "5. 영상 강도 균일성(PIU)", method: ["T1·T2의 low/high 평균신호를 입력하면 PIU를 자동 계산합니다."], criteria: "1.5T 87.5% 이상 · 3.0T 82% 이상", inputs: [["siglarge", "내부 평균 신호강도", "text"], ["sighalf", "절반값", "calc"], ["img22", "[22] Large ROI 저장", "check"], ["t1low", "T1 low", "text"], ["t1high", "T1 high", "text"], ["t1piu", "T1 PIU(%)", "calc"], ["img23", "[23] T1 최소신호 저장", "check"], ["img24", "[24] T1 최대신호 저장", "check"], ["t2low", "T2 low", "text"], ["t2high", "T2 high", "text"], ["t2piu", "T2 PIU(%)", "calc"], ["img25", "[25] T2 최소신호 저장", "check"], ["img26", "[26] T2 최대신호 저장", "check"]] },
  { key: "psg", title: "6. 고스트 신호 백분율", method: ["Large ROI와 상·하·좌·우 ROI 평균신호를 입력합니다."], criteria: "고스트 비율 2.5% 이하", inputs: [["large", "Large ROI", "text"], ["top", "상단 ROI", "text"], ["bot", "하단 ROI", "text"], ["left", "좌측 ROI", "text"], ["right", "우측 ROI", "text"], ["ratio", "고스트 비율(%)", "calc"], ["img27", "[27] 상/하 영상 저장", "check"], ["img28", "[28] 좌/우 영상 저장", "check"]] },
  { key: "lcod", title: "7. 대조도 분해능", method: ["표준·병원 T1/T2 #8~#11 영상을 순서대로 확인합니다."], criteria: "3.0T 미만 9 · 3.0T 37 바퀴살 이상", inputs: Array.from({ length: 16 }, (_, index) => [`img${index + 29}`, `[${index + 29}] 측정영상 저장`, "check"] as AcrInput) },
];

export function createAcrState(): AcrState {
  const fields: Record<string, string> = {};
  for (const section of ACR_SECTIONS) {
    fields[`${section.key}.eval`] = "";
    for (const [key] of section.inputs) fields[`${section.key}.${key}`] = "";
  }
  return { overallResult: "", fields, pulse: Object.fromEntries(ACR_PULSE_ROWS.map((row) => [row, [...ACR_PULSE_DEFAULT[row]]])) };
}

export function hydrateAcr(payload: unknown): AcrState {
  const state = createAcrState();
  const raw = payload as { overallResult?: unknown; fields?: Array<Record<string, unknown>>; pulseValues?: Array<Record<string, unknown>> } | null;
  state.overallResult = String(raw?.overallResult ?? "");
  for (const field of raw?.fields ?? []) state.fields[`${field.section_key}.${field.field_key}`] = String(field.value_text ?? "");
  for (const pulse of raw?.pulseValues ?? []) {
    const row = String(pulse.sequence_name); const index = Number(pulse.value_order) - 1;
    if (state.pulse[row] && index >= 0 && index < ACR_PULSE_COLS.length) state.pulse[row][index] = String(pulse.value_text ?? "");
  }
  return state;
}

export function serializeAcr(state: AcrState) {
  return {
    overallResult: state.overallResult,
    fields: Object.entries(state.fields).map(([path, value]) => { const dot = path.indexOf("."); return { sectionKey: path.slice(0, dot), fieldKey: path.slice(dot + 1), value }; }),
    pulseValues: ACR_PULSE_ROWS.flatMap((row) => state.pulse[row].map((value, index) => ({ sequenceName: row, valueOrder: index + 1, value }))),
  };
}

export function AcrInspectionEditor({ value, onChange, tesla }: { value: AcrState; onChange: (value: AcrState) => void; tesla?: string }) {
  const threshold = Number.parseFloat(tesla ?? "") >= 3 ? 82 : 87.5;
  const manualSections = useRef(new Set<string>());
  const manualOverall = useRef(false);
  const setField = (section: string, key: string, next: string) => {
    const fields = { ...value.fields, [`${section}.${key}`]: next };
    const definition = ACR_SECTIONS.find((item) => item.key === section);
    if (key === "eval") {
      manualSections.current.add(section);
      if (definition?.inputs.every((candidate) => candidate[2] === "check") && (next === "pass" || next === "fail")) {
        for (const [fieldKey] of definition.inputs) fields[`${section}.${fieldKey}`] = next === "pass" ? "Y" : "";
      }
      onChange({ ...value, fields, overallResult: manualOverall.current ? value.overallResult : overallEvaluation(fields) });
      return;
    }
    for (const candidate of definition?.inputs ?? []) {
      if (candidate[2] === "calc") fields[`${section}.${candidate[0]}`] = calculateAcr(section, candidate[0], fields);
    }
    if (!manualSections.current.has(section)) fields[`${section}.eval`] = autoEvaluate(section, fields, threshold);
    onChange({ ...value, fields, overallResult: manualOverall.current ? value.overallResult : overallEvaluation(fields) });
  };
  return <div className="inspection-editor acr-editor">
    <header><span className="inspection-icon"><FlaskConical /></span><div><b>ACR 자기공명영상 팬텀검사</b><small>측정값 자동 계산 및 합격 기준 표시</small></div><select value={value.overallResult} onChange={(event) => { manualOverall.current = true; onChange({ ...value, overallResult: event.target.value }); }}><option value="">종합판정 미정</option><option value="pass">합격</option><option value="fail">불합격</option><option value="na">해당없음</option></select></header>
    <details className="inspection-section" open><summary>촬영 Pulse Sequence<span>5개 시퀀스</span></summary><div className="acr-pulse-wrap"><table><thead><tr><th>구분</th>{ACR_PULSE_COLS.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{ACR_PULSE_ROWS.map((row) => <tr key={row}><th>{row}</th>{value.pulse[row].map((cell, index) => <td key={index}><input value={cell} onChange={(event) => onChange({ ...value, pulse: { ...value.pulse, [row]: value.pulse[row].map((old, current) => current === index ? event.target.value : old) } })} /></td>)}</tr>)}</tbody></table></div></details>
    {ACR_SECTIONS.map((section) => { const evaluation = value.fields[`${section.key}.eval`]; return <details className="inspection-section" key={section.key}>
      <summary>{section.title}<span className={`acr-eval eval-${evaluation || "empty"}`}>{evaluation === "pass" ? "합격" : evaluation === "fail" ? "불합격" : "미판정"}</span></summary>
      <div className="acr-guide"><p>{section.method.join(" ")}</p><strong>{section.criteria}</strong></div>
      <div className="inspection-field-grid acr-fields">{section.inputs.map(([key, label, type]) => type === "check" ? <label className="acr-check" key={key}><input type="checkbox" checked={value.fields[`${section.key}.${key}`] === "Y"} onChange={(event) => setField(section.key, key, event.target.checked ? "Y" : "")} /><span><CheckCircle2 />{label}</span></label> : <label key={key}><span>{label}</span><div><input inputMode="decimal" readOnly={type === "calc"} className={type === "calc" ? "calculated" : ""} value={value.fields[`${section.key}.${key}`] ?? ""} onChange={(event) => setField(section.key, key, event.target.value)} /></div></label>)}</div>
      <label className="acr-manual-eval"><span>판정 직접 지정</span><select value={evaluation} onChange={(event) => setField(section.key, "eval", event.target.value)}><option value="">자동/미정</option><option value="pass">합격</option><option value="fail">불합격</option><option value="na">해당없음</option></select></label>
    </details>; })}
  </div>;
}

export function AcrInspectionView({ payload }: { payload: unknown }) {
  const state = hydrateAcr(payload);
  const raw = payload as { fields?: unknown[] } | null;
  if (!raw?.fields?.length) return null;
  return <section className="repair-panel inspection-view acr-view"><h2><FlaskConical /> ACR 정밀검사 결과 <span className={`acr-eval eval-${state.overallResult || "empty"}`}>{evalLabel(state.overallResult)}</span></h2>
    <div className="acr-pulse-wrap"><table><thead><tr><th>구분</th>{ACR_PULSE_COLS.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{ACR_PULSE_ROWS.map((row) => <tr key={row}><th>{row}</th>{state.pulse[row].map((cell, index) => <td key={index}>{cell || "—"}</td>)}</tr>)}</tbody></table></div>
    {ACR_SECTIONS.map((section) => { const values = section.inputs.filter(([key]) => state.fields[`${section.key}.${key}`]); if (!values.length && !state.fields[`${section.key}.eval`]) return null; return <div className="inspection-view-section" key={section.key}><h3>{section.title}<span className={`acr-eval eval-${state.fields[`${section.key}.eval`] || "empty"}`}>{evalLabel(state.fields[`${section.key}.eval`])}</span></h3><dl>{values.map(([key,label,type]) => <div key={key}><dt>{label}</dt><dd>{type === "check" ? "확인" : state.fields[`${section.key}.${key}`]}</dd></div>)}</dl></div>; })}
  </section>;
}

function evalLabel(value: string) { return value === "pass" ? "합격" : value === "fail" ? "불합격" : value === "na" ? "해당없음" : "미판정"; }

function number(fields: Record<string, string>, section: string, key: string) { const parsed = Number.parseFloat(fields[`${section}.${key}`]); return Number.isFinite(parsed) ? parsed : null; }
function calculateAcr(section: string, key: string, fields: Record<string, string>) {
  const n = (name: string) => number(fields, section, name);
  if (section === "geo" && (key === "geoww" || key === "geowl")) { const v = n("geoval"); return v == null ? "" : key === "geoww" ? String(v) : (v / 2).toFixed(1); }
  if (section === "sta" && (key === "t1wl" || key === "t2wl")) { const prefix = key.slice(0, 2); const top = n(`${prefix}rtop`), bottom = n(`${prefix}rbot`); return top == null || bottom == null ? "" : ((top + bottom) / 2).toFixed(1); }
  if (section === "sta" && (key === "t1thk" || key === "t2thk")) { const prefix = key.slice(0, 2); const top = n(`${prefix}top`), bottom = n(`${prefix}bot`); return top == null || bottom == null || top + bottom === 0 ? "" : (0.2 * top * bottom / (top + bottom)).toFixed(2); }
  if (section === "spa" && key.endsWith("peakhalf")) { const peak = n(key.startsWith("t1") ? "t1peak" : "t2peak"); return peak == null ? "" : (peak / 2).toFixed(1); }
  if (section === "piu" && key === "sighalf") { const signal = n("siglarge"); return signal == null ? "" : (signal / 2).toFixed(1); }
  if (section === "piu" && (key === "t1piu" || key === "t2piu")) { const prefix = key.slice(0, 2); const low = n(`${prefix}low`), high = n(`${prefix}high`); return low == null || high == null || high + low === 0 ? "" : (100 * (1 - (high - low) / (high + low))).toFixed(2); }
  if (section === "psg" && key === "ratio") { const large = n("large"), top = n("top"), bottom = n("bot"), left = n("left"), right = n("right"); return [large, top, bottom, left, right].some((item) => item == null) || large === 0 ? "" : (Math.abs(((top! + bottom!) - (left! + right!)) / (2 * large!)) * 100).toFixed(2); }
  return "";
}
function autoEvaluate(section: string, fields: Record<string, string>, piuThreshold: number) {
  const n = (key: string) => number(fields, section, key); const checked = (key: string) => fields[`${section}.${key}`] === "Y";
  if (section === "sag0") return checked("img1") && checked("img2") ? "pass" : "";
  if (section === "geo") { const values = [[n("sag"), 148], [n("axc"), 190], [n("axd"), 190]] as const; const entered = values.filter(([value]) => value != null); return !entered.length ? "" : entered.every(([value, target]) => Math.abs(value! - target) <= 2) ? "pass" : "fail"; }
  if (section === "hcsr") return Array.from({ length: 8 }, (_, index) => checked(`img${index + 6}`)).every(Boolean) ? "pass" : "";
  if (section === "sta") { const values = [n("t1thk"), n("t2thk")].filter((item): item is number => item != null); return !values.length ? "" : values.every((item) => Math.abs(item - 5) <= 0.7) ? "pass" : "fail"; }
  if (section === "spa") { const values = [n("t1s1"), n("t1s11"), n("t2s1"), n("t2s11")].filter((item): item is number => item != null); return !values.length ? "" : values.every((item) => item <= 5) ? "pass" : "fail"; }
  if (section === "piu") { const values = [n("t1piu"), n("t2piu")].filter((item): item is number => item != null); return !values.length ? "" : values.every((item) => item >= piuThreshold) ? "pass" : "fail"; }
  if (section === "psg") { const ratio = n("ratio"); return ratio == null ? "" : ratio <= 2.5 ? "pass" : "fail"; }
  if (section === "lcod") return Array.from({ length: 16 }, (_, index) => checked(`img${index + 29}`)).every(Boolean) ? "pass" : "";
  return "";
}
function overallEvaluation(fields: Record<string, string>) {
  const evaluations = ACR_SECTIONS.map((section) => fields[`${section.key}.eval`]).filter((value) => value === "pass" || value === "fail");
  return evaluations.length ? evaluations.every((value) => value === "pass") ? "pass" : "fail" : "";
}
