package com.pentaworks.intranet.accounting;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TaxInvoiceService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final TaxInvoiceClient remote;
    private final TransactionTemplate tx;
    public TaxInvoiceService(JdbcTemplate jdbc,ObjectMapper mapper,TaxInvoiceClient remote,PlatformTransactionManager manager){this.jdbc=jdbc;this.mapper=mapper;this.remote=remote;tx=new TransactionTemplate(manager);}
    public boolean ready(){return jdbc.queryForObject("SELECT COUNT(*) FROM schema_migrations WHERE version='017_tax_invoices'",Integer.class)==1;}
    private void require(){if(!ready())throw new IllegalArgumentException("세금계산서 DB 업데이트가 필요합니다.");}
    public Map<String,Object> settings(){require();var row=jdbc.queryForMap("SELECT profile_json,version FROM accounting_invoice_issuer WHERE id=1");return Map.of("issuer",read(row.get("profile_json"),TaxInvoiceDocument.Party.class),"version",row.get("version"),"issueReady",remote.ready(),"environment",remote.environment());}
    public Map<String,Object> saveIssuer(TaxInvoiceDocument.Party issuer,int version,long user){require();issuer.validate(false);if(!issuer.corpNum().isBlank()&&remote.ready()&&!issuer.corpNum().equals(remote.corpNumber()))throw new IllegalArgumentException("바로빌 연동 사업자번호와 일치해야 합니다.");
        return tx.execute(t->{if(jdbc.update("UPDATE accounting_invoice_issuer SET profile_json=?,version=version+1,updated_by=? WHERE id=1 AND version=?",json(issuer),user,version)!=1)throw conflict();audit(user,"UPDATE","TAX_ISSUER",1);return settings();});}
    public Map<String,Object> importIssuer(int version,long user){
        require();var current=(TaxInvoiceDocument.Party)settings().get("issuer");var imported=remote.registeredIssuer(current);
        // Keep the explicitly saved invoice contact when refreshing registered company details.
        var merged=new TaxInvoiceDocument.Party(imported.corpNum(),imported.corpName(),imported.ceoName(),imported.addr(),imported.bizType(),imported.bizClass(),
            current.contactName().isBlank()?imported.contactName():current.contactName(),current.email().isBlank()?imported.email():current.email(),
            current.tel().isBlank()?imported.tel():current.tel(),imported.taxRegId(),current.hp().isBlank()?imported.hp():current.hp());
        return saveIssuer(merged,version,user);
    }
    public List<Map<String,Object>> customers(String keyword){
        require();String q="%"+keyword.trim()+"%";List<Map<String,Object>> result=new ArrayList<>();Set<String> seen=new HashSet<>();
        for(var row:jdbc.queryForList("SELECT id,document_json FROM accounting_tax_invoices WHERE customer_name LIKE ? OR customer_business_no LIKE ? ORDER BY id DESC LIMIT 100",q,q)){
            var party=read(row.get("document_json"),TaxInvoiceDocument.class).customer();String key=party.corpNum()+"|"+party.corpName();
            if(seen.add(key))result.add(Map.of("id","invoice-"+row.get("id"),"name",party.corpName(),"business_no",party.corpNum(),"party",party));
            if(result.size()==40)return result;
        }
        for(var row:jdbc.queryForList("SELECT id,name,business_no FROM accounting_counterparties WHERE active=1 AND (name LIKE ? OR business_no LIKE ?) ORDER BY name LIMIT 40",q,q)){
            if(seen.add(String.valueOf(row.getOrDefault("business_no",""))+"|"+row.get("name"))){row.put("id","party-"+row.get("id"));result.add(row);}
            if(result.size()==40)break;
        }
        return result;
    }
    public List<TaxInvoiceDocument.Item> products(String keyword){
        require();var result=new ArrayList<TaxInvoiceDocument.Item>();Set<String> seen=new HashSet<>();
        for(var row:jdbc.queryForList("SELECT document_json FROM accounting_tax_invoices ORDER BY id DESC LIMIT 200")){
            for(var item:read(row.get("document_json"),TaxInvoiceDocument.class).items()){
                if(item.name().toLowerCase(Locale.ROOT).contains(keyword.toLowerCase(Locale.ROOT))&&seen.add(item.name()+"|"+item.specification()))result.add(item);
                if(result.size()==40)return result;
            }
        }
        return result;
    }
    public Map<String,Object> list(LocalDate from,LocalDate to,String keyword,String status,int page){return list(from,to,keyword,status,page,"");}
    public Map<String,Object> list(LocalDate from,LocalDate to,String keyword,String status,int page,String condition){require();BarobillClient.checkDates(from,to);if(page<1||page>10000||keyword.length()>200||!Set.of("","DRAFT","ISSUED","FAILED","UNKNOWN","SENDING").contains(status))throw new IllegalArgumentException("조회 조건을 확인해주세요.");
        String column=switch(condition){case "corpName"->"customer_name";case "corpNum"->"customer_business_no";case "mgtNum"->"CONVERT(mgt_key USING utf8mb4)";case ""->null;default->throw new IllegalArgumentException("검색 조건을 확인해주세요.");};
        String search=column==null?"(customer_name LIKE ? OR customer_business_no LIKE ? OR CONVERT(mgt_key USING utf8mb4) LIKE ?)":column+" LIKE ?";
        String where=" WHERE write_date BETWEEN ? AND ? AND "+search+" AND (?='' OR status=?)";String q="%"+keyword.trim()+"%";Object[] params=column==null?new Object[]{from,to,q,q,q,status,status}:new Object[]{from,to,q,status,status};
        var args=new ArrayList<Object>(Arrays.asList(params));args.add((page-1)*30);
        var rows=jdbc.queryForList("SELECT id,mgt_key,write_date,customer_name,customer_business_no,supply_amount,tax_amount,total_amount,status,environment,nts_state,nts_key,error_message,version FROM accounting_tax_invoices"+where+" ORDER BY write_date DESC,id DESC LIMIT 30 OFFSET ?",args.toArray());
        return Map.of("rows",rows,"total",jdbc.queryForObject("SELECT COUNT(*) FROM accounting_tax_invoices"+where,Long.class,params));
    }
    public Map<String,Object> detail(long id){require();var rows=jdbc.queryForList("SELECT * FROM accounting_tax_invoices WHERE id=?",id);if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"세금계산서를 찾을 수 없습니다.");var row=rows.get(0);row.put("issuer",read(row.remove("issuer_json"),TaxInvoiceDocument.Party.class));row.put("document",read(row.remove("document_json"),TaxInvoiceDocument.class));row.remove("request_key");return row;}
    public Map<String,Object> save(Long id,String requestKey,int version,TaxInvoiceDocument document,long user){require();var totals=document.validate(false);
        if(requestKey==null||!requestKey.matches("[0-9a-fA-F-]{36}"))throw new IllegalArgumentException("저장 요청 키가 올바르지 않습니다.");
        return tx.execute(t->{
            if(id==null){var found=jdbc.queryForList("SELECT id,document_json FROM accounting_tax_invoices WHERE request_key=?",requestKey);if(!found.isEmpty()){if(!read(found.get(0).get("document_json"),TaxInvoiceDocument.class).equals(document))throw conflict();return detail(((Number)found.get(0).get("id")).longValue());}}
            var issuer=settings().get("issuer");
            long saved;
            if(id==null){String key="PW"+UUID.randomUUID().toString().replace("-","").substring(0,22);jdbc.update("INSERT INTO accounting_tax_invoices(request_key,mgt_key,write_date,customer_name,customer_business_no,issuer_json,document_json,supply_amount,tax_amount,total_amount,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",requestKey,key,document.writeDate(),document.customer().corpName(),document.customer().corpNum(),json(issuer),json(document),totals.supply(),totals.tax(),totals.total(),user,user);saved=jdbc.queryForObject("SELECT id FROM accounting_tax_invoices WHERE request_key=?",Long.class,requestKey);}
            else {if(jdbc.update("UPDATE accounting_tax_invoices SET write_date=?,customer_name=?,customer_business_no=?,issuer_json=?,document_json=?,supply_amount=?,tax_amount=?,total_amount=?,version=version+1,updated_by=? WHERE id=? AND version=? AND status='DRAFT'",document.writeDate(),document.customer().corpName(),document.customer().corpNum(),json(issuer),json(document),totals.supply(),totals.tax(),totals.total(),user,id,version)!=1)throw conflict();saved=id;}
            audit(user,id==null?"CREATE":"UPDATE","TAX_INVOICE",saved);return detail(saved);
        });
    }
    public Map<String,Object> issue(long id,int version,long user){require();if(!remote.ready())throw new IllegalArgumentException("바로빌 연동 설정이 필요합니다.");
        Map<String,Object> claimed=tx.execute(t->{var row=detail(id);if(!"DRAFT".equals(row.get("status"))||((Number)row.get("version")).intValue()!=version)throw conflict();var doc=(TaxInvoiceDocument)row.get("document");var issuer=(TaxInvoiceDocument.Party)row.get("issuer");doc.validate(true);issuer.validate(true);if(issuer.contactName().isBlank())throw new IllegalArgumentException("공급자 담당자명을 입력해주세요.");if(issuer.corpNum().equals(doc.customer().corpNum()))throw new IllegalArgumentException("공급자와 공급받는자의 사업자번호가 같습니다.");if(!issuer.corpNum().equals(remote.corpNumber()))throw new IllegalArgumentException("공급자와 바로빌 연동 사업자번호가 다릅니다.");
            if(jdbc.update("UPDATE accounting_tax_invoices SET status='SENDING',environment=?,version=version+1,updated_by=? WHERE id=? AND status='DRAFT' AND version=?",remote.environment(),user,id,version)!=1)throw conflict();audit(user,"UPDATE","TAX_INVOICE",id);return row;});
        try{int result=remote.issue(String.valueOf(claimed.get("mgt_key")),(TaxInvoiceDocument)claimed.get("document"),(TaxInvoiceDocument.Party)claimed.get("issuer"));
            String state=result==1?"ISSUED":result<0&&result!=-11024?"FAILED":"UNKNOWN";jdbc.update("UPDATE accounting_tax_invoices SET status=?,error_message=?,version=version+1 WHERE id=? AND status='SENDING'",state,result==1?null:"바로빌 응답 코드: "+result,id);
        }catch(RuntimeException e){jdbc.update("UPDATE accounting_tax_invoices SET status='UNKNOWN',error_message=?,version=version+1 WHERE id=? AND status='SENDING'","발급 결과를 확인하지 못했습니다. 중복 발급을 막기 위해 상태 조회 후 확인해주세요.",id);}
        return detail(id);
    }
    public Map<String,Object> sync(long id,long user){require();var row=detail(id);if("DRAFT".equals(row.get("status")))throw new IllegalArgumentException("임시저장 문서는 아직 발급되지 않았습니다.");if(!remote.environment().equals(row.get("environment")))throw new IllegalArgumentException("발급 당시와 바로빌 연동 환경이 다릅니다.");
        var issuer=(TaxInvoiceDocument.Party)row.get("issuer");if(!issuer.corpNum().equals(remote.corpNumber()))throw new IllegalArgumentException("발급 당시 사업자번호와 현재 연동 사업자번호가 다릅니다.");
        var state=remote.state(String.valueOf(row.get("mgt_key")));boolean issued=!state.get("IssueDT").isBlank();
        tx.executeWithoutResult(t->{jdbc.update("UPDATE accounting_tax_invoices SET status=IF(?,'ISSUED',status),remote_state=?,nts_state=?,nts_key=?,error_message=?,version=version+1,updated_by=? WHERE id=?",issued,state.get("BarobillState"),state.get("NTSSendState"),state.get("NTSSendKey"),issued?null:"바로빌 상태를 확인해주세요. 자동 재발급하지 않습니다.",user,id);audit(user,"UPDATE","TAX_INVOICE",id);});return detail(id);
    }
    private void audit(long user,String action,String target,long id){jdbc.update("INSERT INTO audit_logs(user_id,action,target_type,target_id) VALUES(?,?,?,?)",user,action,target,id);}
    private String json(Object value){try{return mapper.writeValueAsString(value);}catch(Exception e){throw new IllegalArgumentException("저장할 문서 형식이 올바르지 않습니다.");}}
    private <T>T read(Object value,Class<T> type){try{return mapper.readValue(String.valueOf(value),type);}catch(Exception e){throw new IllegalArgumentException("저장된 세금계산서를 읽지 못했습니다.");}}
    private static ResponseStatusException conflict(){return new ResponseStatusException(HttpStatus.CONFLICT,"문서가 변경되었거나 이미 처리되었습니다. 새로고침 후 확인해주세요.");}
}
