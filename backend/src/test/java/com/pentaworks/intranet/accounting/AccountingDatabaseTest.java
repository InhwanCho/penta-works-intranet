package com.pentaworks.intranet.accounting;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="ACCOUNTING_TEST_DB_URL", matches="jdbc:mariadb://127\\.0\\.0\\.1:[0-9]+/mysql")
class AccountingDatabaseTest {
    JdbcTemplate admin,jdbc;String db;AccountingService service;CardExcelParser parser=new CardExcelParser();
    @BeforeEach void setup(){String url=System.getenv("ACCOUNTING_TEST_DB_URL");admin=new JdbcTemplate(new DriverManagerDataSource(url,"root",""));db="accounting_api_test_"+UUID.randomUUID().toString().replace("-","");admin.execute("CREATE DATABASE "+db);
        var data=new DriverManagerDataSource(url.replace("/mysql","/"+db),"root","");jdbc=new JdbcTemplate(data);
        var scripts=new ResourceDatabasePopulator();for(String s:List.of("001_schema.sql","002_service_schema.sql","013_accounting.sql","014_accounting_import.sql","015_sessions_sync_history.sql","016_session_charset.sql","022_cash_planning.sql","024_card_cash_details.sql","025_counterparty_ledger.sql","026_bank_transaction_memo.sql","027_cash_plan_amount_pending.sql","028_cash_execution.sql","029_bank_review.sql"))scripts.addScript(new FileSystemResource("../database/init/"+s));scripts.execute(data);
        jdbc.update("INSERT INTO users(id,login_id,password_hash,name,role) VALUES(1,'test','test','테스트','ACCOUNTING')");
        String key=Base64.getEncoder().encodeToString(new byte[32]);service=new AccountingService(jdbc,new ObjectMapper().findAndRegisterModules(),new AccountCrypto(key,key),new DataSourceTransactionManager(data));
    }
    @AfterEach void cleanup(){if(admin!=null && db!=null)admin.execute("DROP DATABASE "+db);}
    CashPlanService cash() {
        // Exercise the same Spring transaction boundary used by the HTTP service.
        var factory=new org.springframework.aop.framework.ProxyFactory(new CashPlanService(jdbc,new ObjectMapper().findAndRegisterModules()));
        factory.setProxyTargetClass(true);
        factory.addAdvice(new org.springframework.transaction.interceptor.TransactionInterceptor(new DataSourceTransactionManager(jdbc.getDataSource()),new org.springframework.transaction.annotation.AnnotationTransactionAttributeSource()));
        return (CashPlanService)factory.getProxy();
    }
    CashPlanService.PlanInput plan(String key,long account,int months,String issuer,java.math.BigDecimal amount,int version) {
        return new CashPlanService.PlanInput("테스트 지급","OUT",amount,LocalDate.of(2026,1,31),account,"테스트 업체","임차료","ESTIMATED","메모",months,false,issuer,issuer==null?null:LocalDate.of(2026,1,1),version,key);
    }
    long cashAccount() {
        service.refreshAccounts(List.of(new BarobillClient.RemoteAccount("IBK","기업","1234567890","기업 테스트",false)),1);
        return jdbc.queryForObject("SELECT id FROM accounting_bank_accounts",Long.class);
    }
    @Test @SuppressWarnings("unchecked") void executionReviewHandlesToleranceSplitsRefundsAndReopening() {
        long account=cashAccount();var cash=cash();
        long id=createdId(cash.create(plan(UUID.randomUUID().toString(),account,1,null,new java.math.BigDecimal("110"),0),1));
        jdbc.update("INSERT INTO accounting_bank_transactions(bank_account_id,trans_ref_key,trans_at,withdraw_amount,description,raw_payload) VALUES(?,'execution','2026-02-01',105,'테스트 업체','{}')",account);
        long tx=jdbc.queryForObject("SELECT id FROM accounting_bank_transactions WHERE trans_ref_key='execution'",Long.class);
        var matches=cash.matches(id,LocalDate.of(2026,1,24),LocalDate.of(2026,2,7));
        assertEquals(true,((List<Map<String,Object>>)matches.get("candidates")).get(0).get("recommended"));
        assertEquals(false,((Map<String,Object>)matches.get("plan")).get("execution_confirmed"));
        cash.confirmExecution(id,new CashPlanService.ReviewInput(0,true,"",List.of(new CashPlanController.AllocationItem(tx,new java.math.BigDecimal("105"),UUID.randomUUID().toString()))),1);
        var complete=(Map<String,Object>)cash.matches(id,LocalDate.of(2026,1,1),LocalDate.of(2026,2,7)).get("plan");
        assertEquals(true,complete.get("execution_confirmed"));assertEquals(0,new java.math.BigDecimal(complete.get("remaining").toString()).signum());
        assertEquals(0,new java.math.BigDecimal("110").compareTo(new java.math.BigDecimal(complete.get("amount").toString())));
        assertThrows(IllegalArgumentException.class,()->cash.confirmExecution(id,new CashPlanService.ReviewInput(0,false,"",List.of()),1));
        jdbc.update("INSERT INTO accounting_bank_transactions(bank_account_id,trans_ref_key,trans_at,deposit_amount,description,raw_payload) VALUES(?,'refund','2026-02-02',105,'테스트 업체 반환','{}')",account);
        long refund=jdbc.queryForObject("SELECT id FROM accounting_bank_transactions WHERE trans_ref_key='refund'",Long.class);
        cash.confirmExecution(id,new CashPlanService.ReviewInput(((Number)complete.get("version")).intValue(),false,"반환",List.of(new CashPlanController.AllocationItem(refund,new java.math.BigDecimal("105"),UUID.randomUUID().toString()))),1);
        assertEquals(0,jdbc.queryForObject("SELECT SUM(allocated_amount) FROM accounting_payment_allocations WHERE ledger_entry_id=?",java.math.BigDecimal.class,id).signum());
        long originalAllocation=jdbc.queryForObject("SELECT id FROM accounting_payment_allocations WHERE bank_transaction_id=?",Long.class,tx);
        assertThrows(IllegalArgumentException.class,()->cash.unlink(id,originalAllocation,1));
        assertThrows(IllegalArgumentException.class,()->cash.cancel(id,4,1));
        var unlinked=(List<Map<String,Object>>)cash.review(LocalDate.of(2026,1,1),LocalDate.of(2026,2,28)).get("unlinked");
        assertTrue(unlinked.isEmpty());
    }
    @Test void executionCanExceedBudgetAndSplitBankTransactionWithoutDoubleUse() {
        long account=cashAccount();var cash=cash();
        long first=createdId(cash.create(plan(UUID.randomUUID().toString(),account,1,null,new java.math.BigDecimal("100"),0),1));
        long second=createdId(cash.create(plan(UUID.randomUUID().toString(),account,1,null,new java.math.BigDecimal("100"),0),1));
        jdbc.update("INSERT INTO accounting_bank_transactions(bank_account_id,trans_ref_key,trans_at,withdraw_amount,raw_payload) VALUES(?,'combined','2026-01-31',220,'{}')",account);
        long tx=jdbc.queryForObject("SELECT id FROM accounting_bank_transactions",Long.class);
        cash.confirmExecution(first,new CashPlanService.ReviewInput(0,true,"",List.of(new CashPlanController.AllocationItem(tx,new java.math.BigDecimal("120"),UUID.randomUUID().toString()))),1);
        assertThrows(IllegalArgumentException.class,()->cash.confirmExecution(second,new CashPlanService.ReviewInput(0,true,"",List.of(new CashPlanController.AllocationItem(tx,new java.math.BigDecimal("101"),UUID.randomUUID().toString()))),1));
        cash.confirmExecution(second,new CashPlanService.ReviewInput(0,true,"",List.of(new CashPlanController.AllocationItem(tx,new java.math.BigDecimal("100"),UUID.randomUUID().toString()))),1);
        assertEquals(0,new java.math.BigDecimal("220").compareTo(jdbc.queryForObject("SELECT SUM(allocated_amount) FROM accounting_payment_allocations",java.math.BigDecimal.class)));
    }
    @Test @SuppressWarnings("unchecked") void bankReviewShowsPlanStatusAndStandaloneConfirmationIsExclusive() {
        long account=cashAccount();var cash=cash();
        long id=createdId(cash.create(plan(UUID.randomUUID().toString(),account,1,null,new java.math.BigDecimal("1000"),0),1));
        jdbc.update("INSERT INTO accounting_bank_transactions(bank_account_id,trans_ref_key,trans_at,withdraw_amount,description,raw_payload) VALUES(?,'bank-review','2026-01-31',11000,'테스트 업체','{}')",account);
        long tx=jdbc.queryForObject("SELECT id FROM accounting_bank_transactions",Long.class);
        var detail=cash.bankReview(tx,LocalDate.of(2026,1,1),LocalDate.of(2026,2,28));
        assertEquals(true,((List<Map<String,Object>>)detail.get("plans")).get(0).get("recommended"));
        assertThrows(IllegalArgumentException.class,()->cash.confirmBankWithoutPlan(tx,new CashPlanService.BankReviewInput(0,true,"",new java.math.BigDecimal("11000")),1));
        cash.confirmBankWithoutPlan(tx,new CashPlanService.BankReviewInput(0,true,"계획 없는 비용",new java.math.BigDecimal("11000")),1);
        var central=cash.review(LocalDate.of(2026,1,1),LocalDate.of(2026,2,28));
        assertEquals(1,((List<?>)central.get("reviewedTransactions")).size());
        assertTrue(((List<?>)central.get("unlinked")).isEmpty());
        assertThrows(IllegalArgumentException.class,()->cash.confirmBankWithoutPlan(tx,new CashPlanService.BankReviewInput(0,false,"",new java.math.BigDecimal("11000")),1));
        assertTrue(((List<?>)cash.matches(id,LocalDate.of(2026,1,1),LocalDate.of(2026,2,28)).get("candidates")).isEmpty());
        assertThrows(IllegalArgumentException.class,()->cash.confirmExecution(id,new CashPlanService.ReviewInput(0,true,"",List.of(new CashPlanController.AllocationItem(tx,new java.math.BigDecimal("11000"),UUID.randomUUID().toString()))),1));
        cash.confirmBankWithoutPlan(tx,new CashPlanService.BankReviewInput(1,false,"",new java.math.BigDecimal("11000")),1);
        cash.confirmExecution(id,new CashPlanService.ReviewInput(0,true,"",List.of(new CashPlanController.AllocationItem(tx,new java.math.BigDecimal("11000"),UUID.randomUUID().toString()))),1);
        var records=(List<Map<String,Object>>)service.transactions(false,LocalDate.of(2026,1,1),LocalDate.of(2026,2,28),null,1).get("rows");
        assertEquals(0,new java.math.BigDecimal("11000").compareTo(new java.math.BigDecimal(records.get(0).get("confirmed_total").toString())));
        assertThrows(IllegalArgumentException.class,()->cash.confirmBankWithoutPlan(tx,new CashPlanService.BankReviewInput(2,true,"중복",new java.math.BigDecimal("11000")),1));
        cash.confirmExecution(id,new CashPlanService.ReviewInput(2,false,"재확인",List.of()),1);
        records=(List<Map<String,Object>>)service.transactions(false,LocalDate.of(2026,1,1),LocalDate.of(2026,2,28),null,1).get("rows");
        assertEquals(0,new java.math.BigDecimal(records.get(0).get("confirmed_total").toString()).signum());
    }

    @Test void executionOutOfToleranceRequiresReasonAndRollsBack() {
        long account=cashAccount();var cash=cash();
        long id=createdId(cash.create(plan(UUID.randomUUID().toString(),account,1,null,new java.math.BigDecimal("100"),0),1));
        jdbc.update("INSERT INTO accounting_bank_transactions(bank_account_id,trans_ref_key,trans_at,withdraw_amount,raw_payload) VALUES(?,'large','2026-01-31',20000,'{}')",account);
        long tx=jdbc.queryForObject("SELECT id FROM accounting_bank_transactions",Long.class);
        var item=new CashPlanController.AllocationItem(tx,new java.math.BigDecimal("20000"),UUID.randomUUID().toString());
        assertThrows(IllegalArgumentException.class,()->cash.confirmExecution(id,new CashPlanService.ReviewInput(0,true,"",List.of(item)),1));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM accounting_payment_allocations",Integer.class));
        cash.confirmExecution(id,new CashPlanService.ReviewInput(0,true,"추가 비용 포함",List.of(item)),1);
    }

    @Test void batchPlansRollBackOnInvalidRowAndRetryWithoutDuplicates() {
        long account=cashAccount();
        var cash=cash();
        var first=plan(UUID.randomUUID().toString(),account,1,null,java.math.BigDecimal.ONE,0);
        var second=plan(UUID.randomUUID().toString(),account,1,null,java.math.BigDecimal.TEN,0);
        var invalid=plan(UUID.randomUUID().toString(),account,1,null,java.math.BigDecimal.ZERO,0);
        assertThrows(IllegalArgumentException.class,()->cash.createBatch(List.of(first,invalid),1));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM accounting_cash_plans",Integer.class));
        cash.createBatch(List.of(first,second),1);
        cash.createBatch(List.of(first,second),1);
        assertEquals(2,jdbc.queryForObject("SELECT COUNT(*) FROM accounting_cash_plans",Integer.class));
    }

    @Test void dateOnlyCardPlanCanBePricedLater() {
        long account=cashAccount();
        var cash=cash();
        var pending=plan(UUID.randomUUID().toString(),account,3,"BC",null,0);
        assertEquals(3,cash.createBatch(List.of(pending),1).get("count"));
        assertEquals(3,jdbc.queryForObject("SELECT COUNT(*) FROM accounting_ledger_entries WHERE amount=0",Integer.class));
        long id=jdbc.queryForObject("SELECT MIN(id) FROM accounting_ledger_entries",Long.class);
        cash.update(id,plan(UUID.randomUUID().toString(),account,1,"BC",new java.math.BigDecimal("50000"),0),1);
        assertEquals(new java.math.BigDecimal("50000.00"),jdbc.queryForObject("SELECT amount FROM accounting_ledger_entries WHERE id=?",java.math.BigDecimal.class,id));
    }

    @Test void batchAllocationAppliesSplitTransactionsAtomically() {
        long account=cashAccount();
        var cash=cash();
        var amount=new java.math.BigDecimal("5000000");
        long planId=createdId(cash.create(plan(UUID.randomUUID().toString(),account,1,null,amount,0),1));
        jdbc.update("INSERT INTO accounting_bank_transactions(bank_account_id,trans_ref_key,trans_at,withdraw_amount,raw_payload) VALUES(?,'split-a','2026-01-30',2000000,'{}'),(?,'split-b','2026-01-31',3000000,'{}')",account,account);
        var ids=jdbc.queryForList("SELECT id FROM accounting_bank_transactions ORDER BY id",Long.class);
        var first=new CashPlanController.AllocationItem(ids.get(0),new java.math.BigDecimal("2000000"),UUID.randomUUID().toString());
        var invalid=new CashPlanController.AllocationItem(ids.get(1),new java.math.BigDecimal("2999999"),UUID.randomUUID().toString());
        assertThrows(IllegalArgumentException.class,()->cash.allocateBatch(planId,new CashPlanController.AllocationBatch(0,List.of(first,invalid)),1));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM accounting_payment_allocations",Integer.class));
        var second=new CashPlanController.AllocationItem(ids.get(1),new java.math.BigDecimal("3000000"),UUID.randomUUID().toString());
        var batch=new CashPlanController.AllocationBatch(0,List.of(second,first));
        cash.allocateBatch(planId,batch,1);
        cash.allocateBatch(planId,batch,1);
        assertEquals(2,jdbc.queryForObject("SELECT COUNT(*) FROM accounting_payment_allocations",Integer.class));
        assertEquals(0,amount.compareTo(jdbc.queryForObject("SELECT SUM(allocated_amount) FROM accounting_payment_allocations",java.math.BigDecimal.class)));
    }

    @Test void bankMemoPreservesBankDescriptionAndRejectsStaleEdits() {
        long account=cashAccount();
        jdbc.update("INSERT INTO accounting_bank_transactions(bank_account_id,trans_ref_key,trans_at,deposit_amount,description,raw_payload) VALUES(?,'memo-test','2026-01-02',150,'은행 적요','{}')",account);
        long id=jdbc.queryForObject("SELECT id FROM accounting_bank_transactions",Long.class);
        service.saveBankMemo(id,"내부 메모","",1);
        assertThrows(IllegalArgumentException.class,()->service.saveBankMemo(id,"다른 메모","",1));
        assertEquals("내부 메모",jdbc.queryForObject("SELECT user_memo FROM accounting_bank_transactions WHERE id=?",String.class,id));
        assertEquals("은행 적요",jdbc.queryForObject("SELECT description FROM accounting_bank_transactions WHERE id=?",String.class,id));
        service.saveBankMemo(id,"","내부 메모",1);
        assertEquals("",jdbc.queryForObject("SELECT user_memo FROM accounting_bank_transactions WHERE id=?",String.class,id));
    }

    @SuppressWarnings("unchecked") long createdId(Map<String,Object> result) { return ((List<Number>)result.get("ids")).get(0).longValue(); }
    @Test @SuppressWarnings("unchecked") void counterpartyLedgerPreservesOpeningAndVersions() {
        var factory=new org.springframework.aop.framework.ProxyFactory(new CounterpartyLedgerService(jdbc,new ObjectMapper().findAndRegisterModules()));
        factory.setProxyTargetClass(true);
        factory.addAdvice(new org.springframework.transaction.interceptor.TransactionInterceptor(new DataSourceTransactionManager(jdbc.getDataSource()),new org.springframework.transaction.annotation.AnnotationTransactionAttributeSource()));
        var ledger=(CounterpartyLedgerService)factory.getProxy();
        var p=new CounterpartyLedgerService.Input(LocalDate.of(2026,3,1),"테스트","SALE","매출",new java.math.BigDecimal("1100"),new java.math.BigDecimal("100"),false,0);
        long id=((Number)((Map<String,Object>)ledger.save(null,p,1)).get("id")).longValue();
        var q=(Map<String,Object>)ledger.list(2026,2);
        assertTrue(((List<?>)q.get("rows")).isEmpty());
        assertEquals(new java.math.BigDecimal("1100"),((List<Map<String,Object>>)q.get("opening")).get(0).get("receivable"));
        ledger.save(id,p,1);
        assertThrows(IllegalArgumentException.class,()->ledger.save(id,p,1));
        ledger.cancel(id,1,1);
        assertTrue(((List<?>)((Map<String,Object>)ledger.list(2026,1)).get("rows")).isEmpty());
    }
    @Test @SuppressWarnings("unchecked") void dailyBalancesUseLastTransactionWithoutLookingIntoFutureOrReplacingUnknownWithZero() {
        long account=cashAccount();
        jdbc.update("UPDATE accounting_bank_accounts SET opening_balance=100,opening_balance_at='2026-01-01 00:00:00' WHERE id=?",account);
        jdbc.update("INSERT INTO accounting_bank_transactions(bank_account_id,trans_ref_key,trans_at,balance_after,deposit_amount,raw_payload) VALUES(?,'first','2026-01-02 10:00:00',250,150,'{}'),(?,'last','2026-01-02 15:00:00',300,50,'{}'),(?,'unknown','2026-01-04 10:00:00',NULL,100,'{}')",account,account,account);
        var rows=(List<Map<String,Object>>)cash().workspace(LocalDate.of(2025,12,31),LocalDate.of(2026,1,4)).get("balances");
        assertEquals(5,rows.size());
        assertNull(rows.get(0).get("balance"));
        assertEquals(new java.math.BigDecimal("100.00"),rows.get(1).get("balance"));
        assertEquals(new java.math.BigDecimal("300.00"),rows.get(2).get("balance"));
        assertEquals(new java.math.BigDecimal("300.00"),rows.get(3).get("balance"));
        assertNull(rows.get(4).get("balance"));
    }
    @Test @SuppressWarnings("unchecked") void cardCashDetailsPersistAndRejectStaleEdits() {
        long account=cashAccount();
        jdbc.update("INSERT INTO accounting_cards(issuer,card_num_masked,alias) VALUES('BC','1234','테스트')");
        long card=jdbc.queryForObject("SELECT id FROM accounting_cards",Long.class);
        jdbc.update("INSERT INTO accounting_card_transactions(card_id,source_event_key,approval_no,approval_date,time_precision,event_type,approval_amount,merchant_name,source_filename,raw_payload,imported_by) VALUES(?,'test-key','123','2026-01-02','DAY','APPROVAL',500,'테스트','test.xlsx','{}',1)",card);
        long id=jdbc.queryForObject("SELECT id FROM accounting_card_transactions",Long.class);
        var input=new AccountingService.CardCashInput(LocalDate.of(2026,2,1),LocalDate.of(2026,2,15),account,"CONFIRMED","청구서 확인",0);
        assertEquals(1,service.saveCardCashDetails(id,input,1).get("version"));
        assertThrows(IllegalArgumentException.class,()->service.saveCardCashDetails(id,input,1));
        var rows=(List<Map<String,Object>>)service.transactions(true,LocalDate.of(2026,1,1),LocalDate.of(2026,1,31),null,1).get("rows");
        assertEquals("2026-02-15",rows.get(0).get("payment_date"));
        assertEquals("청구서 확인",rows.get(0).get("cash_memo"));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM accounting_cash_plans",Integer.class));
        service.removeCard(id,false,1);
        assertThrows(IllegalArgumentException.class,()->service.saveCardCashDetails(id,new AccountingService.CardCashInput(null,null,null,"ESTIMATED","",1),1));
    }
    @Test void cashRecurringPlansPreserveMonthDayAndRetriesAndOverdueAmounts() {
        var cash=cash();long account=cashAccount();var input=plan(UUID.randomUUID().toString(),account,3,null,new java.math.BigDecimal("500"),0);
        var first=cash.create(input,1);assertEquals(first,cash.create(input,1));
        assertEquals(List.of("2026-01-31","2026-02-28","2026-03-31"),jdbc.queryForList("SELECT DATE_FORMAT(planned_date,'%Y-%m-%d') FROM accounting_ledger_entries ORDER BY id",String.class));
        var workspace=cash.workspace(LocalDate.of(2026,4,1),LocalDate.of(2026,4,30));
        assertEquals(3,((List<?>)workspace.get("plans")).size());
        assertEquals(new java.math.BigDecimal("1500.00"),jdbc.queryForObject("SELECT SUM(amount) FROM accounting_ledger_entries",java.math.BigDecimal.class));
    }
    @Test void cashPartialSettlementChecksSharedLimitsAndCanBeUndone() {
        var cash=cash();long account=cashAccount();long id=createdId(cash.create(plan(UUID.randomUUID().toString(),account,1,null,new java.math.BigDecimal("500"),0),1));
        jdbc.update("INSERT INTO accounting_bank_transactions(bank_account_id,trans_ref_key,trans_at,withdraw_amount,raw_payload) VALUES(?,'cash-test','2026-01-31 10:00:00',300,'{}')",account);
        long bank=jdbc.queryForObject("SELECT id FROM accounting_bank_transactions",Long.class);
        var allocation=new CashPlanController.Allocation(bank,new java.math.BigDecimal("200"),0,UUID.randomUUID().toString());
        cash.allocate(id,allocation,1);cash.allocate(id,allocation,1);
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM accounting_payment_allocations",Integer.class));
        assertThrows(IllegalArgumentException.class,()->cash.allocate(id,new CashPlanController.Allocation(bank,new java.math.BigDecimal("101"),1,UUID.randomUUID().toString()),1));
        assertThrows(IllegalArgumentException.class,()->cash.cancel(id,1,1));
        cash.update(id,plan(UUID.randomUUID().toString(),account,1,null,new java.math.BigDecimal("199"),1),1);
        assertThrows(IllegalArgumentException.class,()->cash.update(id,plan(UUID.randomUUID().toString(),account,1,null,new java.math.BigDecimal("500"),0),1));
        long second=createdId(cash.create(plan(UUID.randomUUID().toString(),account,1,null,new java.math.BigDecimal("500"),0),1));
        cash.allocate(second,new CashPlanController.Allocation(bank,new java.math.BigDecimal("100"),0,UUID.randomUUID().toString()),1);
        assertThrows(IllegalArgumentException.class,()->cash.allocate(second,new CashPlanController.Allocation(bank,java.math.BigDecimal.ONE,1,UUID.randomUUID().toString()),1));
        cash.unlink(id,jdbc.queryForObject("SELECT MIN(id) FROM accounting_payment_allocations",Long.class),1);
        cash.cancel(id,3,1);
        assertEquals("VOID",jdbc.queryForObject("SELECT status FROM accounting_ledger_entries WHERE id=?",String.class,id));
    }
    @Test void cardBillsAreUniqueAndFailedBatchRollsBack() {
        var cash=cash();long account=cashAccount();long id=createdId(cash.create(plan(UUID.randomUUID().toString(),account,1,"BC",new java.math.BigDecimal("100"),0),1));
        assertThrows(IllegalArgumentException.class,()->cash.create(plan(UUID.randomUUID().toString(),account,1,"BC",new java.math.BigDecimal("200"),0),1));
        var badBatch=new CashPlanService.PlanInput("청구","OUT",new java.math.BigDecimal("100"),LocalDate.of(2025,12,25),account,"","","CONFIRMED","",3,false,"BC",LocalDate.of(2025,12,1),0,UUID.randomUUID().toString());
        assertThrows(IllegalArgumentException.class,()->cash.create(badBatch,1));
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM accounting_cash_plans",Integer.class));
        cash.update(id,plan(UUID.randomUUID().toString(),account,1,"BC",new java.math.BigDecimal("250"),0),1);
        assertEquals(new java.math.BigDecimal("100.00"),jdbc.queryForObject("SELECT original_amount FROM accounting_cash_plans",java.math.BigDecimal.class));
        cash.cancel(id,1,1);cash.create(plan(UUID.randomUUID().toString(),account,1,"BC",new java.math.BigDecimal("300"),0),1);
    }
    @Test void cashRejectsWrongDirectionAndInternalTransfers() {
        var cash=cash();long account=cashAccount();long id=createdId(cash.create(plan(UUID.randomUUID().toString(),account,1,null,new java.math.BigDecimal("500"),0),1));
        jdbc.update("INSERT INTO accounting_bank_transactions(bank_account_id,trans_ref_key,trans_at,deposit_amount,raw_payload) VALUES(?,'cash-test','2026-01-31 10:00:00',300,'{}')",account);
        long bank=jdbc.queryForObject("SELECT id FROM accounting_bank_transactions",Long.class);
        assertThrows(IllegalArgumentException.class,()->cash.allocate(id,new CashPlanController.Allocation(bank,java.math.BigDecimal.ONE,0,UUID.randomUUID().toString()),1));
        jdbc.update("UPDATE accounting_bank_transactions SET deposit_amount=0,withdraw_amount=300,classification='INTERNAL_TRANSFER' WHERE id=?",bank);
        assertThrows(IllegalArgumentException.class,()->cash.allocate(id,new CashPlanController.Allocation(bank,java.math.BigDecimal.ONE,0,UUID.randomUUID().toString()),1));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM accounting_payment_allocations",Integer.class));
    }
    @Test void internalTransferRetainsFeeAndPreventsDoubleUse() {
        var cash=cash();long account=cashAccount();
        service.refreshAccounts(List.of(new BarobillClient.RemoteAccount("HANA","하나","0987654321","하나 테스트",false)),1);
        long other=jdbc.queryForObject("SELECT id FROM accounting_bank_accounts WHERE id<>?",Long.class,account);
        jdbc.update("INSERT INTO accounting_bank_transactions(bank_account_id,trans_ref_key,trans_at,withdraw_amount,raw_payload) VALUES(?,'out','2026-01-31 10:00:00',1000500,'{}')",account);
        jdbc.update("INSERT INTO accounting_bank_transactions(bank_account_id,trans_ref_key,trans_at,deposit_amount,raw_payload) VALUES(?,'in','2026-01-31 10:00:01',1000000,'{}')",other);
        long out=jdbc.queryForObject("SELECT id FROM accounting_bank_transactions WHERE trans_ref_key='out'",Long.class),in=jdbc.queryForObject("SELECT id FROM accounting_bank_transactions WHERE trans_ref_key='in'",Long.class);
        assertThrows(IllegalArgumentException.class,()->cash.transfer(new CashPlanController.Transfer(out,in,java.math.BigDecimal.ZERO),1));
        cash.transfer(new CashPlanController.Transfer(out,in,new java.math.BigDecimal("500")),1);
        cash.transfer(new CashPlanController.Transfer(out,in,new java.math.BigDecimal("500")),1);
        var days=(List<Map<String,Object>>)cash.workspace(LocalDate.of(2026,1,1),LocalDate.of(2026,1,31)).get("days");
        assertEquals(new java.math.BigDecimal("500.00"),days.stream().map(d->(java.math.BigDecimal)d.get("expense")).reduce(java.math.BigDecimal.ZERO,java.math.BigDecimal::add));
        assertEquals(0,days.stream().map(d->(java.math.BigDecimal)d.get("transfer")).reduce(java.math.BigDecimal.ZERO,java.math.BigDecimal::add).signum());
        cash.undoTransfer(in,1);
        assertEquals(2,jdbc.queryForObject("SELECT COUNT(*) FROM accounting_bank_transactions WHERE linked_transaction_id IS NULL AND classification='UNCLASSIFIED'",Integer.class));
        long plan=createdId(cash.create(plan(UUID.randomUUID().toString(),account,1,null,new java.math.BigDecimal("100"),0),1));
        cash.allocate(plan,new CashPlanController.Allocation(out,new java.math.BigDecimal("100"),0,UUID.randomUUID().toString()),1);
        assertThrows(IllegalArgumentException.class,()->cash.transfer(new CashPlanController.Transfer(out,in,new java.math.BigDecimal("500")),1));
    }
    @Test void simultaneousAllocationsCannotOverspendOneBankTransaction() throws Exception {
        var cash=cash();long account=cashAccount();
        long a=createdId(cash.create(plan(UUID.randomUUID().toString(),account,1,null,new java.math.BigDecimal("500"),0),1));
        long b=createdId(cash.create(plan(UUID.randomUUID().toString(),account,1,null,new java.math.BigDecimal("500"),0),1));
        jdbc.update("INSERT INTO accounting_bank_transactions(bank_account_id,trans_ref_key,trans_at,withdraw_amount,raw_payload) VALUES(?,'concurrent','2026-01-31 10:00:00',300,'{}')",account);
        long bank=jdbc.queryForObject("SELECT id FROM accounting_bank_transactions",Long.class);
        var start=new java.util.concurrent.CountDownLatch(1);var pool=java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var jobs=java.util.stream.LongStream.of(a,b).mapToObj(id->pool.submit(()->{start.await();try {cash.allocate(id,new CashPlanController.Allocation(bank,new java.math.BigDecimal("200"),0,UUID.randomUUID().toString()),1);return true;}catch(IllegalArgumentException e){return false;}})).toList();
            start.countDown();int success=0;for(var job:jobs)if(job.get(15,java.util.concurrent.TimeUnit.SECONDS))success++;
            assertEquals(1,success);
            assertEquals(new java.math.BigDecimal("200.00"),jdbc.queryForObject("SELECT SUM(allocated_amount) FROM accounting_payment_allocations WHERE status='CONFIRMED'",java.math.BigDecimal.class));
        } finally {pool.shutdownNow();}
    }
    @Test void cardUploadIsIdempotentAndHanaStatusUpdatesWithoutTouchingLedger() throws Exception {
        var normal=parser.parse(CardExcelParserTest.workbook(false,"21,000","0","정상",false),"h.xls","HANA");
        assertEquals(1,service.importCards(normal,"h.xls",1).get("inserted"));assertEquals(1,service.importCards(normal,"h.xls",1).get("unchanged"));
        long source=jdbc.queryForObject("SELECT id FROM accounting_card_transactions",Long.class);
        jdbc.update("INSERT INTO accounting_ledger_entries(entry_group_key,entry_type,direction,title,entry_date,amount,source_card_transaction_id,memo,created_by,updated_by) VALUES('test','EXPENSE','OUT','분류','2026-10-06',21000,?,'유지할 메모',1,1)",source);
        var cancel=parser.parse(CardExcelParserTest.workbook(false,"21,000","-21,000","승인취소",false),"h.xls","HANA");
        assertEquals(1,service.cardPreview(cancel).get("updated"));assertEquals(1,service.importCards(cancel,"h.xls",1).get("updated"));
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM accounting_card_transactions",Integer.class));assertEquals("유지할 메모",jdbc.queryForObject("SELECT memo FROM accounting_ledger_entries",String.class));
        assertEquals(0,jdbc.queryForObject("SELECT net_approval_amount FROM accounting_card_transactions",java.math.BigDecimal.class).signum());
    }
    @Test void bankImportPreservesClassificationsAndRollsBackBadResult() {
        var account=new BarobillClient.RemoteAccount("IBK","기업","1234567890","테스트",false);service.refreshAccounts(List.of(account),1);long id=jdbc.queryForObject("SELECT id FROM accounting_bank_accounts",Long.class);
        Map<String,String> row=Map.of("BankAccountNum","1234567890","TransRefKey","k1","TransDT","20261006123456","Deposit","100","Withdraw","0","Balance","100");
        var from=LocalDate.of(2026,10,1);var to=LocalDate.of(2026,10,8);
        assertEquals(1,service.importBank(id,"1234567890",from,to,List.of(row),1).get("inserted"));
        jdbc.update("UPDATE accounting_bank_transactions SET classification='FINANCING'");assertEquals(1,service.importBank(id,"1234567890",from,to,List.of(row),1).get("unchanged"));
        var changed=new HashMap<>(row);changed.put("Balance","200");assertEquals(1,service.importBank(id,"1234567890",from,to,List.of(changed),1).get("updated"));assertEquals("FINANCING",jdbc.queryForObject("SELECT classification FROM accounting_bank_transactions",String.class));
        var invalid=new HashMap<>(row);invalid.put("TransRefKey","k2");invalid.put("BankAccountNum","other");assertThrows(IllegalArgumentException.class,()->service.importBank(id,"1234567890",from,to,List.of(row,invalid),1));assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM accounting_bank_transactions",Integer.class));
        assertFalse(jdbc.queryForObject("SELECT raw_payload FROM accounting_bank_transactions",String.class).contains("1234567890"));
    }
    @Test void originalUserFilesReconcileAndRepeatWithoutDuplicates() throws Exception {
        String folder=System.getenv("ACCOUNTING_SAMPLE_DIR");Assumptions.assumeTrue(folder!=null);
        try(var files=Files.list(Path.of(folder))){for(Path file:files.filter(p->p.toString().endsWith(".xls")||p.toString().endsWith(".xlsx")).toList()){
            String issuer=file.toString().endsWith(".xlsx")?"BC":"HANA";var parsed=parser.parse(Files.readAllBytes(file),file.getFileName().toString(),issuer);
            assertEquals(issuer.equals("BC")?19:20,parsed.rows().size());service.importCards(parsed,file.getFileName().toString(),1);assertEquals(parsed.rows().size(),service.importCards(parsed,file.getFileName().toString(),1).get("unchanged"));}}
        assertEquals(39,jdbc.queryForObject("SELECT COUNT(*) FROM accounting_card_transactions",Integer.class));assertEquals(new java.math.BigDecimal("1900233.00"),jdbc.queryForObject("SELECT SUM(net_approval_amount) FROM accounting_card_transactions",java.math.BigDecimal.class));
    }
    @Test void uploadUndoRestoresSnapshotsAndLeavesDuplicatesAlone() throws Exception {
        var normal=parser.parse(CardExcelParserTest.workbook(false,"21,000","0","정상",false),"h.xls","HANA");
        var first=service.importCards(normal,"h.xls",1);
        var duplicate=service.importCards(normal,"h.xls",1);
        assertEquals(0,service.rollbackUpload(((Number)duplicate.get("uploadId")).longValue(),1).get("count"));
        var cancel=parser.parse(CardExcelParserTest.workbook(false,"21,000","-21,000","승인취소",false),"h.xls","HANA");
        var update=service.importCards(cancel,"h.xls",1);
        service.rollbackUpload(((Number)update.get("uploadId")).longValue(),1);
        assertEquals(new java.math.BigDecimal("21000.00"),jdbc.queryForObject("SELECT net_approval_amount FROM accounting_card_transactions",java.math.BigDecimal.class));
        assertEquals("정상",jdbc.queryForObject("SELECT approval_status FROM accounting_card_transactions",String.class));
        assertThrows(IllegalArgumentException.class,()->service.rollbackUpload(((Number)first.get("uploadId")).longValue(),1));
    }
    @Test void removalIsRecoverableAndProtectedAndWrongUploadCanBeReplaced() throws Exception {
        var parsed=parser.parse(CardExcelParserTest.workbook(true,"150,000","0","신규",false),"bc.xlsx","BC");
        var first=service.importCards(parsed,"bc.xlsx",1);long upload=((Number)first.get("uploadId")).longValue();
        long id=jdbc.queryForObject("SELECT id FROM accounting_card_transactions",Long.class);
        service.rollbackUpload(upload,1);
        assertEquals(0,service.transactions(true,LocalDate.of(2026,10,1),LocalDate.of(2026,10,8),null,1).get("total"));
        assertEquals(1,service.importCards(parsed,"corrected.xlsx",1).get("updated"));
        assertEquals(1,service.transactions(true,LocalDate.of(2026,10,1),LocalDate.of(2026,10,8),null,1).get("total"));
        service.removeCard(id,false,1);assertEquals(1,service.removedCards().size());
        assertThrows(IllegalArgumentException.class,()->service.cardPreview(parsed));
        service.removeCard(id,true,1);assertTrue(service.removedCards().isEmpty());
        jdbc.update("INSERT INTO accounting_ledger_entries(entry_group_key,entry_type,direction,title,entry_date,amount,source_card_transaction_id,created_by,updated_by) VALUES('protected','EXPENSE','OUT','보호','2026-10-06',150000,?,1,1)",id);
        assertThrows(IllegalArgumentException.class,()->service.removeCard(id,false,1));
    }
    @SuppressWarnings({"rawtypes","unchecked"})
    @Test void jdbcSessionSurvivesRepositoryReplacementAndSecurityContextIsSerializable() {
        var data=jdbc.getDataSource();
        var manager=new DataSourceTransactionManager(data);
        var tx=new org.springframework.transaction.support.TransactionTemplate(manager);
        org.springframework.session.SessionRepository<org.springframework.session.Session> first=(org.springframework.session.SessionRepository)new org.springframework.session.jdbc.JdbcIndexedSessionRepository(jdbc,tx);
        var session=first.createSession();session.setMaxInactiveInterval(java.time.Duration.ofHours(12));session.setAttribute("accountHash","test");
        var context=org.springframework.security.core.context.SecurityContextHolder.createEmptyContext();
        var principal=org.springframework.security.core.userdetails.User.withUsername("test").password("test").roles("ADMIN").build();
        context.setAuthentication(new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(principal,null,principal.getAuthorities()));
        session.setAttribute("SPRING_SECURITY_CONTEXT",context);first.save(session);
        org.springframework.session.SessionRepository<org.springframework.session.Session> replacement=(org.springframework.session.SessionRepository)new org.springframework.session.jdbc.JdbcIndexedSessionRepository(jdbc,tx);
        var restored=replacement.findById(session.getId());assertNotNull(restored);assertEquals("test",restored.getAttribute("accountHash"));
        org.springframework.security.core.context.SecurityContext restoredContext=restored.getAttribute("SPRING_SECURITY_CONTEXT");assertEquals("test",restoredContext.getAuthentication().getName());
        assertNull(replacement.findById("이전세션"));
        assertNull(replacement.findById("\uFFFD-invalid-session"));
        new ResourceDatabasePopulator(new FileSystemResource("../database/init/016_session_charset.sql")).execute(jdbc.getDataSource());
        assertNotNull(replacement.findById(session.getId()));
        replacement.deleteById(session.getId());assertNull(first.findById(session.getId()));
    }
    @Test void bankSchedulerFetchesWithoutAUserSessionAndReportsLastSuccess() {
        jdbc.update("UPDATE users SET role='ADMIN' WHERE id=1");
        var client=org.mockito.Mockito.mock(BarobillClient.class);
        var account=new BarobillClient.RemoteAccount("IBK","기업","1234567890","운영계좌",false);
        org.mockito.Mockito.when(client.ready()).thenReturn(true);
        org.mockito.Mockito.when(client.accounts()).thenReturn(List.of(account));
        String key=Base64.getEncoder().encodeToString(new byte[32]);
        var scheduler=new BankAutoSync(service,client,new AccountCrypto(key,key),jdbc,org.mockito.Mockito.mock(org.springframework.scheduling.TaskScheduler.class),true);
        LocalDate today=LocalDate.now(java.time.ZoneId.of("Asia/Seoul"));
        Map<String,String> row=Map.of("BankAccountNum","1234567890","TransRefKey","auto-1","TransDT",today.format(java.time.format.DateTimeFormatter.BASIC_ISO_DATE)+"123400","Deposit","100","Withdraw","0","Balance","100");
        org.mockito.Mockito.when(client.transactions("1234567890",today.minusDays(90),today)).thenReturn(List.of(row));
        scheduler.sync();scheduler.sync();
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM accounting_bank_transactions",Integer.class));
        assertNotNull(service.accounts().get(0).get("last_sync_at"));
        var result=service.transactions(false,today,today,null,1);
        assertEquals(today+"T12:34",((List<Map<String,Object>>)result.get("rows")).get(0).get("trans_at"));
    }
    @Test void legacyFileRemovalIsRecoverableAndRollbackIsAtomicWhenLinked() throws Exception {
        var parsed=parser.parse(CardExcelParserTest.workbook(true,"150,000","0","신규",false),"old.xlsx","BC");
        var receipt=service.importCards(parsed,"old.xlsx",1);long id=jdbc.queryForObject("SELECT id FROM accounting_card_transactions",Long.class);
        jdbc.update("DELETE FROM accounting_card_upload_changes");jdbc.update("DELETE FROM accounting_card_uploads");jdbc.update("UPDATE accounting_card_transactions SET revision=0");
        new ResourceDatabasePopulator(new FileSystemResource("../database/init/015_sessions_sync_history.sql")).execute(jdbc.getDataSource());
        var baseline=service.uploads().get(0);assertEquals(1,((Number)baseline.get("row_count")).intValue());
        jdbc.update("INSERT INTO accounting_ledger_entries(entry_group_key,entry_type,direction,title,entry_date,amount,source_card_transaction_id,created_by,updated_by) VALUES('locked','EXPENSE','OUT','보호','2026-10-06',150000,?,1,1)",id);
        long upload=((Number)baseline.get("id")).longValue();assertThrows(IllegalArgumentException.class,()->service.rollbackUpload(upload,1));
        assertEquals("APPLIED",service.uploads().get(0).get("status"));assertTrue(service.removedCards().isEmpty());
        jdbc.update("DELETE FROM accounting_ledger_entries");service.rollbackUpload(upload,1);assertEquals(1,service.removedCards().size());service.removeCard(id,true,1);assertTrue(service.removedCards().isEmpty());
    }
}
