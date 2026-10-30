#!/usr/bin/env python3
"""Verify retirement on a disposable MariaDB database; never touches app DBs."""
import argparse
from pathlib import Path
import subprocess
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--socket', required=True)
parser.add_argument('--client', default='mariadb')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
db = 'retire_service_test_' + uuid.uuid4().hex
base = [args.client, '--no-defaults', '--socket=' + args.socket, '-u', 'root', '-N']

def sql(statement, use_db=True):
    result = subprocess.run(base + ([db] if use_db else []), input=statement,
                            text=True, capture_output=True)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()

try:
    sql(f'CREATE DATABASE {db} CHARACTER SET utf8mb4;', False)
    for path in sorted((root / 'database/init').glob('*.sql')):
        # Historical 003 drops columns already absent in today's 001 snapshot.
        if path.name.startswith(('003_', '019_')):
            continue
        sql(path.read_text())
    sql("""
      INSERT INTO users(id,login_id,password_hash,name) VALUES(900001,'retire-test','hash','테스트');
      INSERT INTO service_hospitals(id,name) VALUES(900001,'삭제할 병원');
      INSERT INTO service_equipment(id,hospital_id) VALUES(900001,900001);
      INSERT INTO accounting_counterparties(id,name,party_type,hospital_id)
        VALUES(900001,'보존할 회계 거래처','CUSTOMER',900001);
      INSERT INTO accounting_cards(id,issuer,card_num_masked,alias) VALUES(900001,'BC','****','보존 카드');
      INSERT INTO repair_requests(id,hospital_id,equipment_name,description_markdown,written_at,requester_id)
        VALUES(900001,900001,'삭제 장비','삭제 내용','2026-10-30',900001);
      INSERT INTO work_logs(id,title,content_markdown,work_date,author_id,source_repair_id)
        VALUES(900001,'삭제 일지','삭제 내용','2026-10-30',900001,900001);
      INSERT INTO workshop_repairs(id,equipment_name,description_markdown,work_date,author_id,source_repair_id)
        VALUES(900001,'삭제 수리','삭제 내용','2026-10-30',900001,900001);
      INSERT INTO workshop_repair_units(repair_id,unit_no,status) VALUES(900001,1,'RECEIVED');
      INSERT INTO service_photos(repair_id,mime_type,image_data) VALUES(900001,'image/png','binary');
      INSERT INTO workshop_repair_photos(repair_id,mime_type,image_data) VALUES(900001,'image/png','binary');
      INSERT INTO service_pm_inspections(repair_id) VALUES(900001);
      INSERT INTO service_acr_inspections(repair_id) VALUES(900001);
      INSERT INTO notices(id,title,content_markdown,author_id) VALUES(900001,'유지 공지','유지 내용',900001);
      INSERT INTO notifications(recipient_id,type,title,target_type,target_id) VALUES
        (900001,'TEST','삭제 알림','REPAIR',900001),(900001,'TEST','유지 알림','NOTICE',900001);
      INSERT INTO files(id,original_name,stored_name,storage_path,mime_type,file_size,uploaded_by)
        VALUES(900001,'shared.png','shared.png','/test/shared.png','image/png',1,900001);
      INSERT INTO file_links(file_id,target_type,target_id,usage_type)
        VALUES(900001,'REPAIR',900001,'ATTACHMENT'),(900001,'NOTICE',900001,'ATTACHMENT');
      INSERT INTO work_log_files(work_log_id,file_id) VALUES(900001,900001);
      INSERT INTO workshop_repair_files(repair_id,file_id) VALUES(900001,900001);
    """)
    migration = (root / 'database/init/019_retire_service_records.sql').read_text()
    sql(migration)
    sql(migration)  # Re-running a successful deployment must remain harmless.
    tables = ['service_hospitals', 'service_equipment', 'repair_requests', 'service_photos',
              'service_pm_inspections', 'service_acr_inspections', 'work_logs', 'work_log_files',
              'workshop_repairs', 'workshop_repair_units', 'workshop_repair_photos', 'workshop_repair_files']
    for table in tables:
        assert sql(f'SELECT COUNT(*) FROM {table}') == '0', table
    assert sql('SELECT COUNT(*) FROM accounting_counterparties WHERE id=900001 AND hospital_id IS NULL') == '1'
    for table in ['accounting_cards', 'notices', 'users', 'files']:
        assert sql(f'SELECT COUNT(*) FROM {table} WHERE id=900001') == '1', table
    assert sql("SELECT COUNT(*) FROM file_links WHERE target_type='NOTICE'") == '1'
    assert sql("SELECT COUNT(*) FROM file_links WHERE target_type='REPAIR'") == '0'
    assert sql("SELECT COUNT(*) FROM notifications WHERE target_type='NOTICE'") == '1'
    assert sql("SELECT COUNT(*) FROM notifications WHERE target_type='REPAIR'") == '0'
    print('PASS: retirement, cascading photos/inspections, accounting preservation, shared files and retry safety')
finally:
    sql(f'DROP DATABASE IF EXISTS {db}', False)
