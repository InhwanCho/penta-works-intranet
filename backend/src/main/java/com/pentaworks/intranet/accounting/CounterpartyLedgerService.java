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
        var rows=jdbc.queryForList("SELECT id,DATE_FORMAT(entry_date,'%Y-%m-%d') date,counterparty,kind,description,amount,vat,deductible,version FROM accounting_counterparty_ledger WHERE voided=FALSE AND entry_date>=? AND entry_date<? ORDER BY entry_date,id",from,to);
        var opening=jdbc.queryForList("SELECT counterparty,SUM(CASE WHEN kind='SALE' THEN amount WHEN kind='RECEIPT' THEN -amount ELSE 0 END) receivable,SUM(CASE WHEN kind='PURCHASE' THEN amount WHEN kind='PAYMENT' THEN -amount ELSE 0 END) payable FROM accounting_counterparty_ledger WHERE voided=FALSE AND entry_date<? GROUP BY counterparty",from);
        var parties=jdbc.queryForList("SELECT DISTINCT counterparty FROM accounting_counterparty_ledger WHERE voided=FALSE ORDER BY counterparty",String.class);
        return Map.of("rows",rows,"opening",opening,"parties",parties,"from",from.toString(),"to",to.minusDays(1).toString());
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
