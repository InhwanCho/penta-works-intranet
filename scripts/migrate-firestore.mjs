import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "pentaservice-3de4c";
const apiKey = process.env.FIREBASE_API_KEY;
const legacyPasswordHash = process.env.LEGACY_PASSWORD_HASH;
const outputDir = resolve(process.argv[2] ?? "migration-output/latest");
const collections = ["hospitals", "logs", "photos", "prep", "schedule"];

if (!apiKey) throw new Error("FIREBASE_API_KEY가 필요합니다.");
if (!legacyPasswordHash) throw new Error("LEGACY_PASSWORD_HASH가 필요합니다.");

const raw = {};
for (const name of collections) raw[name] = await fetchCollection(name);
const decoded = Object.fromEntries(collections.map((name) => [name, raw[name].map(decodeDocument)]));
const report = validate(decoded);
const sqlText = buildSql(decoded);

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "firestore-backup.json"), JSON.stringify({ projectId, database: "(default)", fetchedAt: new Date().toISOString(), collections: raw }, null, 2));
await writeFile(resolve(outputDir, "migration-report.json"), JSON.stringify(report, null, 2));
await writeFile(resolve(outputDir, "migrate.sql"), sqlText);
process.stdout.write(`${JSON.stringify(report, null, 2)}\noutput=${outputDir}\n`);

async function fetchCollection(collection) {
  const documents = [];
  let pageToken = "";
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}`);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url);
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`${collection} 조회 실패: HTTP ${response.status}`);
    const body = await response.json();
    documents.push(...(body.documents ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return documents;
}

function decodeDocument(document) {
  return { id: document.name.split("/").at(-1), createTime: document.createTime, updateTime: document.updateTime, ...decodeFields(document.fields ?? {}) };
}
function decodeFields(fields) { return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)])); }
function decodeValue(value) {
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("bytesValue" in value) return value.bytesValue;
  if ("referenceValue" in value) return value.referenceValue;
  if ("geoPointValue" in value) return value.geoPointValue;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields ?? {});
  return null;
}

function validate(data) {
  const hospitalIds = new Set(data.hospitals.map((row) => row.id));
  const logIds = new Set(data.logs.map((row) => row.id));
  return {
    projectId,
    database: "(default)",
    counts: Object.fromEntries(collections.map((name) => [name, data[name].length])),
    deletedLogs: data.logs.filter((row) => row.deleted).length,
    photoBytes: data.photos.reduce((sum, row) => sum + dataUriBytes(row.dataUri), 0),
    orphanLogs: data.logs.filter((row) => row.hospitalId && !hospitalIds.has(row.hospitalId)).map((row) => row.id),
    orphanPhotos: data.photos.filter((row) => row.logId && !logIds.has(row.logId)).map((row) => row.id),
    orphanPrep: data.prep.filter((row) => row.hospitalId && !hospitalIds.has(row.hospitalId)).map((row) => row.id),
    orphanSchedule: data.schedule.filter((row) => row.hospitalId && !hospitalIds.has(row.hospitalId)).map((row) => row.id),
  };
}

function buildSql(data) {
  const statements = [
    "SET NAMES utf8mb4;",
    "SET time_zone = '+09:00';",
    "START TRANSACTION;",
    `INSERT INTO users(login_id,password_hash,name,role,active) VALUES('root',${sql(legacyPasswordHash)},'root','USER',TRUE),('sdc',${sql(legacyPasswordHash)},'sdc','USER',TRUE) ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash),name=VALUES(name),role=VALUES(role),active=TRUE;`,
    "SET @import_user_id = (SELECT id FROM users WHERE login_id='sdc' LIMIT 1);",
    "SET @import_user_id = COALESCE(@import_user_id,(SELECT id FROM users WHERE active=TRUE ORDER BY id LIMIT 1));",
  ];
  for (const row of data.hospitals) statements.push(hospitalSql(row));
  for (const row of data.hospitals) {
    statements.push(contactResetSql(row));
    (row.contacts ?? []).forEach((contact, index) => statements.push(contactSql(row, contact, index)));
  }
  for (const row of data.hospitals) (row.systems ?? []).forEach((system, index) => statements.push(equipmentSql(row, system, index)));
  for (const row of data.logs) statements.push(logSql(row));
  for (const row of data.logs) statements.push(historySql(row));
  for (const row of data.logs) statements.push(...pmSql(row), ...acrSql(row));
  for (const row of data.photos) { const query = photoSql(row); if (query) statements.push(query); }
  for (const row of data.prep) statements.push(prepSql(row));
  for (const row of data.schedule) statements.push(scheduleSql(row));
  statements.push("UPDATE repair_status_history h JOIN repair_requests r ON r.id=h.repair_id SET h.new_status=r.status,h.changed_by=@import_user_id WHERE r.source_system='firebase' AND h.memo='Firebase 이관';");
  statements.push("COMMIT;");
  return `${statements.join("\n\n")}\n`;
}

function hospitalSql(row) {
  return `INSERT INTO service_hospitals(source_system,source_id,code,name,region,address,notes,pm_interval_months,pm_override,acr_full_override,acr_doc_override,source_created_at,source_updated_at)
VALUES('firebase',${sql(row.id)},${sql(blank(row.code))},${sql(row.name || row.hospitalName || row.id)},${sql(blank(row.region))},${sql(blank(row.address))},${sql(blank(row.notes))},${sql(Number(row.pmIntervalMonths) || 6)},${sqlDate(row.pmOverride)},${sqlDate(row.acrFullOverride)},${sqlDate(row.acrDocOverride)},${sqlDateTime(row.createdAt || row.createTime)},${sqlDateTime(row.updatedAt || row.updateTime)})
ON DUPLICATE KEY UPDATE code=VALUES(code),name=VALUES(name),region=VALUES(region),address=VALUES(address),notes=VALUES(notes),pm_interval_months=VALUES(pm_interval_months),pm_override=VALUES(pm_override),acr_full_override=VALUES(acr_full_override),acr_doc_override=VALUES(acr_doc_override),source_created_at=VALUES(source_created_at),source_updated_at=VALUES(source_updated_at);`;
}

function contactResetSql(hospital) {
  return `UPDATE service_hospital_contacts c JOIN service_hospitals h ON h.id=c.hospital_id SET c.deleted_at=CURRENT_TIMESTAMP(6) WHERE h.source_system='firebase' AND h.source_id=${sql(hospital.id)};`;
}

function contactSql(hospital, row, index) {
  return `INSERT INTO service_hospital_contacts(hospital_id,sort_order,name,phone,deleted_at)
SELECT h.id,${index + 1},${sql(blank(row.name))},${sql(blank(row.phone))},NULL FROM service_hospitals h WHERE h.source_system='firebase' AND h.source_id=${sql(hospital.id)}
ON DUPLICATE KEY UPDATE name=VALUES(name),phone=VALUES(phone),deleted_at=NULL;`;
}

function equipmentSql(hospital, row, index) {
  return `INSERT INTO service_equipment(hospital_id,source_system,source_id,equipment_type,manufacturer,model,serial_number,magnetic_field_tesla,software_version,installed_at,status,deleted_at)
SELECT h.id,'firebase',${sql(`${hospital.id}:system:${index + 1}`)},'MRI',${sql(blank(row.vendor))},${sql(blank(row.model))},${sql(blank(row.serial))},${sql(blank(row.tesla))},${sql(blank(row.swVersion))},${sqlDate(row.installDate)},'ACTIVE',NULL FROM service_hospitals h WHERE h.source_system='firebase' AND h.source_id=${sql(hospital.id)}
ON DUPLICATE KEY UPDATE hospital_id=VALUES(hospital_id),manufacturer=VALUES(manufacturer),model=VALUES(model),serial_number=VALUES(serial_number),magnetic_field_tesla=VALUES(magnetic_field_tesla),software_version=VALUES(software_version),installed_at=VALUES(installed_at),status='ACTIVE',deleted_at=NULL;`;
}

function logSql(row) {
  const description = blank(row.description) || blank(row.symptom) || blank(row.title) || "Firebase에서 이관된 서비스 기록";
  const equipment = blank(row.title) || blank(row.systemModel) || serviceLabel(row.type);
  const deletedAt = row.deleted ? sqlDateTime(row.deletedAt || row.updatedAt || row.updateTime) : "NULL";
  return `INSERT INTO repair_requests(hospital_id,source_system,source_id,source_payload,equipment_name,description_markdown,written_at,hospital_name,model_name,service_type,service_title,engineer_name,symptom,contract_type,work_date,work_start_time,work_end_time,special_notes,parts_details,remarks,follow_up,he_level,counts_as_pm,coldhead_position,coldhead_serial,coldhead_in_date,source_deleted_at,status,requester_id,deleted_at)
VALUES((SELECT id FROM service_hospitals WHERE source_system='firebase' AND source_id=${sql(row.hospitalId)}),'firebase',${sql(row.id)},${sqlJson(row)},${sql(equipment)},${sql(description)},${sqlDate(row.date || row.createdAt || row.createTime)},${sql(blank(row.hospitalName))},${sql(blank(row.systemModel))},${sql(normalizeServiceType(row.type))},${sql(blank(row.title))},${sql(blank(row.engineer))},${sql(blank(row.symptom))},${sql(blank(row.contractType))},${sqlDate(row.date)},${sqlTime(row.workStart)},${sqlTime(row.workEnd)},${sql(blank(row.specialNotes))},${sql(blank(row.parts))},${sql(blank(row.remarks))},${sql(blank(row.followUp))},${sql(blank(row.heLevel))},${sql(Boolean(row.countsAsPm))},${sql(blank(row.coldheadPos))},${sql(blank(row.coldheadSerial))},${sqlDate(row.coldheadInDate)},${deletedAt},${sql(normalizeRepairStatus(row.status))},@import_user_id,${deletedAt})
ON DUPLICATE KEY UPDATE hospital_id=VALUES(hospital_id),source_payload=VALUES(source_payload),equipment_name=VALUES(equipment_name),description_markdown=VALUES(description_markdown),written_at=VALUES(written_at),hospital_name=VALUES(hospital_name),model_name=VALUES(model_name),service_type=VALUES(service_type),service_title=VALUES(service_title),engineer_name=VALUES(engineer_name),symptom=VALUES(symptom),contract_type=VALUES(contract_type),work_date=VALUES(work_date),work_start_time=VALUES(work_start_time),work_end_time=VALUES(work_end_time),special_notes=VALUES(special_notes),parts_details=VALUES(parts_details),remarks=VALUES(remarks),follow_up=VALUES(follow_up),he_level=VALUES(he_level),counts_as_pm=VALUES(counts_as_pm),coldhead_position=VALUES(coldhead_position),coldhead_serial=VALUES(coldhead_serial),coldhead_in_date=VALUES(coldhead_in_date),source_deleted_at=VALUES(source_deleted_at),status=VALUES(status),requester_id=VALUES(requester_id),deleted_at=VALUES(deleted_at);`;
}

function pmSql(row) {
  if (!Array.isArray(row.pm) || row.pm.length === 0) return [];
  const inspection = `(SELECT p.id FROM service_pm_inspections p JOIN repair_requests r ON r.id=p.repair_id WHERE r.source_system='firebase' AND r.source_id=${sql(row.id)})`;
  const statements = [
    `INSERT INTO service_pm_inspections(repair_id,checklist_version) SELECT r.id,'firebase-v1' FROM repair_requests r WHERE r.source_system='firebase' AND r.source_id=${sql(row.id)} ON DUPLICATE KEY UPDATE checklist_version='firebase-v1';`,
    `DELETE FROM service_pm_items WHERE inspection_id=${inspection};`,
  ];
  row.pm.forEach((item, itemIndex) => {
    statements.push(`INSERT INTO service_pm_items(inspection_id,item_order,section_name,item_kind,item_name,purpose,result,comment) VALUES(${inspection},${itemIndex + 1},${sql(blank(item.section))},${sql(blank(item.kind))},${sql(blank(item.name))},${sql(blank(item.purpose))},${sql(blank(item.result))},${sql(blank(item.comment))});`);
    (Array.isArray(item.fields) ? item.fields : []).forEach((field, fieldIndex) => {
      statements.push(`INSERT INTO service_pm_item_fields(item_id,field_order,label,value_text,input_type,suffix) VALUES((SELECT id FROM service_pm_items WHERE inspection_id=${inspection} AND item_order=${itemIndex + 1}),${fieldIndex + 1},${sql(blank(field.label))},${sql(blank(field.value))},${sql(blank(field.type))},${sql(blank(field.suffix))});`);
    });
  });
  return statements;
}

function acrSql(row) {
  if (!row.acrFull || typeof row.acrFull !== 'object' || Array.isArray(row.acrFull)) return [];
  const inspection = `(SELECT a.id FROM service_acr_inspections a JOIN repair_requests r ON r.id=a.repair_id WHERE r.source_system='firebase' AND r.source_id=${sql(row.id)})`;
  const statements = [
    `INSERT INTO service_acr_inspections(repair_id,overall_result) SELECT r.id,${sql(blank(row.acrFull.overall))} FROM repair_requests r WHERE r.source_system='firebase' AND r.source_id=${sql(row.id)} ON DUPLICATE KEY UPDATE overall_result=VALUES(overall_result);`,
    `DELETE FROM service_acr_fields WHERE inspection_id=${inspection};`,
    `DELETE FROM service_acr_pulse_values WHERE inspection_id=${inspection};`,
  ];
  for (const [section, fields] of Object.entries(row.acrFull)) {
    if (section === 'overall' || section === 'pulse' || !fields || typeof fields !== 'object' || Array.isArray(fields)) continue;
    for (const [field, value] of Object.entries(fields)) {
      statements.push(`INSERT INTO service_acr_fields(inspection_id,section_key,field_key,value_text) VALUES(${inspection},${sql(section)},${sql(field)},${sql(value == null ? null : String(value))});`);
    }
  }
  const pulse = row.acrFull.pulse;
  if (pulse && typeof pulse === 'object' && !Array.isArray(pulse)) {
    for (const [sequence, values] of Object.entries(pulse)) {
      (Array.isArray(values) ? values : []).forEach((value, index) => {
        statements.push(`INSERT INTO service_acr_pulse_values(inspection_id,sequence_name,value_order,value_text) VALUES(${inspection},${sql(sequence)},${index + 1},${sql(value == null ? null : String(value))});`);
      });
    }
  }
  return statements;
}
function historySql(row) {
  return `INSERT INTO repair_status_history(repair_id,new_status,changed_by,memo)
SELECT r.id,${sql(normalizeRepairStatus(row.status))},@import_user_id,'Firebase 이관' FROM repair_requests r
WHERE r.source_system='firebase' AND r.source_id=${sql(row.id)} AND NOT EXISTS(SELECT 1 FROM repair_status_history h WHERE h.repair_id=r.id);`;
}
function photoSql(row) {
  const match = String(row.dataUri ?? "").match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match || !row.logId) return null;
  return `INSERT INTO service_photos(repair_id,source_system,source_id,original_name,mime_type,image_data,width_px,height_px,source_created_at)
SELECT r.id,'firebase',${sql(row.id)},${sql(blank(row.name))},${sql(match[1])},FROM_BASE64(${sql(match[2])}),${sql(numberOrNull(row.w))},${sql(numberOrNull(row.h))},${sqlDateTime(row.createdAt || row.createTime)} FROM repair_requests r WHERE r.source_system='firebase' AND r.source_id=${sql(row.logId)}
ON DUPLICATE KEY UPDATE repair_id=VALUES(repair_id),original_name=VALUES(original_name),mime_type=VALUES(mime_type),image_data=VALUES(image_data),width_px=VALUES(width_px),height_px=VALUES(height_px),source_created_at=VALUES(source_created_at);`;
}
function prepSql(row) {
  return `INSERT INTO service_prep_items(hospital_id,source_system,source_id,text,done,done_at,source_created_at)
SELECT h.id,'firebase',${sql(row.id)},${sql(row.text || "준비물")},${sql(Boolean(row.done))},${sqlDateTime(row.doneAt)},${sqlDateTime(row.createdAt || row.createTime)} FROM service_hospitals h WHERE h.source_system='firebase' AND h.source_id=${sql(row.hospitalId)}
ON DUPLICATE KEY UPDATE hospital_id=VALUES(hospital_id),text=VALUES(text),done=VALUES(done),done_at=VALUES(done_at),source_created_at=VALUES(source_created_at);`;
}
function scheduleSql(row) {
  return `INSERT INTO service_schedules(hospital_id,source_system,source_id,scheduled_date,service_type,note,created_by,source_created_at)
SELECT h.id,'firebase',${sql(row.id)},${sqlDate(row.date)},${sql(normalizeServiceType(row.type))},${sql(blank(row.note))},@import_user_id,${sqlDateTime(row.createdAt || row.createTime)} FROM service_hospitals h WHERE h.source_system='firebase' AND h.source_id=${sql(row.hospitalId)}
ON DUPLICATE KEY UPDATE hospital_id=VALUES(hospital_id),scheduled_date=VALUES(scheduled_date),service_type=VALUES(service_type),note=VALUES(note),source_created_at=VALUES(source_created_at);`;
}

function normalizeServiceType(value) { const type = String(value ?? "ETC").toUpperCase(); return ["PM", "REPAIR", "COLDHEAD", "ACR", "CALL", "INSTALL", "ETC"].includes(type) ? type : "ETC"; }
function normalizeRepairStatus(value) { return ["progress", "revisit"].includes(String(value ?? "").toLowerCase()) ? "IN_PROGRESS" : "COMPLETED"; }
function serviceLabel(value) { return ({ PM: "정기점검", REPAIR: "고장수리", COLDHEAD: "Cold Head", ACR: "ACR", CALL: "Call", INSTALL: "설치", ETC: "기타" })[normalizeServiceType(value)]; }
function blank(value) { return value == null || String(value).trim() === "" ? null : String(value).trim(); }
function numberOrNull(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function dataUriBytes(value) { const match = String(value ?? "").match(/;base64,(.+)$/s); return match ? Buffer.from(match[1], "base64").length : 0; }
function sqlJson(value) { return value == null ? "NULL" : sql(JSON.stringify(value)); }
function sqlDate(value) { const text = blank(value); if (!text) return "NULL"; const match = text.match(/^\d{4}-\d{2}-\d{2}/); return match ? sql(match[0]) : "NULL"; }
function sqlTime(value) { const text = blank(value); return text && /^\d{1,2}:\d{2}/.test(text) ? sql(text.slice(0, 5)) : "NULL"; }
function sqlDateTime(value) {
  const text = blank(value); if (!text) return "NULL";
  const date = new Date(text); if (Number.isNaN(date.getTime())) return "NULL";
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date);
  return sql(parts);
}
function sql(value) {
  if (value == null) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${String(value).replaceAll("\\", "\\\\").replaceAll("\0", "\\0").replaceAll("\n", "\\n").replaceAll("\r", "\\r").replaceAll("'", "''").replaceAll("\x1a", "\\Z")}'`;
}
