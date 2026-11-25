package com.pentaworks.intranet.accounting;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CounterpartyLedgerService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    public CounterpartyLedgerService(JdbcTemplate jdbc,ObjectMapper mapper){this.jdbc=jdbc;this.mapper=mapper;}
    public record Input(LocalDate date,String counterparty,String kind,String description,BigDecimal amount,BigDecimal vat,boolean deductible,int version) {}
    public boolean ready(){return jdbc.queryForObject("SELECT COUNT(*) FROM schema_migrations WHERE version='025_counterparty_ledger'",Integer.class)==1;}
    void requireReady(){if(!ready())throw new IllegalArgumentException("거래처 원장 DB 업데이트가 필요합니다.");}
    public Object list(int year,int quarter){
        requireReady();if(year<2000 || year>2100 || quarter<1 || quarter>4)throw new IllegalArgumentException("연도와 분기를 확인해주세요.");
        LocalDate from=LocalDate.of(year,(quarter-1)*3+1,1),to=from.plusMonths(3);
        var rows=jdbc.queryForList("SELECT l.id,DATE_FORMAT(entry_date,'%Y-%m-%d') date,counterparty,kind,description,amount,vat,deductible,l.version,l.invoice_id,i.status invoice_status,i.nts_state,i.deleted_at IS NOT NULL invoice_deleted FROM accounting_counterparty_ledger l LEFT JOIN accounting_tax_invoices i ON i.id=l.invoice_id WHERE voided=FALSE AND entry_date>=? AND entry_date<? ORDER BY entry_date,l.id",from,to);
        var opening=jdbc.queryForList("SELECT counterparty,SUM(CASE WHEN kind='SALE' THEN amount WHEN kind='RECEIPT' THEN -amount ELSE 0 END) receivable,SUM(CASE WHEN kind='PURCHASE' THEN amount WHEN kind='PAYMENT' THEN -amount ELSE 0 END) payable FROM accounting_counterparty_ledger WHERE voided=FALSE AND entry_date<? GROUP BY counterparty",from);
        var parties=jdbc.queryForList("SELECT DISTINCT counterparty FROM accounting_counterparty_ledger WHERE voided=FALSE ORDER BY counterparty",String.class);
        recommendInvoices(rows,from,to);
        return Map.of("rows",rows,"opening",opening,"parties",parties,"from",from.toString(),"to",to.minusDays(1).toString());
    }
    @Transactional(readOnly=true)
    public Object fromPlans(int year,int quarter) {
        if(year<2000 || year>2100 || quarter<1 || quarter>4) throw new IllegalArgumentException("연도와 분기를 확인해주세요.");
        LocalDate from=LocalDate.of(year,(quarter-1)*3+1,1),to=from.plusMonths(3);
        String entries="""
            WITH plans AS (
                SELECT e.id,e.title,e.direction,e.amount,e.planned_date,p.invoice_id,
                       COALESCE(NULLIF(TRIM(p.counterparty_name),''),'거래처 미지정') counterparty
                FROM accounting_cash_plans p JOIN accounting_ledger_entries e ON e.id=p.ledger_entry_id
                WHERE e.status<>'VOID' AND p.card_issuer IS NULL
                  AND CONCAT(p.category_name,' ',e.title) NOT REGEXP '급여|상여|퇴직금|4대보험|사대보험|차입금|대출|예수금|내부이체|계좌간이체|카드대금|법인세|원천세|부가세 납부|부가세 환급'
                  AND (p.certainty='CONFIRMED' OR p.execution_confirmed OR EXISTS (
                      SELECT 1 FROM accounting_payment_allocations a WHERE a.ledger_entry_id=e.id AND a.status='CONFIRMED'))
            ), entries AS (
                SELECT p.id,p.planned_date entry_date,p.counterparty,p.title description,
                       IF(p.direction='IN','SALE','PURCHASE') kind,p.amount,FLOOR(p.amount/11) vat,p.invoice_id
                FROM plans p
                UNION ALL
                SELECT a.id,DATE(a.settled_at),p.counterparty,p.title,
                       IF(p.direction='IN','RECEIPT','PAYMENT'),a.allocated_amount,0,NULL
                FROM plans p JOIN accounting_payment_allocations a ON a.ledger_entry_id=p.id AND a.status='CONFIRMED'
            )
            """;
        var rows=jdbc.queryForList(entries+"""
            SELECT e.id,DATE_FORMAT(entry_date,'%Y-%m-%d') date,counterparty,description,kind,amount,vat,
                   e.invoice_id,i.status invoice_status,i.nts_state,i.deleted_at IS NOT NULL invoice_deleted,
                   IF(kind='PURCHASE',1,0) deductible FROM entries e LEFT JOIN accounting_tax_invoices i ON i.id=e.invoice_id WHERE entry_date>=? AND entry_date<?
            ORDER BY entry_date,kind IN ('RECEIPT','PAYMENT'),e.id
            """,from,to);
        var opening=jdbc.queryForList(entries+"""
            SELECT counterparty,SUM(CASE kind WHEN 'SALE' THEN amount WHEN 'RECEIPT' THEN -amount ELSE 0 END) receivable,
                   SUM(CASE kind WHEN 'PURCHASE' THEN amount WHEN 'PAYMENT' THEN -amount ELSE 0 END) payable
            FROM entries WHERE entry_date<? GROUP BY counterparty HAVING receivable<>0 OR payable<>0
            """,from);
        var parties=new TreeSet<String>();
        for(var row:rows) parties.add((String)row.get("counterparty"));
        for(var row:opening) parties.add((String)row.get("counterparty"));
        recommendInvoices(rows,from,to);
        return Map.of("rows",rows,"opening",opening,"parties",parties,"from",from.toString(),"to",to.minusDays(1).toString());
    }
    private record MatchKey(String month,String party,BigDecimal amount) {
        static MatchKey from(Map<String,Object> row) {
            String party=row.get("counterparty").toString().replaceAll("\\s+","").toLowerCase(Locale.ROOT);
            return new MatchKey(row.get("date").toString().substring(0,7),party,new BigDecimal(row.get("amount").toString()).stripTrailingZeros());
        }
    }
    private void recommendInvoices(List<Map<String,Object>> rows,LocalDate from,LocalDate to) {
        var sales=new HashMap<MatchKey,List<Map<String,Object>>>();
        for(var row:rows) {
            if("SALE".equals(row.get("kind")) && row.get("invoice_id")==null && !"거래처 미지정".equals(row.get("counterparty")))
                sales.computeIfAbsent(MatchKey.from(row),k->new ArrayList<>()).add(row);
        }
        if(sales.isEmpty()) return;
        var invoices=jdbc.queryForList("""
            SELECT i.id,i.write_date date,i.customer_name counterparty,i.total_amount amount FROM accounting_tax_invoices i
            WHERE i.write_date>=? AND i.write_date<? AND i.status='ISSUED' AND i.environment<>'test'
              AND i.deleted_at IS NULL AND i.original_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM accounting_tax_invoices c WHERE c.original_id=i.id AND c.status='ISSUED')
              AND NOT EXISTS (SELECT 1 FROM accounting_cash_plans p WHERE p.invoice_id=i.id)
              AND NOT EXISTS (SELECT 1 FROM accounting_counterparty_ledger l WHERE l.invoice_id=i.id AND l.voided=FALSE)
            """,from,to);
        var matches=new HashMap<MatchKey,List<Long>>();
        for(var invoice:invoices)
            matches.computeIfAbsent(MatchKey.from(invoice),k->new ArrayList<>()).add(((Number)invoice.get("id")).longValue());
        matches.forEach((key,ids)->{
            var candidates=sales.get(key);
            if(ids.size()==1 && candidates!=null && candidates.size()==1)
                candidates.get(0).put("recommended_invoice_id",ids.get(0));
        });
    }
    @Transactional
    public void linkInvoice(long id,boolean plans,Long invoice,Long previous,long user) {
        if(invoice!=null && jdbc.queryForList("SELECT id FROM accounting_tax_invoices WHERE id=? AND status='ISSUED' AND deleted_at IS NULL AND environment<>'test' FOR UPDATE",Long.class,invoice).isEmpty())
            throw new IllegalArgumentException("운영 환경에서 발급한 세금계산서를 선택해주세요.");
        String update=plans
            ? "UPDATE accounting_cash_plans p JOIN accounting_ledger_entries e ON e.id=p.ledger_entry_id SET p.invoice_id=? WHERE e.id=? AND e.direction='IN' AND e.status<>'VOID' AND p.invoice_id <=> ?"
            : "UPDATE accounting_counterparty_ledger SET invoice_id=?,version=version+1 WHERE id=? AND kind='SALE' AND voided=FALSE AND invoice_id <=> ?";
        if(jdbc.update(update,invoice,id,previous)!=1) throw new IllegalArgumentException("원장 연결 상태가 변경되었습니다. 새로고침해주세요.");
        jdbc.update("INSERT INTO audit_logs(user_id,action,target_type,target_id,old_value,new_value) VALUES(?,'UPDATE',?,?,JSON_OBJECT('invoiceId',?),JSON_OBJECT('invoiceId',?))",
            user,plans?"CASH_PLAN":"COUNTERPARTY_LEDGER",id,previous,invoice);
    }
    static void validate(Input p){
        if(p.date()==null || p.date().getYear()<2000 || p.date().getYear()>2100 || p.counterparty()==null || p.counterparty().isBlank() || p.counterparty().length()>200 || p.description()==null || p.description().isBlank() || p.description().length()>500 || !Set.of("SALE","PURCHASE","RECEIPT","PAYMENT").contains(Objects.requireNonNullElse(p.kind(),"")))throw new IllegalArgumentException("일자·거래처·구분·적요를 확인해주세요.");
        CashPlanService.positive(p.amount());
        if(p.vat()==null || p.vat().signum()<0 || p.vat().stripTrailingZeros().scale()>0 || p.vat().compareTo(p.amount())>0)throw new IllegalArgumentException("부가세는 합계금액 이하의 0원 이상 정수여야 합니다.");
        if(Set.of("RECEIPT","PAYMENT").contains(p.kind()) && p.vat().signum()!=0)throw new IllegalArgumentException("수금·지급에는 부가세를 입력할 수 없습니다.");
        if(p.deductible() && !"PURCHASE".equals(p.kind()))throw new IllegalArgumentException("매입에만 공제 여부를 지정할 수 있습니다.");
    }
    @Transactional public Object save(Long id,Input p,long user){
        requireReady();validate(p);
        jdbc.queryForMap("SELECT id FROM users WHERE id=? FOR UPDATE",user);
        Object old=null;
        if(id!=null){old=jdbc.queryForMap("SELECT * FROM accounting_counterparty_ledger WHERE id=? FOR UPDATE",id);if(jdbc.queryForObject("SELECT COUNT(*) FROM accounting_counterparty_ledger WHERE id=? AND version=? AND voided=FALSE",Integer.class,id,p.version())!=1)throw new IllegalArgumentException("다른 변경사항이 있습니다. 새로고침해주세요.");}
        if(id==null){jdbc.update("INSERT INTO accounting_counterparty_ledger(entry_date,counterparty,kind,description,amount,vat,deductible,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?)",p.date(),p.counterparty().trim(),p.kind(),p.description().trim(),p.amount(),p.vat(),p.deductible(),user,user);id=jdbc.queryForObject("SELECT LAST_INSERT_ID()",Long.class);}
        else jdbc.update("UPDATE accounting_counterparty_ledger SET entry_date=?,counterparty=?,kind=?,description=?,amount=?,vat=?,deductible=?,version=version+1,updated_by=? WHERE id=?",p.date(),p.counterparty().trim(),p.kind(),p.description().trim(),p.amount(),p.vat(),p.deductible(),user,id);
        audit(id,user,old,p);return Map.of("id",id);
    }
    @Transactional public void cancel(long id,int version,long user){requireReady();var old=jdbc.queryForMap("SELECT * FROM accounting_counterparty_ledger WHERE id=? FOR UPDATE",id);if(jdbc.update("UPDATE accounting_counterparty_ledger SET voided=TRUE,version=version+1,updated_by=? WHERE id=? AND version=? AND voided=FALSE",user,id,version)!=1)throw new IllegalArgumentException("다른 변경사항이 있습니다. 새로고침해주세요.");audit(id,user,old,Map.of("voided",true));}
    private void audit(long id,long user,Object old,Object value){try{jdbc.update("INSERT INTO audit_logs(user_id,action,target_type,target_id,old_value,new_value) VALUES(?,'UPDATE','COUNTERPARTY_LEDGER',?,?,?)",user,id,old==null?null:mapper.writeValueAsString(old),mapper.writeValueAsString(value));}catch(Exception e){throw new IllegalStateException(e);}}
}
