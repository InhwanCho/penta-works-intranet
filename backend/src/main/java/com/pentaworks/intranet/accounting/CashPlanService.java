package com.pentaworks.intranet.accounting;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;

@Service
public class CashPlanService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    public CashPlanService(JdbcTemplate jdbc,ObjectMapper mapper) { this.jdbc=jdbc; this.mapper=mapper; }
    public record PlanInput(String title,String direction,BigDecimal amount,LocalDate plannedDate,Long accountId,
        String counterparty,String category,String certainty,String memo,int months,boolean monthEnd,
        String cardIssuer,LocalDate billingMonth,int version,String requestKey,boolean previousBusinessDay) {
        public PlanInput(String title,String direction,BigDecimal amount,LocalDate plannedDate,Long accountId,
            String counterparty,String category,String certainty,String memo,int months,boolean monthEnd,
            String cardIssuer,LocalDate billingMonth,int version,String requestKey) {
            this(title,direction,amount,plannedDate,accountId,counterparty,category,certainty,memo,months,monthEnd,
                cardIssuer,billingMonth,version,requestKey,false);
        }
    }
    public boolean ready() { return jdbc.queryForObject("SELECT COUNT(*) FROM schema_migrations WHERE version='022_cash_planning'",Integer.class)==1; }
    private void requireReady() { if(!ready()) throw new IllegalArgumentException("자금계획 DB 업데이트가 필요합니다. 서버 관리자에게 문의해주세요."); }
    private static final String SELECT = "SELECT e.id,e.entry_group_key,e.title,e.direction,e.amount,e.planned_date,e.planned_bank_account_id account_id,e.memo,e.status,e.version,p.original_date,p.original_amount,p.counterparty_name,p.category_name,p.certainty,p.card_issuer,p.billing_month,a.alias account_name,COALESCE(s.settled,0) settled,e.amount-COALESCE(s.settled,0) remaining FROM accounting_cash_plans p JOIN accounting_ledger_entries e ON e.id=p.ledger_entry_id LEFT JOIN accounting_bank_accounts a ON a.id=e.planned_bank_account_id LEFT JOIN (SELECT ledger_entry_id,SUM(allocated_amount) settled FROM accounting_payment_allocations WHERE status='CONFIRMED' GROUP BY ledger_entry_id) s ON s.ledger_entry_id=e.id ";
    public Map<String,Object> workspace(LocalDate from,LocalDate to) {
        requireReady(); dates(from,to);
        var plans=jdbc.queryForList(SELECT+"WHERE (e.planned_date BETWEEN ? AND ?) OR (e.status<>'VOID' AND e.amount>COALESCE(s.settled,0) AND e.planned_date<?) ORDER BY e.planned_date,e.id",from,to,from);
        var accounts=jdbc.queryForList("SELECT a.id,a.alias,a.bank_name,a.bank_code,a.account_num_masked,a.last_sync_at,a.last_sync_error,CASE WHEN t.id IS NULL THEN a.opening_balance ELSE t.balance_after END balance,CASE WHEN t.id IS NULL THEN a.opening_balance_at ELSE t.trans_at END balance_at FROM accounting_bank_accounts a LEFT JOIN accounting_bank_transactions t ON t.id=(SELECT t2.id FROM accounting_bank_transactions t2 WHERE t2.bank_account_id=a.id ORDER BY t2.trans_at DESC,t2.id DESC LIMIT 1) WHERE a.active=TRUE AND a.currency='KRW' ORDER BY a.id");
        var days=jdbc.queryForList("SELECT DATE(trans_at) date,bank_account_id account_id,SUM(CASE WHEN classification<>'INTERNAL_TRANSFER' THEN deposit_amount ELSE 0 END) income,SUM(CASE WHEN classification<>'INTERNAL_TRANSFER' THEN withdraw_amount ELSE transfer_fee END) expense,SUM(CASE WHEN classification='INTERNAL_TRANSFER' THEN deposit_amount-withdraw_amount+transfer_fee ELSE 0 END) transfer FROM accounting_bank_transactions WHERE trans_at>=? AND trans_at<? GROUP BY DATE(trans_at),bank_account_id ORDER BY date",from,to.plusDays(1));
        var balances=jdbc.queryForList("WITH RECURSIVE dates AS (SELECT CAST(? AS DATE) day UNION ALL SELECT day+INTERVAL 1 DAY FROM dates WHERE day<CAST(? AS DATE)) SELECT dates.day date,a.id account_id,CASE WHEN t.id IS NOT NULL THEN t.balance_after WHEN a.opening_balance_at<dates.day+INTERVAL 1 DAY THEN a.opening_balance ELSE NULL END balance,CASE WHEN t.id IS NOT NULL THEN t.trans_at WHEN a.opening_balance_at<dates.day+INTERVAL 1 DAY THEN a.opening_balance_at ELSE NULL END balance_at FROM dates CROSS JOIN accounting_bank_accounts a LEFT JOIN accounting_bank_transactions t ON t.id=(SELECT t2.id FROM accounting_bank_transactions t2 WHERE t2.bank_account_id=a.id AND t2.trans_at<dates.day+INTERVAL 1 DAY ORDER BY t2.trans_at DESC,t2.id DESC LIMIT 1) WHERE a.active=TRUE AND a.currency='KRW' ORDER BY dates.day,a.id",from,to);
        return Map.of("plans",clean(plans),"accounts",clean(accounts),"days",clean(days),"balances",clean(balances));
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public Map<String,Object> createBatch(List<PlanInput> plans,long user) {
        if(plans==null || plans.isEmpty() || plans.size()>50)throw new IllegalArgumentException("계획을 1~50건 입력해주세요.");
        Set<String> keys=new HashSet<>();
        int count=0;
        for(int i=0;i<plans.size();i++){
            var plan=plans.get(i);
            try {
                if(plan==null || plan.cardIssuer()!=null || !keys.add(plan.requestKey()))
                    throw new IllegalArgumentException("일괄 등록에는 서로 다른 일반 입출금 계획만 넣을 수 있습니다.");
                if(plan.months()>200-count)throw new IllegalArgumentException("한 번에 최대 200회차까지 생성할 수 있습니다.");
                create(plan,user);
                count+=plan.months();
            } catch(IllegalArgumentException e) {
                throw new IllegalArgumentException((i+1)+"번째 계획: "+e.getMessage(),e);
            }
        }
        return Map.of("count",count);
    }

    @Transactional(isolation=Isolation.READ_COMMITTED) public Map<String,Object> create(PlanInput p,long user) {
        requireReady();validate(p);key(p.requestKey());billLock(p);
        // Serialize creation per user, including retries and duplicate card-bill checks.
        jdbc.queryForMap("SELECT id FROM users WHERE id=? FOR UPDATE",user);
        String group=UUID.nameUUIDFromBytes((user+":"+p.requestKey()).getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString();
        var existing=jdbc.queryForList("SELECT id FROM accounting_ledger_entries WHERE entry_group_key=? ORDER BY line_no",group);
        if(!existing.isEmpty())return Map.of("ids",existing.stream().map(r->((Number)r.get("id")).longValue()).toList());
        List<Long> ids=new ArrayList<>();
        for(int i=0;i<p.months();i++) {
            LocalDate nominal=occurrence(p.plannedDate(),i,p.monthEnd());
            LocalDate date=adjustDate(nominal,p.previousBusinessDay());
            LocalDate bill=p.billingMonth()==null?null:p.billingMonth().plusMonths(i);
            checkBill(p.cardIssuer(),bill,null);
            jdbc.update("INSERT INTO accounting_ledger_entries(entry_group_key,line_no,entry_type,direction,title,entry_date,planned_date,planned_bank_account_id,amount,pnl_treatment,memo,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,'EXCLUDED',?,?,?)",group,i+1,p.cardIssuer()==null?"OTHER":"CARD_BILL",p.direction(),p.title().trim(),LocalDate.now(ZoneId.of("Asia/Seoul")),date,p.accountId(),p.amount(),text(p.memo()),user,user);
            long id=jdbc.queryForObject("SELECT id FROM accounting_ledger_entries WHERE entry_group_key=? AND line_no=?",Long.class,group,i+1);
            jdbc.update("INSERT INTO accounting_cash_plans(ledger_entry_id,original_date,original_amount,counterparty_name,category_name,certainty,card_issuer,billing_month) VALUES(?,?,?,?,?,?,?,?)",id,nominal,p.amount(),text(p.counterparty()),text(p.category()),p.certainty(),p.cardIssuer(),bill);
            ids.add(id);audit(user,"CREATE",id,null,read(id));
        }
        return Map.of("ids",ids);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED) public Map<String,Object> update(long id,PlanInput p,long user) {
        requireReady();validate(p);billLock(p);lock(id);var old=read(id);version(old,p.version());
        if("VOID".equals(old.get("status")))throw new IllegalArgumentException("취소된 계획은 변경할 수 없습니다.");
        if(money(old,"settled").signum()>0) {
            if(!Objects.equals(old.get("direction"),p.direction()) || !Objects.equals(number(old.get("account_id")),p.accountId()) || !Objects.equals(old.get("card_issuer"),p.cardIssuer()))throw new IllegalArgumentException("거래 연결을 해제한 뒤 입출금 방향·계좌·카드사를 변경해주세요.");
            if(p.amount().compareTo(money(old,"settled"))<0)throw new IllegalArgumentException("계획금액은 이미 연결한 금액보다 작을 수 없습니다.");
        }
        checkBill(p.cardIssuer(),p.billingMonth(),id);
        jdbc.update("UPDATE accounting_ledger_entries SET title=?,direction=?,amount=?,planned_date=?,planned_bank_account_id=?,memo=?,entry_type=?,version=version+1,updated_by=? WHERE id=?",p.title().trim(),p.direction(),p.amount(),adjustDate(p.plannedDate(),p.previousBusinessDay()),p.accountId(),text(p.memo()),p.cardIssuer()==null?"OTHER":"CARD_BILL",user,id);
        jdbc.update("UPDATE accounting_cash_plans SET counterparty_name=?,category_name=?,certainty=?,card_issuer=?,billing_month=? WHERE ledger_entry_id=?",text(p.counterparty()),text(p.category()),p.certainty(),p.cardIssuer(),p.billingMonth(),id);
        var result=read(id);audit(user,"UPDATE",id,old,result);return result;
    }
    @Transactional(isolation=Isolation.READ_COMMITTED) public void cancel(long id,int version,long user) {
        requireReady();lock(id);var old=read(id);version(old,version);
        if(money(old,"settled").signum()>0)throw new IllegalArgumentException("실제 거래 연결을 먼저 해제해주세요.");
        jdbc.update("UPDATE accounting_ledger_entries SET status='VOID',version=version+1,updated_by=? WHERE id=?",user,id);audit(user,"UPDATE",id,old,read(id));
    }
    public Map<String,Object> matches(long id,LocalDate from,LocalDate to) {
        requireReady();dates(from,to);var plan=read(id);
        var candidates=jdbc.queryForList("SELECT t.id,t.trans_at,t.description,t.counterparty_text,t.deposit_amount,t.withdraw_amount,a.alias account_name,t.bank_account_id,t.deposit_amount+t.withdraw_amount-COALESCE(s.used,0) available FROM accounting_bank_transactions t JOIN accounting_bank_accounts a ON a.id=t.bank_account_id LEFT JOIN (SELECT bank_transaction_id,SUM(allocated_amount) used FROM accounting_payment_allocations WHERE status='CONFIRMED' GROUP BY bank_transaction_id) s ON s.bank_transaction_id=t.id WHERE t.trans_at>=? AND t.trans_at<? AND t.classification<>'INTERNAL_TRANSFER' AND a.currency='KRW' AND "+("IN".equals(plan.get("direction"))?"t.deposit_amount":"t.withdraw_amount")+">COALESCE(s.used,0) AND (? IS NULL OR t.bank_account_id=?) ORDER BY t.trans_at DESC,t.id DESC LIMIT 201",from,to.plusDays(1),plan.get("account_id"),plan.get("account_id"));
        var allocations=jdbc.queryForList("SELECT p.id,p.allocated_amount,p.settled_at,t.description,a.alias account_name FROM accounting_payment_allocations p JOIN accounting_bank_transactions t ON t.id=p.bank_transaction_id JOIN accounting_bank_accounts a ON a.id=t.bank_account_id WHERE p.ledger_entry_id=? AND p.status='CONFIRMED' ORDER BY p.id",id);
        return Map.of("plan",plan,"candidates",clean(candidates.stream().limit(200).toList()),"truncated",candidates.size()>200,"allocations",clean(allocations));
    }
    @Transactional(isolation=Isolation.READ_COMMITTED) public void allocate(long id,CashPlanController.Allocation input,long user) {
        requireReady();positive(input.amount());key(input.requestKey());lock(id);var plan=read(id);
        String requestKey="cash:"+user+":"+input.requestKey();
        var previous=jdbc.queryForList("SELECT ledger_entry_id,bank_transaction_id,allocated_amount,status FROM accounting_payment_allocations WHERE idempotency_key=?",requestKey);
        if(!previous.isEmpty()) { var row=previous.get(0);if(number(row.get("ledger_entry_id"))!=id || number(row.get("bank_transaction_id"))!=input.transactionId() || money(row,"allocated_amount").compareTo(input.amount())!=0 || !"CONFIRMED".equals(row.get("status")))throw new IllegalArgumentException("이미 처리된 요청입니다. 화면을 새로고침해주세요.");return; }
        version(plan,input.version());
        if("VOID".equals(plan.get("status")))throw new IllegalArgumentException("취소된 계획입니다.");
        var rows=jdbc.queryForList("SELECT * FROM accounting_bank_transactions WHERE id=? FOR UPDATE",input.transactionId());
        if(rows.isEmpty())throw new IllegalArgumentException("거래를 찾을 수 없습니다.");var bank=rows.get(0);
        if("INTERNAL_TRANSFER".equals(bank.get("classification")))throw new IllegalArgumentException("내부이체는 외부 입출금 계획에 연결할 수 없습니다.");
        if(plan.get("account_id")!=null && !number(plan.get("account_id")).equals(number(bank.get("bank_account_id"))))throw new IllegalArgumentException("예정 계좌와 실제 계좌가 다릅니다. 계획의 계좌를 먼저 수정해주세요.");
        if(!"KRW".equals(jdbc.queryForObject("SELECT currency FROM accounting_bank_accounts WHERE id=?",String.class,bank.get("bank_account_id"))))throw new IllegalArgumentException("원화 계좌만 연결할 수 있습니다.");
        BigDecimal amount=money(bank,"IN".equals(plan.get("direction"))?"deposit_amount":"withdraw_amount");
        BigDecimal used=jdbc.queryForObject("SELECT COALESCE(SUM(allocated_amount),0) FROM accounting_payment_allocations WHERE bank_transaction_id=? AND status='CONFIRMED'",BigDecimal.class,input.transactionId());
        if(input.amount().compareTo(amount.subtract(used))>0 || input.amount().compareTo(money(plan,"remaining"))>0)throw new IllegalArgumentException("거래의 미연결 금액 또는 계획의 남은 금액을 초과합니다.");
        jdbc.update("INSERT INTO accounting_payment_allocations(ledger_entry_id,bank_transaction_id,payment_method,allocated_amount,settled_at,status,idempotency_key,created_by) VALUES(?,?,'BANK',?,?,'CONFIRMED',?,?)",id,input.transactionId(),input.amount(),bank.get("trans_at"),requestKey,user);
        jdbc.update("UPDATE accounting_ledger_entries SET version=version+1,updated_by=? WHERE id=?",user,id);
        if("UNCLASSIFIED".equals(bank.get("classification")))jdbc.update("UPDATE accounting_bank_transactions SET classification=? WHERE id=?",plan.get("card_issuer")==null?"NORMAL":"CARD_PAYMENT",input.transactionId());
        audit(user,"UPDATE",id,plan,read(id));
    }
    @Transactional(isolation=Isolation.READ_COMMITTED) public void unlink(long id,long allocationId,long user) {
        requireReady();lock(id);var old=read(id);
        var rows=jdbc.queryForList("SELECT bank_transaction_id FROM accounting_payment_allocations WHERE id=? AND ledger_entry_id=? AND status='CONFIRMED'",allocationId,id);
        if(rows.isEmpty())throw new IllegalArgumentException("연결 내역을 찾을 수 없습니다.");
        jdbc.queryForMap("SELECT id FROM accounting_bank_transactions WHERE id=? FOR UPDATE",rows.get(0).get("bank_transaction_id"));
        jdbc.update("UPDATE accounting_payment_allocations SET status='VOID' WHERE id=?",allocationId);
        jdbc.update("UPDATE accounting_ledger_entries SET version=version+1,updated_by=? WHERE id=?",user,id);audit(user,"UPDATE",id,old,read(id));
    }
    private void checkBill(String issuer,LocalDate month,Long except) {
        if(issuer==null)return;
        if(jdbc.queryForObject("SELECT COUNT(*) FROM accounting_cash_plans p JOIN accounting_ledger_entries e ON e.id=p.ledger_entry_id WHERE p.card_issuer=? AND p.billing_month=? AND e.status<>'VOID' AND (? IS NULL OR e.id<>?)",Integer.class,issuer,month,except,except)>0)throw new IllegalArgumentException("해당 카드사의 결제월 청구 계획이 이미 있습니다. 기존 계획을 수정해주세요.");
    }
    @Transactional(isolation=Isolation.READ_COMMITTED) public void transfer(CashPlanController.Transfer input,long user) {
        requireReady();
        if(input.withdrawalId()==input.depositId() || input.fee()==null || input.fee().signum()<0 || input.fee().stripTrailingZeros().scale()>0)throw new IllegalArgumentException("입출금 거래와 수수료를 확인해주세요.");
        var rows=jdbc.queryForList("SELECT * FROM accounting_bank_transactions WHERE id IN (?,?) ORDER BY id FOR UPDATE",input.withdrawalId(),input.depositId());
        if(rows.size()!=2)throw new IllegalArgumentException("거래를 찾을 수 없습니다.");
        var out=rows.stream().filter(r->number(r.get("id"))==input.withdrawalId()).findFirst().orElseThrow();
        var in=rows.stream().filter(r->number(r.get("id"))==input.depositId()).findFirst().orElseThrow();
        if(Objects.equals(number(out.get("linked_transaction_id")),input.depositId()) && Objects.equals(number(in.get("linked_transaction_id")),input.withdrawalId()) && money(out,"transfer_fee").compareTo(input.fee())==0)return;
        if(Objects.equals(out.get("bank_account_id"),in.get("bank_account_id")) || money(out,"withdraw_amount").signum()<=0 || money(in,"deposit_amount").signum()<=0 || money(out,"withdraw_amount").compareTo(money(in,"deposit_amount").add(input.fee()))!=0)throw new IllegalArgumentException("서로 다른 계좌의 출금 = 입금 + 수수료가 일치해야 합니다.");
        if(jdbc.queryForObject("SELECT COUNT(*) FROM accounting_bank_accounts WHERE id IN (?,?) AND currency='KRW'",Integer.class,out.get("bank_account_id"),in.get("bank_account_id"))!=2)throw new IllegalArgumentException("원화 계좌만 연결할 수 있습니다.");
        if(rows.stream().anyMatch(r->r.get("linked_transaction_id")!=null || !Set.of("UNCLASSIFIED","NORMAL").contains(String.valueOf(r.get("classification")))) || jdbc.queryForObject("SELECT COUNT(*) FROM accounting_payment_allocations WHERE bank_transaction_id IN (?,?) AND status='CONFIRMED'",Integer.class,input.withdrawalId(),input.depositId())>0 || jdbc.queryForObject("SELECT COUNT(*) FROM accounting_ledger_entries WHERE source_bank_transaction_id IN (?,?) AND status<>'VOID'",Integer.class,input.withdrawalId(),input.depositId())>0)throw new IllegalArgumentException("이미 분류되거나 계획·장부에 연결된 거래입니다. 기존 연결을 먼저 확인해주세요.");
        String group=UUID.randomUUID().toString();
        jdbc.update("UPDATE accounting_bank_transactions SET classification='INTERNAL_TRANSFER',linked_transaction_id=?,transfer_group_key=?,transfer_fee=? WHERE id=?",input.depositId(),group,input.fee(),input.withdrawalId());
        jdbc.update("UPDATE accounting_bank_transactions SET classification='INTERNAL_TRANSFER',linked_transaction_id=?,transfer_group_key=?,transfer_fee=0 WHERE id=?",input.withdrawalId(),group,input.depositId());
        auditTransfer(user,input.withdrawalId(),rows,Map.of("depositId",input.depositId(),"fee",input.fee(),"group",group));
    }
    @Transactional(isolation=Isolation.READ_COMMITTED) public void undoTransfer(long id,long user) {
        requireReady();var peers=jdbc.queryForList("SELECT linked_transaction_id FROM accounting_bank_transactions WHERE id=?",id);
        if(peers.isEmpty() || peers.get(0).get("linked_transaction_id")==null)throw new IllegalArgumentException("연결된 내부이체가 없습니다.");
        long peer=number(peers.get(0).get("linked_transaction_id"));
        var rows=jdbc.queryForList("SELECT * FROM accounting_bank_transactions WHERE id IN (?,?) ORDER BY id FOR UPDATE",id,peer);
        if(rows.size()!=2 || rows.stream().anyMatch(r->!Objects.equals(number(r.get("linked_transaction_id")),number(r.get("id"))==id?peer:id)))throw new IllegalArgumentException("이체 연결이 변경되었습니다. 새로고침해주세요.");
        jdbc.update("UPDATE accounting_bank_transactions SET classification='UNCLASSIFIED',linked_transaction_id=NULL,transfer_group_key=NULL,transfer_fee=0 WHERE id IN (?,?)",id,peer);
        auditTransfer(user,id,rows,Map.of("unlinked",true));
    }
    private void auditTransfer(long user,long id,List<Map<String,Object>> rows,Object value) {
        var safe=rows.stream().map(r->{var copy=new LinkedHashMap<>(r);copy.remove("raw_payload");return (Map<String,Object>)copy;}).toList();
        try {jdbc.update("INSERT INTO audit_logs(user_id,action,target_type,target_id,old_value,new_value) VALUES(?,'UPDATE','BANK_TRANSFER',?,?,?)",user,id,mapper.writeValueAsString(clean(safe)),mapper.writeValueAsString(value));}catch(java.io.IOException e){throw new IllegalStateException(e);}
    }
    private void billLock(PlanInput p) { if(p.cardIssuer()!=null)jdbc.queryForMap("SELECT version FROM schema_migrations WHERE version='022_cash_planning' FOR UPDATE"); }
    private void validate(PlanInput p) {
        if(p.title()==null || p.title().isBlank() || p.title().length()>255)throw new IllegalArgumentException("항목명은 1~255자로 입력해주세요.");
        if(!Set.of("IN","OUT").contains(Objects.requireNonNullElse(p.direction(),"")) || !Set.of("CONFIRMED","ESTIMATED").contains(Objects.requireNonNullElse(p.certainty(),"")))throw new IllegalArgumentException("방향과 확정 여부를 확인해주세요.");
        positive(p.amount());if(p.plannedDate()==null || p.plannedDate().getYear()<2000 || p.plannedDate().getYear()>2100 || p.months()<1 || p.months()>24)throw new IllegalArgumentException("예정일과 생성 개월 수(1~24)를 확인해주세요.");
        if(text(p.counterparty()).length()>200 || text(p.category()).length()>100 || text(p.memo()).length()>5000)throw new IllegalArgumentException("거래처·분류·메모가 너무 깁니다.");
        if(p.accountId()!=null && jdbc.queryForObject("SELECT COUNT(*) FROM accounting_bank_accounts WHERE id=? AND active=TRUE AND currency='KRW'",Integer.class,p.accountId())!=1)throw new IllegalArgumentException("사용 가능한 원화 계좌를 선택해주세요.");
        if(p.cardIssuer()!=null && (!Set.of("BC","HANA").contains(p.cardIssuer()) || !"OUT".equals(p.direction()) || p.billingMonth()==null || p.billingMonth().getDayOfMonth()!=1 || p.accountId()==null))throw new IllegalArgumentException("카드대금은 카드사·결제월·출금계좌가 필요합니다.");
        if(p.cardIssuer()!=null) {
            var bank=jdbc.queryForMap("SELECT bank_code,bank_name FROM accounting_bank_accounts WHERE id=?",p.accountId());
            if(!cardBankMatches(p.cardIssuer(),String.valueOf(bank.get("bank_code")),String.valueOf(bank.get("bank_name"))))throw new IllegalArgumentException("BC카드는 기업은행, 하나카드는 하나은행 출금계좌를 선택해주세요.");
        }
        if(p.cardIssuer()==null && p.billingMonth()!=null)throw new IllegalArgumentException("일반 계획에는 카드 결제월을 지정할 수 없습니다.");
    }
    static boolean cardBankMatches(String issuer,String code,String name) {
        return "BC".equals(issuer) ? Set.of("IBK","003","3").contains(code) || name.contains("기업") : "HANA".equals(issuer) && (Set.of("HANA","081","81").contains(code) || name.contains("하나"));
    }
    static LocalDate adjustDate(LocalDate nominal,boolean previousBusinessDay) {
        return previousBusinessDay ? KoreanBusinessCalendar.onOrBefore(nominal) : nominal;
    }
    static LocalDate occurrence(LocalDate start,int month,boolean end) { var target=YearMonth.from(start).plusMonths(month);return target.atDay(end?target.lengthOfMonth():Math.min(start.getDayOfMonth(),target.lengthOfMonth())); }
    static void positive(BigDecimal amount) { if(amount==null || amount.signum()<=0 || amount.stripTrailingZeros().scale()>0 || amount.compareTo(new BigDecimal("999999999999"))>0)throw new IllegalArgumentException("금액은 1~999,999,999,999원의 정수로 입력해주세요."); }
    private void lock(long id) { if(jdbc.queryForList("SELECT e.id FROM accounting_ledger_entries e JOIN accounting_cash_plans p ON p.ledger_entry_id=e.id WHERE e.id=? FOR UPDATE",id).isEmpty())throw new IllegalArgumentException("계획을 찾을 수 없습니다."); }
    private Map<String,Object> read(long id) { var rows=jdbc.queryForList(SELECT+"WHERE e.id=?",id);if(rows.isEmpty())throw new IllegalArgumentException("계획을 찾을 수 없습니다.");return clean(rows).get(0); }
    private static void version(Map<String,Object> plan,int version) { if(((Number)plan.get("version")).intValue()!=version)throw new IllegalArgumentException("다른 변경사항이 있습니다. 화면을 새로고침한 뒤 다시 시도해주세요."); }
    private static void dates(LocalDate from,LocalDate to) { if(from==null || to==null || to.isBefore(from) || java.time.temporal.ChronoUnit.DAYS.between(from,to)>199)throw new IllegalArgumentException("조회 기간은 200일 이내로 선택해주세요."); }
    private static void key(String key) { if(key==null || !key.matches("[a-zA-Z0-9-]{16,80}"))throw new IllegalArgumentException("요청 식별자가 올바르지 않습니다."); }
    private static String text(String v) { return v==null?"":v.trim(); }
    private static Long number(Object v) { return v==null?null:((Number)v).longValue(); }
    private static BigDecimal money(Map<String,Object> row,String field) { return new BigDecimal(row.get(field).toString()); }
    private static List<Map<String,Object>> clean(List<Map<String,Object>> rows) { return rows.stream().map(row->{var copy=new LinkedHashMap<>(row);copy.replaceAll((k,v)->v instanceof java.sql.Date d?d.toLocalDate().toString():v instanceof java.sql.Timestamp t?t.toLocalDateTime().toString():v);return (Map<String,Object>)copy;}).toList(); }
    private void audit(long user,String action,long id,Object old,Object value) { try {jdbc.update("INSERT INTO audit_logs(user_id,action,target_type,target_id,old_value,new_value) VALUES(?,?,'CASH_PLAN',?,?,?)",user,action,id,old==null?null:mapper.writeValueAsString(old),mapper.writeValueAsString(value));}catch(java.io.IOException e){throw new IllegalStateException(e);} }
}
