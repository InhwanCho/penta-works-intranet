package com.pentaworks.intranet.accounting;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
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
    public Map<String,Object> saveCustomer(TaxInvoiceDocument.Party party, Integer version, long user) {
        require();
        if(party==null || party.corpName().isBlank() || !TaxInvoiceDocument.validBusinessNo(party.corpNum()))throw new IllegalArgumentException("상호와 올바른 사업자번호를 입력해주세요.");
        party.validate(false);
        return tx.execute(t -> {
            var found=jdbc.queryForList("SELECT id,version FROM accounting_invoice_customers WHERE business_no=? AND tax_reg_id=? FOR UPDATE",party.corpNum(),party.taxRegId());
            long id;
            if(found.isEmpty()) {
                if(version!=null)throw conflict();
                jdbc.update("INSERT INTO accounting_invoice_customers(business_no,tax_reg_id,name,party_json,updated_by) VALUES(?,?,?,?,?)",party.corpNum(),party.taxRegId(),party.corpName(),json(party),user);
                id=jdbc.queryForObject("SELECT id FROM accounting_invoice_customers WHERE business_no=? AND tax_reg_id=?",Long.class,party.corpNum(),party.taxRegId());
            } else {
                id=((Number)found.get(0).get("id")).longValue();
                if(version==null || jdbc.update("UPDATE accounting_invoice_customers SET name=?,party_json=?,updated_by=?,version=version+1 WHERE id=? AND version=?",party.corpName(),json(party),user,id,version)!=1)throw new ResponseStatusException(HttpStatus.CONFLICT,"이미 등록되었거나 변경된 거래처입니다. 검색해서 다시 불러온 뒤 수정해주세요.");
            }
            audit(user,"UPDATE","INVOICE_CUSTOMER",id);
            return Map.of("id","saved-"+id,"party",party);
        });
    }
    private static final int CUSTOMER_PAGE_SIZE = 10;
    private static final String CUSTOMER_SEARCH = """
        WITH saved AS (
            SELECT id,name,business_no,party_json,version
            FROM accounting_invoice_customers WHERE name LIKE ? OR business_no LIKE ?
        ), invoice_matches AS (
            SELECT id,customer_name AS name,customer_business_no AS business_no,
                   JSON_EXTRACT(document_json,'$.customer') AS party_json,
                   ROW_NUMBER() OVER (
                       PARTITION BY customer_business_no,
                           COALESCE(JSON_UNQUOTE(JSON_EXTRACT(document_json,'$.customer.taxRegId')),''),
                           CASE WHEN customer_business_no='' THEN customer_name ELSE '' END
                       ORDER BY updated_at DESC,id DESC
                   ) AS recipient_rank
            FROM accounting_tax_invoices WHERE customer_name LIKE ? OR customer_business_no LIKE ?
        ), history AS (
            SELECT id,name,business_no,party_json FROM invoice_matches WHERE recipient_rank=1
        ), directory AS (
            SELECT id,name,COALESCE(REPLACE(business_no,'-',''),'') AS business_no
            FROM accounting_counterparties WHERE active=1
        ), directory_matches AS (
            SELECT id,name,business_no,
                   ROW_NUMBER() OVER (PARTITION BY business_no,CASE WHEN business_no='' THEN name ELSE '' END
                                      ORDER BY name,id) AS recipient_rank
            FROM directory d WHERE (name LIKE ? OR business_no LIKE ?)
                AND (business_no='' OR (
                    NOT EXISTS (SELECT 1 FROM saved s WHERE s.business_no=d.business_no)
                    AND NOT EXISTS (SELECT 1 FROM history h WHERE h.business_no=d.business_no)
                ))
        ), recipients AS (
            SELECT id,name,business_no,party_json,version,1 AS source_order FROM saved
            UNION ALL
            SELECT id,name,business_no,party_json,NULL,2 FROM history
            UNION ALL
            SELECT id,name,business_no,NULL,NULL,3 FROM directory_matches WHERE recipient_rank=1
        )
        """;

    public record CustomerPage(List<Map<String,Object>> rows,long total,int page,int pageSize) {}

    @Transactional(readOnly=true)
    public CustomerPage customers(String keyword,int page) {
        require();
        if(keyword.length()>200 || page<1)throw new IllegalArgumentException("검색어와 페이지를 확인해주세요.");
        String query = "%"+keyword.trim()+"%";
        String digits = keyword.replaceAll("[^0-9]", "");
        String number = digits.isEmpty() ? query : "%"+digits+"%";
        long total = jdbc.queryForObject(CUSTOMER_SEARCH+"SELECT COUNT(*) FROM recipients",Long.class,
            query,number,query,number,query,number);
        int lastPage = Math.toIntExact(Math.max(1,(total+CUSTOMER_PAGE_SIZE-1)/CUSTOMER_PAGE_SIZE));
        int currentPage = Math.min(page,lastPage);
        var rows = jdbc.queryForList(CUSTOMER_SEARCH+"""
            SELECT id,name,business_no,party_json,version,source_order FROM recipients
            ORDER BY source_order,name,id LIMIT ? OFFSET ?
            """,query,number,query,number,query,number,CUSTOMER_PAGE_SIZE,(long)(currentPage-1)*CUSTOMER_PAGE_SIZE);
        return new CustomerPage(rows.stream().map(this::customerResult).toList(),total,currentPage,CUSTOMER_PAGE_SIZE);
    }

    private Map<String,Object> customerResult(Map<String,Object> row) {
        String name = (String)row.get("name");
        String businessNo = (String)row.get("business_no");
        int source = ((Number)row.get("source_order")).intValue();
        var party = source==3 ? new TaxInvoiceDocument.Party(businessNo,name,"","","","","","","","")
            : read(row.get("party_json"),TaxInvoiceDocument.Party.class);
        Map<String,Object> result = new LinkedHashMap<>();
        result.put("id",(source==1 ? "saved-" : source==2 ? "invoice-" : "party-")+row.get("id"));
        result.put("name",name);
        result.put("business_no",businessNo);
        result.put("party",party);
        result.put("source",source==1 ? "saved" : source==2 ? "history" : "directory");
        if(source==1)result.put("version",row.get("version"));
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
    public Map<String,Object> list(LocalDate from,LocalDate to,String keyword,String status,int page,String condition){require();BarobillClient.checkDates(from,to);if(page<1||page>10000||keyword.length()>200||!Set.of("","DRAFT","ISSUED","FAILED","UNKNOWN","SENDING","SCHEDULED","CORRECTION_READY","CANCELLED").contains(status))throw new IllegalArgumentException("조회 조건을 확인해주세요.");
        String column=switch(condition){case "corpName"->"customer_name";case "corpNum"->"customer_business_no";case "mgtNum"->"CONVERT(mgt_key USING utf8mb4)";case ""->null;default->throw new IllegalArgumentException("검색 조건을 확인해주세요.");};
        String search=column==null?"(customer_name LIKE ? OR customer_business_no LIKE ? OR CONVERT(mgt_key USING utf8mb4) LIKE ?)":column+" LIKE ?";
        String where=" WHERE write_date BETWEEN ? AND ? AND "+search+" AND (?='' OR status=?)";String q="%"+keyword.trim()+"%";Object[] params=column==null?new Object[]{from,to,q,q,q,status,status}:new Object[]{from,to,q,status,status};
        var args=new ArrayList<Object>(Arrays.asList(params));args.add((page-1)*30);
        var rows=jdbc.queryForList("SELECT id,original_id,correction_code,mgt_key,write_date,scheduled_date,DATE_FORMAT(issued_at,'%Y-%m-%d %H:%i') AS issue_minute,customer_name,customer_business_no,supply_amount,tax_amount,total_amount,status,environment,nts_state,nts_key,error_message,version FROM accounting_tax_invoices"+where+" ORDER BY write_date DESC,id DESC LIMIT 30 OFFSET ?",args.toArray());
        return Map.of("rows",rows,"total",jdbc.queryForObject("SELECT COUNT(*) FROM accounting_tax_invoices"+where,Long.class,params));
    }
    public Map<String,Object> detail(long id){require();var rows=jdbc.queryForList("SELECT * FROM accounting_tax_invoices WHERE id=?",id);if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"세금계산서를 찾을 수 없습니다.");var row=rows.get(0);row.put("issuer",read(row.remove("issuer_json"),TaxInvoiceDocument.Party.class));row.put("document",read(row.remove("document_json"),TaxInvoiceDocument.class));row.remove("request_key");
        row.put("corrections",jdbc.queryForList("SELECT id,correction_group,correction_part,correction_code,status,total_amount FROM accounting_tax_invoices WHERE original_id=? ORDER BY id",id));
        return row;}
    public Map<String,Object> save(Long id,String requestKey,int version,TaxInvoiceDocument document,long user){return save(id,requestKey,version,document,null,user);}
    public Map<String,Object> save(Long id,String requestKey,int version,TaxInvoiceDocument document,TaxInvoiceDocument.Party requestedIssuer,long user){require();var totals=document.validate(false);
        if(requestKey==null||!requestKey.matches("[0-9a-fA-F-]{36}"))throw new IllegalArgumentException("저장 요청 키가 올바르지 않습니다.");
        return tx.execute(t->{
            if(id==null){var found=jdbc.queryForList("SELECT id,document_json FROM accounting_tax_invoices WHERE request_key=?",requestKey);if(!found.isEmpty()){if(!read(found.get(0).get("document_json"),TaxInvoiceDocument.class).equals(document))throw conflict();var existing=detail(((Number)found.get(0).get("id")).longValue());if(requestedIssuer!=null&&!requestedIssuer.equals(existing.get("issuer")))throw conflict();return existing;}}
            var existing = id == null ? null : detail(id);
            var issuer=requestedIssuer!=null?requestedIssuer:(TaxInvoiceDocument.Party)(existing==null?settings():existing).get("issuer");
            if(existing!=null && "SCHEDULED".equals(existing.get("status"))) validateIssue(document,issuer);
            issuer.validate(false);
            if(remote.ready()&&!issuer.corpNum().isBlank()&&!issuer.corpNum().equals(remote.corpNumber()))throw new IllegalArgumentException("공급자 사업자번호는 바로빌 연동 사업자와 일치해야 합니다.");
            long saved;
            if(id==null){String key="PW"+UUID.randomUUID().toString().replace("-","").substring(0,22);jdbc.update("INSERT INTO accounting_tax_invoices(request_key,mgt_key,write_date,customer_name,customer_business_no,issuer_json,document_json,supply_amount,tax_amount,total_amount,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",requestKey,key,document.writeDate(),document.customer().corpName(),document.customer().corpNum(),json(issuer),json(document),totals.supply(),totals.tax(),totals.total(),user,user);saved=jdbc.queryForObject("SELECT id FROM accounting_tax_invoices WHERE request_key=?",Long.class,requestKey);}
            else {if(jdbc.update("UPDATE accounting_tax_invoices SET write_date=?,customer_name=?,customer_business_no=?,issuer_json=?,document_json=?,supply_amount=?,tax_amount=?,total_amount=?,version=version+1,updated_by=? WHERE id=? AND version=? AND status IN ('DRAFT','SCHEDULED')",document.writeDate(),document.customer().corpName(),document.customer().corpNum(),json(issuer),json(document),totals.supply(),totals.tax(),totals.total(),user,id,version)!=1)throw conflict();saved=id;}
            audit(user,id==null?"CREATE":"UPDATE","TAX_INVOICE",saved);return detail(saved);
        });
    }
    private void validateIssue(TaxInvoiceDocument doc, TaxInvoiceDocument.Party issuer) {
        if (!remote.ready()) throw new IllegalArgumentException("바로빌 연동 설정이 필요합니다.");
        doc.validate(true);
        issuer.validate(true);
        if(issuer.contactName().isBlank())throw new IllegalArgumentException("공급자 담당자명을 입력해주세요.");
        if(issuer.corpNum().equals(doc.customer().corpNum()))throw new IllegalArgumentException("공급자와 공급받는자의 사업자번호가 같습니다.");
        if(!issuer.corpNum().equals(remote.corpNumber()))throw new IllegalArgumentException("공급자와 바로빌 연동 사업자번호가 다릅니다.");
    }
    private static final String DUE_DATE = "DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR)";
    // In Seoul, today's 02:00 becomes due at 17:00 UTC on the previous day.
    public Map<String,Object> schedule(long id,int version,LocalDate date,long user) {
        require();
        if(date==null) throw new IllegalArgumentException("예약 발행일을 선택해주세요.");
        return tx.execute(t -> {
            var row = detail(id);
            validateIssue((TaxInvoiceDocument)row.get("document"), (TaxInvoiceDocument.Party)row.get("issuer"));
            if(jdbc.update("UPDATE accounting_tax_invoices SET status='SCHEDULED',scheduled_date=?,environment=?,updated_by=?,version=version+1 WHERE id=? AND version=? AND status IN ('DRAFT','SCHEDULED') AND ?>DATE(UTC_TIMESTAMP() + INTERVAL 9 HOUR)",
                date,remote.environment(),user,id,version,date)!=1) {
                if(!date.isAfter(LocalDate.now(java.time.ZoneId.of("Asia/Seoul"))))
                    throw new IllegalArgumentException("예약 발급일은 한국시간 기준 내일부터 선택할 수 있습니다.");
                throw conflict();
            }
            audit(user,"UPDATE","TAX_INVOICE",id);
            return detail(id);
        });
    }
    public Map<String,Object> cancelSchedule(long id,int version,long user) {
        return tx.execute(t -> {
            if(jdbc.update("UPDATE accounting_tax_invoices SET status='DRAFT',scheduled_date=NULL,environment=NULL,updated_by=?,version=version+1 WHERE id=? AND version=? AND status='SCHEDULED'",user,id,version)!=1) throw conflict();
            audit(user,"UPDATE","TAX_INVOICE",id);
            return detail(id);
        });
    }
    @org.springframework.scheduling.annotation.Scheduled(cron="0 * * * * *",zone="Asia/Seoul")
    public void dispatchScheduled() {
        if(!remote.ready()) return;
        var due = jdbc.queryForList("SELECT id,version,updated_by FROM accounting_tax_invoices WHERE status='SCHEDULED' AND scheduled_date<="+DUE_DATE+" ORDER BY scheduled_date,id LIMIT 50");
        for(var row : due) {
            long id=((Number)row.get("id")).longValue();
            int version=((Number)row.get("version")).intValue();
            try {
                issue(id,version,((Number)row.get("updated_by")).longValue(),true);
            } catch (ResponseStatusException conflict) {
                if(conflict.getStatusCode()!=HttpStatus.CONFLICT) throw conflict;
            } catch (IllegalArgumentException invalid) {
                jdbc.update("UPDATE accounting_tax_invoices SET status='FAILED',error_message=?,version=version+1 WHERE id=? AND version=? AND status='SCHEDULED'",invalid.getMessage(),id,version);
            }
        }
    }
    public Map<String,Object> issue(long id,int version,long user) {
        return issue(id,version,user,false);
    }
    private Map<String,Object> issue(long id,int version,long user,boolean scheduled) {
        require();
        String expected = scheduled ? "SCHEDULED" : "DRAFT";
        Map<String,Object> claimed=tx.execute(t -> {
            var row=detail(id);
            if(!expected.equals(row.get("status")) || ((Number)row.get("version")).intValue()!=version) throw conflict();
            validateIssue((TaxInvoiceDocument)row.get("document"), (TaxInvoiceDocument.Party)row.get("issuer"));
            if(scheduled && !remote.environment().equals(row.get("environment"))) throw new IllegalArgumentException("예약 당시와 바로빌 연동 환경이 다릅니다.");
            if(jdbc.update("UPDATE accounting_tax_invoices SET status='SENDING',environment=?,version=version+1,updated_by=? WHERE id=? AND status=? AND version=?",remote.environment(),user,id,expected,version)!=1) throw conflict();
            audit(user,"UPDATE","TAX_INVOICE",id);
            return row;
        });
        try{int result=remote.issue(String.valueOf(claimed.get("mgt_key")),(TaxInvoiceDocument)claimed.get("document"),(TaxInvoiceDocument.Party)claimed.get("issuer"));
            String state=result==1?"ISSUED":result<0&&result!=-11024?"FAILED":"UNKNOWN";jdbc.update("UPDATE accounting_tax_invoices SET status=?,issued_at=IF(?,CURRENT_TIMESTAMP,issued_at),error_message=?,version=version+1 WHERE id=? AND status='SENDING'",state,result==1,result==1?null:"바로빌 응답 코드: "+result,id);
        }catch(RuntimeException e){jdbc.update("UPDATE accounting_tax_invoices SET status='UNKNOWN',error_message=?,version=version+1 WHERE id=? AND status='SENDING'","발급 결과를 확인하지 못했습니다. 중복 발급을 막기 위해 상태 조회 후 확인해주세요.",id);}
        return detail(id);
    }
    @org.springframework.scheduling.annotation.Scheduled(cron="0 5,20,35,50 14-19 * * MON-FRI",zone="Asia/Seoul")
    public void refreshPendingTransmissions() {
        if(!remote.ready() || !ready()) return;
        var pending=jdbc.queryForList("""
            SELECT id,updated_by FROM accounting_tax_invoices
            WHERE status='ISSUED' AND environment=? AND COALESCE(nts_state,'') NOT IN ('4','5')
              AND issued_at >= CURRENT_TIMESTAMP - INTERVAL 30 DAY
            ORDER BY updated_at,id LIMIT 20
            """,remote.environment());
        for(var row:pending) {
            try { sync(((Number)row.get("id")).longValue(),((Number)row.get("updated_by")).longValue()); }
            catch(RuntimeException ex) {
                org.slf4j.LoggerFactory.getLogger(TaxInvoiceService.class).warn("Automatic NTS sync failed for invoice {}",row.get("id"));
            }
        }
    }
    public Map<String,Object> sync(long id,long user){require();var row=detail(id);if(Set.of("DRAFT","SCHEDULED").contains(row.get("status")))throw new IllegalArgumentException("아직 발급되지 않은 문서입니다.");if(!remote.environment().equals(row.get("environment")))throw new IllegalArgumentException("발급 당시와 바로빌 연동 환경이 다릅니다.");
        var issuer=(TaxInvoiceDocument.Party)row.get("issuer");if(!issuer.corpNum().equals(remote.corpNumber()))throw new IllegalArgumentException("발급 당시 사업자번호와 현재 연동 사업자번호가 다릅니다.");
        if("SENDING".equals(row.get("status")) && jdbc.queryForObject("SELECT updated_at>CURRENT_TIMESTAMP-INTERVAL 2 MINUTE FROM accounting_tax_invoices WHERE id=?",Boolean.class,id)) throw new IllegalArgumentException("처리 중입니다. 잠시 후 다시 조회해주세요.");
        var state=remote.state(String.valueOf(row.get("mgt_key")));boolean issued=!state.get("IssueDT").isBlank();
        tx.executeWithoutResult(t->{jdbc.update("UPDATE accounting_tax_invoices SET status=CASE WHEN ?='5031' THEN 'CANCELLED' WHEN ? THEN 'ISSUED' WHEN original_id IS NOT NULL AND ?='1000' THEN 'CORRECTION_READY' ELSE status END,registered=IF(original_id IS NOT NULL AND ?='1000',TRUE,registered),issued_at=COALESCE(STR_TO_DATE(NULLIF(?,''),'%Y%m%d%H%i%s'),issued_at),remote_state=?,nts_state=?,nts_key=?,error_message=IF(?,NULL,COALESCE(error_message,?)),version=version+1,updated_by=? WHERE id=? AND version=?",state.get("BarobillState"),issued,state.get("BarobillState"),state.get("BarobillState"),state.get("IssueDT"),state.get("BarobillState"),state.get("NTSSendState"),state.get("NTSSendKey"),issued,"바로빌 상태를 확인해주세요. 자동 재발급하지 않습니다.",user,id,row.get("version"));audit(user,"UPDATE","TAX_INVOICE",id);});return detail(id);
    }
    public void deleteReservation(long id,int version,long user) {
        tx.executeWithoutResult(t->{
            if(jdbc.update("DELETE FROM accounting_tax_invoices WHERE id=? AND status='SCHEDULED' AND version=?",id,version)!=1) throw conflict();
            audit(user,"DELETE","TAX_INVOICE",id);
        });
    }
    private Map<String,String> liveState(Map<String,Object> row) {
        var issuer=(TaxInvoiceDocument.Party)row.get("issuer");
        if(!remote.environment().equals(row.get("environment")) || !issuer.corpNum().equals(remote.corpNumber())) throw new IllegalArgumentException("발급 당시 연동 환경과 사업자번호를 확인해주세요.");
        return remote.state(row.get("mgt_key").toString());
    }
    public Map<String,Object> cancelIssued(long id,int version,long user) {
        var row=detail(id);
        var state=liveState(row);
        if(!"3014".equals(state.get("BarobillState")) || !"1".equals(state.get("NTSSendState"))) throw new IllegalArgumentException("국세청 전송 전인 발급 건만 취소할 수 있습니다. 상태를 조회해주세요.");
        if(jdbc.update("UPDATE accounting_tax_invoices SET status='SENDING',version=version+1,updated_by=? WHERE id=? AND version=? AND status='ISSUED'",user,id,version)!=1) throw conflict();
        String status="UNKNOWN",message="취소 결과를 확인하려면 상태를 조회해주세요.";
        try {
            int result=remote.cancel(row.get("mgt_key").toString());
            if(result==1){status="CANCELLED";message=null;}
            else if(result<0){status="ISSUED";message="발급취소 거절 · 바로빌 코드 "+result;}
        } finally {
            jdbc.update("UPDATE accounting_tax_invoices SET status=?,error_message=?,remote_state=IF(?='CANCELLED','5031',remote_state),version=version+1 WHERE id=? AND status='SENDING'",status,message,status,id);
            audit(user,"UPDATE","TAX_INVOICE",id);
        }
        return detail(id);
    }
    public List<InvoiceCorrection.Part> previewCorrection(long id,InvoiceCorrection req) {
        var row=detail(id);
        if(!"ISSUED".equals(row.get("status")) || !"4".equals(row.get("nts_state")) || ((Number)row.get("correction_sign")).intValue()<0)
            throw new IllegalArgumentException("국세청 전송 완료된 양수 원본을 확인해주세요.");
        return req.plan((TaxInvoiceDocument)row.get("document"));
    }
    public Map<String,Object> correct(long id,InvoiceCorrection req,long user) {
        String group=UUID.fromString(req.requestKey()).toString();
        var row=detail(id);
        var state=liveState(row);
        if(!"4".equals(state.get("NTSSendState")) || !Objects.equals(row.get("nts_key"),state.get("NTSSendKey")) || !state.get("NTSSendKey").matches("[a-zA-Z0-9]{24}")) throw new IllegalArgumentException("원본 승인번호와 전송 상태를 다시 조회해주세요.");
        var parts=previewCorrection(id,req);
        tx.executeWithoutResult(t->{
            if(jdbc.update("UPDATE accounting_tax_invoices SET version=version+1 WHERE id=? AND status='ISSUED' AND version=?",id,req.version())!=1) throw conflict();
            var previous=jdbc.queryForList("SELECT correction_code,status,supply_amount,tax_amount,affected_quantities FROM accounting_tax_invoices WHERE original_id=? AND status<>'CANCELLED'",id);
            if(previous.stream().anyMatch(r->!"ISSUED".equals(r.get("status")) || Set.of(1,4,6).contains(((Number)r.get("correction_code")).intValue())))
                throw new IllegalArgumentException("기존 수정발급 내역과 처리 상태를 확인해주세요.");
            if(!previous.isEmpty() && Set.of(1,4,6).contains(req.code())) throw new IllegalArgumentException("부분 수정 이력이 있어 원본 전액을 상쇄할 수 없습니다. 기존 수정본을 확인해주세요.");
            var remaining=(java.math.BigDecimal)row.get("supply_amount");
            var remainingTax=(java.math.BigDecimal)row.get("tax_amount");
            var original=(TaxInvoiceDocument)row.get("document");
            var available=new ArrayList<>(original.items().stream().map(TaxInvoiceDocument.Item::quantity).toList());
            for(var prior:previous) {
                var supply=(java.math.BigDecimal)prior.get("supply_amount");
                if(((Number)prior.get("correction_code")).intValue()==5 && supply.signum()>0) continue;
                remaining=remaining.add(supply);
                remainingTax=remainingTax.add((java.math.BigDecimal)prior.get("tax_amount"));
                if(prior.get("affected_quantities")!=null) {
                    var used=read(prior.get("affected_quantities"),java.math.BigDecimal[].class);
                    for(int i=0;i<used.length;i++) available.set(i,available.get(i).subtract(used[i]));
                }
            }
            if(parts.get(0).supply().negate().compareTo(remaining)>0 || parts.get(0).tax().negate().compareTo(remainingTax)>0)
                throw new IllegalArgumentException("원본의 남은 공급가액 또는 세액을 초과합니다.");
            boolean partial=req.code()==3 || req.code()==5;
            if(partial) for(int i=0;i<available.size();i++) if(req.quantities().get(i).compareTo(available.get(i))>0)
                throw new IllegalArgumentException("이전에 처리된 수량을 포함해 원본 품목 수량을 초과합니다.");
            int index=0;
            for(var part:parts) {
                var doc=part.document();
                var issuer=(TaxInvoiceDocument.Party)row.get("issuer");
                validateIssue(doc,issuer);
                var child=save(null,UUID.randomUUID().toString(),0,doc,issuer,user);
                jdbc.update("UPDATE accounting_tax_invoices SET status='CORRECTION_READY',original_id=?,correction_code=?,correction_sign=?,correction_group=?,correction_part=?,affected_quantities=?,supply_amount=?,tax_amount=?,total_amount=?,environment=? WHERE id=?",id,req.code(),part.sign(),group,++index,partial && part.sign()<0?json(req.quantities()):null,part.supply(),part.tax(),part.supply().add(part.tax()),remote.environment(),child.get("id"));
            }
        });
        return finishGroup(id,group,user);
    }
    public Map<String,Object> finishGroup(long id,String group,long user) {
        var root=detail(id);
        var latest=liveState(root);
        if(!"4".equals(latest.get("NTSSendState")) || !Objects.equals(root.get("nts_key"),latest.get("NTSSendKey"))) throw conflict();
        var children=jdbc.queryForList("SELECT id FROM accounting_tax_invoices WHERE original_id=? AND correction_group=? ORDER BY correction_part",Long.class,id,group);
        if(children.isEmpty()) throw conflict();
        for(long childId:children) {
            var child=detail(childId);
            if("ISSUED".equals(child.get("status"))) continue;
            if(jdbc.update("UPDATE accounting_tax_invoices SET status='SENDING',version=version+1,updated_by=? WHERE id=? AND version=? AND status IN ('CORRECTION_READY','FAILED')",user,childId,child.get("version"))!=1) break;
            String status="UNKNOWN",error="요청 결과를 확인해주세요.";
            try {
                boolean registered=Boolean.TRUE.equals(child.get("registered")) || "1".equals(String.valueOf(child.get("registered")));
                if(registered && "FAILED".equals(child.get("status"))) {
                    var previous=liveState(child);
                    if("3014".equals(previous.get("BarobillState"))) {status="ISSUED";error=null;continue;}
                    if(!"1000".equals(previous.get("BarobillState"))) throw conflict();
                }
                int result=1;
                if(!registered) {
                    result=remote.registerCorrection(child.get("mgt_key").toString(),(TaxInvoiceDocument)child.get("document"),(TaxInvoiceDocument.Party)child.get("issuer"),root.get("nts_key").toString(),((Number)child.get("correction_code")).intValue(),((Number)child.get("correction_sign")).intValue());
                    if(result==1) jdbc.update("UPDATE accounting_tax_invoices SET registered=TRUE WHERE id=?",childId);
                }
                if(result==1) result=remote.issueRegistered(child.get("mgt_key").toString());
                status=result==1?"ISSUED":result<0 && result!=-11024?"FAILED":"UNKNOWN";
                error=result==1?null:"바로빌 응답 코드: "+result;
            } catch(RuntimeException failure) {
                status="UNKNOWN";
                error="바로빌 응답을 확인하지 못했습니다. 해당 수정본 상세에서 상태를 조회해주세요.";
            } finally {
                jdbc.update("UPDATE accounting_tax_invoices SET status=?,issued_at=IF(?='ISSUED',CURRENT_TIMESTAMP,issued_at),error_message=?,version=version+1 WHERE id=? AND status='SENDING'",status,status,error,childId);
                audit(user,"UPDATE","TAX_INVOICE",childId);
            }
            if(!status.equals("ISSUED")) break;
        }
        return detail(id);
    }
    private void audit(long user,String action,String target,long id){jdbc.update("INSERT INTO audit_logs(user_id,action,target_type,target_id) VALUES(?,?,?,?)",user,action,target,id);}
    private String json(Object value){try{return mapper.writeValueAsString(value);}catch(Exception e){throw new IllegalArgumentException("저장할 문서 형식이 올바르지 않습니다.");}}
    private <T>T read(Object value,Class<T> type){try{return mapper.readValue(String.valueOf(value),type);}catch(Exception e){throw new IllegalArgumentException("저장된 세금계산서를 읽지 못했습니다.");}}
    private static ResponseStatusException conflict(){return new ResponseStatusException(HttpStatus.CONFLICT,"문서가 변경되었거나 이미 처리되었습니다. 새로고침 후 확인해주세요.");}
}
