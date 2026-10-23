package com.pentaworks.intranet.accounting;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named="ACCOUNTING_TEST_DB_URL", matches="jdbc:mariadb://127\\.0\\.0\\.1:[0-9]+/mysql")
class TaxInvoiceDatabaseTest {
    JdbcTemplate admin,jdbc;String db;TaxInvoiceService service;TaxInvoiceClient remote;
    @BeforeEach void setup(){String url=System.getenv("ACCOUNTING_TEST_DB_URL");admin=new JdbcTemplate(new DriverManagerDataSource(url,"root",""));db="tax_api_test_"+UUID.randomUUID().toString().replace("-","");admin.execute("CREATE DATABASE "+db);
        var data=new DriverManagerDataSource(url.replace("/mysql","/"+db),"root","");jdbc=new JdbcTemplate(data);
        var scripts=new ResourceDatabasePopulator();for(String s:List.of("001_schema.sql","002_service_schema.sql","013_accounting.sql","017_tax_invoices.sql"))scripts.addScript(new FileSystemResource("../database/init/"+s));scripts.execute(data);
        jdbc.update("INSERT INTO users(id,login_id,password_hash,name,role) VALUES(1,'test','test','테스트','ACCOUNTING')");
        remote=mock(TaxInvoiceClient.class);when(remote.ready()).thenReturn(true);when(remote.environment()).thenReturn("test");when(remote.corpNumber()).thenReturn("6758700483");
        service=new TaxInvoiceService(jdbc,new ObjectMapper().findAndRegisterModules(),remote,new DataSourceTransactionManager(data));service.saveIssuer(TaxInvoiceDocumentTest.party(),0,1);
    }
    @AfterEach void cleanup(){if(admin!=null&&db!=null)admin.execute("DROP DATABASE "+db);}
    Map<String,Object> save(){return service.save(null,UUID.randomUUID().toString(),0,TaxInvoiceDocumentTest.doc(1,"3","100.1"),1);}
    @Test void saveRetryIsIdempotentAndStaleEditsCannotOverwrite(){String key=UUID.randomUUID().toString();var doc=TaxInvoiceDocumentTest.doc(1,"3","100.1");var a=service.save(null,key,0,doc,1);var b=service.save(null,key,0,doc,1);assertEquals(a.get("id"),b.get("id"));assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM accounting_tax_invoices",Integer.class));long id=((Number)a.get("id")).longValue();service.save(id,key,0,doc,1);assertThrows(RuntimeException.class,()->service.save(id,key,0,doc,1));assertEquals("DRAFT",service.detail(id).get("status"));}
    @Test void issueIsSingleClaimAndUsesStoredIssuer(){var row=save();long id=((Number)row.get("id")).longValue();when(remote.issue(anyString(),any(),any())).thenReturn(1);var old=TaxInvoiceDocumentTest.party();var changed=new TaxInvoiceDocument.Party(old.corpNum(),old.corpName(),old.ceoName(),old.addr(),old.bizType(),old.bizClass(),"새 담당자","new@example.com",old.tel(),old.taxRegId());service.saveIssuer(changed,1,1);var issued=service.issue(id,0,1);assertEquals("ISSUED",issued.get("status"));assertEquals("test",issued.get("environment"));assertEquals(row.get("issuer"),issued.get("issuer"));assertThrows(RuntimeException.class,()->service.issue(id,0,1));assertThrows(RuntimeException.class,()->service.save(id,UUID.randomUUID().toString(),2,TaxInvoiceDocumentTest.doc(1,"2","100"),1));verify(remote,times(1)).issue(anyString(),any(),any());}
    @Test void uncertainResultCannotBeRetriedAndCanBeReconciled(){var row=save();long id=((Number)row.get("id")).longValue();when(remote.issue(anyString(),any(),any())).thenThrow(new BarobillClient.UpstreamException("timeout"));assertEquals("UNKNOWN",service.issue(id,0,1).get("status"));assertThrows(RuntimeException.class,()->service.issue(id,2,1));when(remote.state(anyString())).thenReturn(Map.of("BarobillState","3000","NTSSendState","2","NTSSendKey","test-nts","NTSSendResult","","IssueDT","20260120120000"));var synced=service.sync(id,1);assertEquals("ISSUED",synced.get("status"));assertEquals("test-nts",synced.get("nts_key"));verify(remote,times(1)).issue(anyString(),any(),any());}
    @Test void failureAndDuplicateResponsesDoNotEnableAnotherIssue(){
        var row=save();long id=((Number)row.get("id")).longValue();when(remote.issue(anyString(),any(),any())).thenReturn(-11024);assertEquals("UNKNOWN",service.issue(id,0,1).get("status"));assertThrows(RuntimeException.class,()->service.issue(id,2,1));
        var other=save();long otherId=((Number)other.get("id")).longValue();when(remote.issue(anyString(),any(),any())).thenReturn(-11009);assertEquals("FAILED",service.issue(otherId,0,1).get("status"));assertThrows(RuntimeException.class,()->service.issue(otherId,2,1));
    }
    @Test void editedIssuerIsSavedForOneDocumentAndUsedForIssue(){
        var doc=TaxInvoiceDocumentTest.doc(1,"3","100.1");var original=(TaxInvoiceDocument.Party)service.settings().get("issuer");
        var edited=new TaxInvoiceDocument.Party(original.corpNum(),original.corpName(),original.ceoName(),original.addr(),original.bizType(),original.bizClass(),"별도 담당자","invoice@example.com",original.tel(),original.taxRegId(),"01012345678");
        String key=UUID.randomUUID().toString();var saved=service.save(null,key,0,doc,edited,1);long id=((Number)saved.get("id")).longValue();
        assertEquals(edited,saved.get("issuer"));assertEquals(original,service.settings().get("issuer"));
        assertEquals(id,((Number)service.save(null,key,0,doc,edited,1).get("id")).longValue());
        assertThrows(RuntimeException.class,()->service.save(null,key,0,doc,original,1));
        var changedDefault=new TaxInvoiceDocument.Party(original.corpNum(),original.corpName(),original.ceoName(),original.addr(),original.bizType(),original.bizClass(),"다른 기본 담당자","default@example.com",original.tel(),original.taxRegId());
        service.saveIssuer(changedDefault,1,1);
        var resaved=service.save(id,key,0,doc,1);assertEquals(edited,resaved.get("issuer"));
        when(remote.issue(anyString(),any(),any())).thenReturn(1);service.issue(id,1,1);
        verify(remote).issue(anyString(),eq(doc),eq(edited));
        assertThrows(RuntimeException.class,()->service.save(id,key,3,doc,original,1));
        assertEquals(edited,service.detail(id).get("issuer"));assertEquals(changedDefault,service.settings().get("issuer"));
    }
    @Test void documentIssuerCannotSwitchTheLinkedBusiness(){
        var p=TaxInvoiceDocumentTest.party();var other=new TaxInvoiceDocument.Party("1234567891","다른 회사",p.ceoName(),p.addr(),p.bizType(),p.bizClass(),p.contactName(),p.email(),p.tel(),p.taxRegId());
        assertThrows(IllegalArgumentException.class,()->service.save(null,UUID.randomUUID().toString(),0,TaxInvoiceDocumentTest.doc(1,"1","100"),other,1));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM accounting_tax_invoices",Integer.class));
    }
    @Test void requestedIssuerDefaultsSurviveImportAndMigrationRerun(){
        var source=new DriverManagerDataSource(System.getenv("ACCOUNTING_TEST_DB_URL").replace("/mysql","/"+db),"root","");
        var migration=new ResourceDatabasePopulator(new FileSystemResource("../database/init/018_invoice_issuer_contact.sql"));migration.execute(source);
        var settings=service.settings();var issuer=(TaxInvoiceDocument.Party)settings.get("issuer");
        assertEquals("조재영",issuer.contactName());assertEquals("jycho@pentaworks.net",issuer.email());assertEquals("01038998786",issuer.tel());assertEquals("01038998786",issuer.hp());
        when(remote.registeredIssuer(any())).thenReturn(TaxInvoiceDocumentTest.party());
        service.importIssuer(((Number)settings.get("version")).intValue(),1);
        assertEquals(issuer.contactName(),((TaxInvoiceDocument.Party)service.settings().get("issuer")).contactName());
        assertEquals(issuer.email(),((TaxInvoiceDocument.Party)service.settings().get("issuer")).email());
        int version=((Number)service.settings().get("version")).intValue();migration.execute(source);
        assertEquals(version,((Number)service.settings().get("version")).intValue());
    }
    @Test void originalUiSearchFieldsAndProductPickerUseSavedData(){
        var row=save();var doc=TaxInvoiceDocumentTest.doc(1,"3","100.1");
        assertEquals(1L,service.list(doc.writeDate(),doc.writeDate(),"PW","",1,"mgtNum").get("total"));
        assertEquals(0L,service.list(doc.writeDate(),doc.writeDate(),"PW","",1,"corpName").get("total"));
        assertEquals(1L,service.list(doc.writeDate(),doc.writeDate(),"1234567891","",1,"corpNum").get("total"));
        assertEquals("유지보수",service.products("유지").get(0).name());
        assertTrue(service.products("없는품목").isEmpty());
        assertThrows(IllegalArgumentException.class,()->service.list(doc.writeDate(),doc.writeDate(),"PW","",1,"invalid"));
        var old=doc.customer();var party=new TaxInvoiceDocument.Party(old.corpNum(),old.corpName(),old.ceoName(),old.addr(),old.bizType(),old.bizClass(),old.contactName(),old.email(),old.tel(),old.taxRegId(),"010-1234-5678");
        var updated=service.save(((Number)row.get("id")).longValue(),UUID.randomUUID().toString(),0,new TaxInvoiceDocument(doc.writeDate(),doc.taxType(),doc.purposeType(),party,doc.remark(),doc.items()),1);
        assertEquals("010-1234-5678",((TaxInvoiceDocument)updated.get("document")).customer().hp());
    }
    @Test void listFiltersAreAppliedAndSchemaIsRerunnable(){save();var d=TaxInvoiceDocumentTest.doc(1,"3","100.1");assertEquals(1L,service.list(d.writeDate(),d.writeDate(),"테스트","DRAFT",1).get("total"));assertEquals("테스트 거래처",service.customers("테스트").get(0).get("name"));assertNotNull(service.customers("테스트").get(0).get("party"));assertEquals(0L,service.list(d.writeDate(),d.writeDate(),"다른 거래처","",1).get("total"));var data=new DriverManagerDataSource(System.getenv("ACCOUNTING_TEST_DB_URL").replace("/mysql","/"+db),"root","");new ResourceDatabasePopulator(new FileSystemResource("../database/init/017_tax_invoices.sql")).execute(data);assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM accounting_tax_invoices",Integer.class));}
}
