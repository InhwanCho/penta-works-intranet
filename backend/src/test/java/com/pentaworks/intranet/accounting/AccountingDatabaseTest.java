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
        var scripts=new ResourceDatabasePopulator();for(String s:List.of("001_schema.sql","002_service_schema.sql","013_accounting.sql","014_accounting_import.sql","015_sessions_sync_history.sql"))scripts.addScript(new FileSystemResource("../database/init/"+s));scripts.execute(data);
        jdbc.update("INSERT INTO users(id,login_id,password_hash,name,role) VALUES(1,'test','test','테스트','ACCOUNTING')");
        String key=Base64.getEncoder().encodeToString(new byte[32]);service=new AccountingService(jdbc,new ObjectMapper().findAndRegisterModules(),new AccountCrypto(key,key),new DataSourceTransactionManager(data));
    }
    @AfterEach void cleanup(){if(admin!=null && db!=null)admin.execute("DROP DATABASE "+db);}
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
