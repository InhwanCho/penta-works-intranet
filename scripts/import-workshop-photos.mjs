// Firestore 백업의 사무실 수리 사진을 원본 복제 없이 DB blob으로 이관할 SQL 생성.
// node scripts/import-workshop-photos.mjs BACKUP_JSON OUTPUT_SQL
import {readFile,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
if (!process.argv[2] || !process.argv[3]) throw new Error('백업 JSON 경로와 출력 SQL 경로가 필요합니다.');
const source=await readFile(new URL('./migrate-firestore.mjs',import.meta.url),'utf8');
const context=vm.createContext({Buffer,Intl,Date});
vm.runInContext(source.slice(source.indexOf('function decodeDocument')),context);
const backup=JSON.parse(await readFile(process.argv[2],'utf8'));
const statements=["SET NAMES utf8mb4;","START TRANSACTION;"];
let count=0;
for (const document of backup.collections.photos ?? []) {
 const row=context.decodeDocument(document);
 const sql=context.photoSql(row);
 if (!sql) continue;
 // source_system/source_id가 일치하는 사무실 수리 사진만 INSERT된다.
 statements.push(sql.replace('INSERT INTO service_photos(', 'INSERT INTO workshop_repair_photos(').replace('FROM repair_requests r WHERE', 'FROM workshop_repairs r WHERE'));
 count++;
}
statements.push('COMMIT;');
await writeFile(process.argv[3],statements.join('\n\n')+'\n',{mode:0o600});
process.stdout.write(`사진 후보 ${count}건의 SQL 생성. 사무실 수리 기록에 대응하는 사진만 적용합니다.\n`);
