#!/usr/bin/env python3
"""Integration checks against a disposable, local MariaDB 10.11 server.

Usage: python3 scripts/test-accounting-schema.py --client /path/to/mariadb --socket /tmp/test.sock
Creates and drops only its own randomly named test database. No production credentials.
"""
import argparse
import pathlib
import subprocess
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--client', required=True)
parser.add_argument('--socket', required=True)
parser.add_argument('--user', default='root')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
database = 'accounting_schema_test_' + uuid.uuid4().hex
base = [args.client, '--no-defaults', '--protocol=socket', '--socket=' + args.socket,
        '--user=' + args.user, '--batch', '--skip-column-names']
checks = 0


def sql(statement, db=True, error=None):
    result = subprocess.run(base + ([database] if db else []), input=statement,
                            text=True, capture_output=True, check=False)
    if error is not None:
        assert result.returncode != 0 and f'ERROR {error} ' in result.stderr, result.stderr
    else:
        assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def equal(statement, expected):
    global checks
    actual = sql(statement)
    assert actual == expected, (statement, actual, expected)
    checks += 1


def rejects(statement, code):
    global checks
    sql('START TRANSACTION;\n' + statement + '\nROLLBACK;', error=code)
    checks += 1


try:
    sql(f'CREATE DATABASE `{database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;', db=False)
    version = sql('SELECT VERSION();')
    assert version.startswith('10.11.') and 'MariaDB' in version, version
    # Use the actual prerequisite schemas, not synthetic FK stubs. Historical
    # migration 003 drops columns already absent from today's 001 snapshot.
    for name in ('001_schema.sql', '002_service_schema.sql', '013_accounting.sql', '014_accounting_import.sql', '015_sessions_sync_history.sql', '016_session_charset.sql'):
        sql((root / 'database/init' / name).read_text())
    sql((root / 'database/init/013_accounting.sql').read_text())
    sql((root / 'database/init/014_accounting_import.sql').read_text())
    equal("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND LEFT(table_name,11)='accounting_';", '17')
    equal("SELECT COUNT(*) FROM schema_migrations WHERE version='013_accounting';", '1')
    sql("""
        INSERT INTO users(id,login_id,password_hash,name,role) VALUES(900001,'schema-test','not-a-real-password','테스트','ACCOUNTING');
        INSERT INTO accounting_counterparties(id,name,party_type) VALUES(1,'테스트 거래처','VENDOR');
        INSERT INTO accounting_categories(id,code,name) VALUES(1,'TEST','테스트');
        INSERT INTO accounting_bank_accounts(id,bank_code,bank_name,account_num_encrypted,account_identity_hash,account_num_masked,alias)
        VALUES(1,'TEST','테스트','encrypted-test',REPEAT('a',64),'****','테스트 계좌');
        INSERT INTO accounting_bank_transactions(id,bank_account_id,trans_ref_key,trans_at,withdraw_amount,raw_payload)
        VALUES(1,1,'Ref001','2026-10-01 10:00:00',100,'{}');
        INSERT INTO accounting_cards(id,issuer,card_num_masked,alias) VALUES(1,'BC','****','테스트 BC'),(2,'HANA','****','테스트 하나');
        INSERT INTO accounting_card_transactions(id,card_id,source_event_key,approval_no,approval_date,time_precision,event_type,
          approval_amount,approval_cancel_amount,merchant_name,source_filename,raw_payload,imported_by)
        VALUES(1,1,REPEAT('a',64),'00123456','2026-10-01','SECOND','APPROVAL',150000,0,'가맹점','test.xlsx','{}',900001),
          (2,1,REPEAT('b',64),'00123456','2026-10-01','SECOND','CANCELLATION',-150000,0,'가맹점','test.xlsx','{}',900001),
          (3,2,REPEAT('a',64),'00123456','2026-10-01','MINUTE','SNAPSHOT',21000,-21000,'가맹점','test.xls','{}',900001);
        INSERT INTO accounting_ledger_entries(id,entry_group_key,line_no,entry_type,direction,title,entry_date,amount,status,created_by,updated_by)
        VALUES(1,'split-test',1,'EXPENSE','OUT','분할 A','2026-10-01',60,'CONFIRMED',900001,900001),
          (2,'split-test',2,'EXPENSE','OUT','분할 B','2026-10-01',40,'CONFIRMED',900001,900001);
        INSERT INTO accounting_payment_allocations(ledger_entry_id,bank_transaction_id,payment_method,allocated_amount,settled_at,status,idempotency_key,created_by)
        VALUES(1,1,'BANK',30,'2026-10-01','CONFIRMED','payment-a',900001),
          (1,1,'BANK',30,'2026-10-01','CONFIRMED','payment-b',900001),
          (2,1,'BANK',40,'2026-10-01','CONFIRMED','payment-c',900001);
        INSERT INTO accounting_payroll_runs(id,payroll_month,run_type,title,created_by)
        VALUES(1,'2026-10-01','REGULAR','테스트 급여',900001);
        INSERT INTO accounting_payroll_details(id,payroll_run_id,user_id,employee_key,employee_name)
        VALUES(1,1,900001,'EMP-TEST','테스트 직원'),(2,1,NULL,'FORMER-TEST','퇴사 직원');
        INSERT INTO accounting_payroll_items(payroll_detail_id,item_code,item_name,item_type,amount)
        VALUES(1,'BASE','기본급','EARNING',3000000),(1,'MEAL','식대','EARNING',200000),
          (1,'TAX','소득세','DEDUCTION',100000),(1,'INS','보험','DEDUCTION',200000),
          (1,'REFUND','정산환급','DEDUCTION',-10000),(1,'COMPANY','회사부담','EMPLOYER_CONTRIBUTION',250000);
        INSERT INTO accounting_budgets(category_id,fiscal_year,fiscal_month,budget_basis,target_amount,created_by)
        VALUES(1,2026,0,'CASH_OUT',1200,900001),(1,2026,10,'CASH_OUT',100,900001);
    """)
    equal('SELECT SUM(net_approval_amount) FROM accounting_card_transactions;', '0.00')
    equal('SELECT approval_no FROM accounting_card_transactions WHERE id=1;', '00123456')
    equal('SELECT COUNT(*) FROM accounting_card_transactions WHERE net_purchase_amount IS NULL;', '3')
    equal('SELECT SUM(allocated_amount) FROM accounting_payment_allocations WHERE bank_transaction_id=1;', '100.00')
    equal("SELECT SUM(CASE item_type WHEN 'EARNING' THEN amount WHEN 'DEDUCTION' THEN -amount ELSE 0 END) FROM accounting_payroll_items WHERE payroll_detail_id=1;", '2910000.00')
    equal('SELECT COUNT(*) FROM accounting_payroll_details WHERE user_id IS NULL;', '1')
    rejects("INSERT INTO accounting_bank_transactions(bank_account_id,trans_ref_key,trans_at,withdraw_amount,raw_payload) VALUES(1,'Ref001',NOW(),100,'{}');", 1062)
    sql("INSERT INTO accounting_bank_transactions(bank_account_id,trans_ref_key,trans_at,deposit_amount,raw_payload) VALUES(1,'ref001',NOW(),100,'{}');")
    equal('SELECT COUNT(*) FROM accounting_bank_transactions;', '2')
    rejects("UPDATE accounting_bank_transactions SET deposit_amount=1 WHERE id=1;", 4025)
    rejects("UPDATE accounting_bank_transactions SET linked_transaction_id=2 WHERE id=1;", 4025)
    rejects("UPDATE accounting_bank_transactions SET bank_account_id=999999 WHERE id=1;", 1452)
    rejects("UPDATE accounting_bank_accounts SET opening_balance=100 WHERE id=1;", 4025)
    rejects("UPDATE accounting_card_transactions SET source_event_key=REPEAT('a',64) WHERE id=2;", 1062)
    rejects("UPDATE accounting_card_transactions SET approval_cancel_amount=-1 WHERE id=2;", 4025)
    rejects("UPDATE accounting_card_transactions SET approval_cancel_amount=-22000 WHERE id=3;", 4025)
    rejects("UPDATE accounting_payment_allocations SET card_transaction_id=1 WHERE id=1;", 4025)
    rejects("UPDATE accounting_payment_allocations SET allocated_amount=0 WHERE id=1;", 4025)
    rejects("UPDATE accounting_payment_allocations SET idempotency_key='payment-a' WHERE id=2;", 1062)
    rejects("UPDATE accounting_payment_allocations SET payment_method='OFFSET',bank_transaction_id=NULL,offset_entry_id=ledger_entry_id WHERE id=1;", 4025)
    rejects("UPDATE accounting_ledger_entries SET source_bank_transaction_id=1,source_card_transaction_id=1 WHERE id=1;", 4025)
    rejects("UPDATE accounting_ledger_entries SET entry_type='CARD_BILL',pnl_treatment='EXPENSE' WHERE id=1;", 4025)
    rejects("UPDATE accounting_ledger_entries SET entry_type='PRINCIPAL',pnl_treatment='EXPENSE' WHERE id=1;", 4025)
    rejects("UPDATE accounting_ledger_entries SET line_no=1 WHERE id=2;", 1062)
    rejects("UPDATE accounting_payroll_runs SET payroll_month='2026-10-02' WHERE id=1;", 4025)
    rejects("UPDATE accounting_payroll_runs SET status='CONFIRMED' WHERE id=1;", 4025)
    rejects("UPDATE accounting_payroll_details SET employee_key='EMP-TEST' WHERE id=2;", 1062)
    rejects("INSERT INTO accounting_payroll_items(payroll_detail_id,item_code,item_name,item_type,amount) VALUES(1,'BASE','기본급','EARNING',1);", 1062)
    rejects("UPDATE accounting_budgets SET fiscal_month=13;", 4025)
    rejects("INSERT INTO accounting_budgets(category_id,fiscal_year,fiscal_month,budget_basis,target_amount,created_by) VALUES(1,2026,0,'CASH_OUT',1,900001);", 1062)
    rejects("INSERT INTO accounting_documents(document_type,direction,supply_amount,vat_amount,total_amount,created_by) VALUES('TAX_INVOICE','RECEIVED',100,10,100,900001);", 4025)
    rejects("DELETE FROM accounting_bank_transactions WHERE id=1;", 1451)
    print(f'PASS: {checks} checks; prerequisite schemas, 013 creation and rerun on {version}')
finally:
    sql(f'DROP DATABASE IF EXISTS `{database}`;', db=False)
