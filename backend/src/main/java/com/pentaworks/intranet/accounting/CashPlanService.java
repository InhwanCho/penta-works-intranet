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
    public boolean ready() { return jdbc.queryForObject("SELECT COUNT(*) FROM schema_migrations WHERE version='028_cash_execution'",Integer.class)==1; }
    private void requireReady() { if(!ready()) throw new IllegalArgumentException("자금계획 DB 업데이트가 필요합니다. 서버 관리자에게 문의해주세요."); }
    private static final String SETTLED = """
        COALESCE((SELECT SUM(allocation.allocated_amount) FROM accounting_payment_allocations allocation
        WHERE allocation.ledger_entry_id=e.id AND allocation.status='CONFIRMED'),0)
        """;
    private static final String SELECT = """
        SELECT e.id,e.entry_group_key,e.title,e.direction,e.amount,e.planned_date,e.planned_bank_account_id account_id,
        e.memo,e.status,e.version,p.original_date,p.original_amount,p.counterparty_name,p.category_name,p.certainty,
        p.card_issuer,p.billing_month,p.execution_confirmed,p.execution_reviewed,p.match_keywords,p.match_days,p.review_note,p.reviewed_at,p.reviewed_by,a.alias account_name,%s settled,CASE WHEN p.execution_confirmed THEN 0 ELSE GREATEST(0,e.amount-%s) END remaining
        FROM accounting_ledger_entries e JOIN accounting_cash_plans p ON e.id=p.ledger_entry_id
        LEFT JOIN accounting_bank_accounts a ON a.id=e.planned_bank_account_id
        """.formatted(SETTLED,SETTLED);
    private static final String OPEN = "e.status<>'VOID' AND p.execution_confirmed=FALSE";
    private static final String PLAN_ORDER = " ORDER BY e.planned_date,e.id";
    private static final int EARLIER_PAGE_SIZE = 50;

    public Map<String,Object> workspace(LocalDate from,LocalDate to) {
        return workspace(from,to,false);
    }
    public Map<String,Object> workspace(LocalDate from,LocalDate to,boolean plansOnly) {
        return workspace(from,to,plansOnly,"full");
    }
    public Map<String,Object> workspace(LocalDate from,LocalDate to,boolean plansOnly,String view) {
        return workspace(from,to,plansOnly,view,true);
    }
    public Map<String,Object> workspace(LocalDate from,LocalDate to,boolean plansOnly,String view,boolean includeEarlier) {
        requireReady(); dates(from,to);
        if(!Set.of("full","overview","calendar","daily","plans","bills").contains(view))
            throw new IllegalArgumentException("조회 화면을 확인해주세요.");
        String range = "e.planned_date BETWEEN ? AND ?";
        if(includeEarlier) range = "("+range+" OR (e.planned_date<? AND "+OPEN+"))";
        String card = view.equals("bills") ? " AND p.card_issuer IS NOT NULL" : "";
        Object[] params = includeEarlier ? new Object[]{from,to,from} : new Object[]{from,to};
        var plans=jdbc.queryForList(SELECT+"WHERE "+range+card+PLAN_ORDER,params);
        if(plansOnly || view.equals("plans") || view.equals("bills")) {
            var accounts=jdbc.queryForList("SELECT id,alias,bank_name,bank_code,account_num_masked FROM accounting_bank_accounts WHERE active=TRUE AND currency='KRW' ORDER BY id");
            return Map.of("plans",clean(plans),"accounts",clean(accounts),"days",List.of(),"balances",List.of());
        }
        var accounts=(view.equals("full") || view.equals("overview")) ? jdbc.queryForList("SELECT a.id,a.alias,a.bank_name,a.bank_code,a.account_num_masked,a.last_sync_at,a.last_sync_error,CASE WHEN t.id IS NULL THEN a.opening_balance ELSE t.balance_after END balance,CASE WHEN t.id IS NULL THEN a.opening_balance_at ELSE t.trans_at END balance_at FROM accounting_bank_accounts a LEFT JOIN accounting_bank_transactions t ON t.id=(SELECT t2.id FROM accounting_bank_transactions t2 WHERE t2.bank_account_id=a.id ORDER BY t2.trans_at DESC,t2.id DESC LIMIT 1) WHERE a.active=TRUE AND a.currency='KRW' ORDER BY a.id") : jdbc.queryForList("SELECT id,alias,bank_name,bank_code,account_num_masked FROM accounting_bank_accounts WHERE active=TRUE AND currency='KRW' ORDER BY id");
        var days=jdbc.queryForList("SELECT DATE(trans_at) date,bank_account_id account_id,SUM(CASE WHEN classification<>'INTERNAL_TRANSFER' THEN deposit_amount ELSE 0 END) income,SUM(CASE WHEN classification<>'INTERNAL_TRANSFER' THEN withdraw_amount ELSE transfer_fee END) expense,SUM(CASE WHEN classification='INTERNAL_TRANSFER' THEN deposit_amount-withdraw_amount+transfer_fee ELSE 0 END) transfer FROM accounting_bank_transactions WHERE trans_at>=? AND trans_at<? GROUP BY DATE(trans_at),bank_account_id ORDER BY date",from,to.plusDays(1));
        List<Map<String,Object>> balances=(view.equals("full") || view.equals("daily")) ? jdbc.queryForList("WITH RECURSIVE dates AS (SELECT CAST(? AS DATE) day UNION ALL SELECT day+INTERVAL 1 DAY FROM dates WHERE day<CAST(? AS DATE)) SELECT dates.day date,a.id account_id,CASE WHEN t.id IS NOT NULL THEN t.balance_after WHEN a.opening_balance_at<dates.day+INTERVAL 1 DAY THEN a.opening_balance ELSE NULL END balance,CASE WHEN t.id IS NOT NULL THEN t.trans_at WHEN a.opening_balance_at<dates.day+INTERVAL 1 DAY THEN a.opening_balance_at ELSE NULL END balance_at FROM dates CROSS JOIN accounting_bank_accounts a LEFT JOIN accounting_bank_transactions t ON t.id=(SELECT t2.id FROM accounting_bank_transactions t2 WHERE t2.bank_account_id=a.id AND t2.trans_at<dates.day+INTERVAL 1 DAY ORDER BY t2.trans_at DESC,t2.id DESC LIMIT 1) WHERE a.active=TRUE AND a.currency='KRW' ORDER BY dates.day,a.id",from,to) : List.of();
        return Map.of("plans",clean(plans),"accounts",clean(accounts),"days",clean(days),"balances",clean(balances));
    }
    public Map<String,Object> earlierPlans(LocalDate before,boolean billsOnly,LocalDate afterDate,Long afterId) {
        requireReady();
        if ((afterDate==null)!=(afterId==null) || (afterDate!=null && (!afterDate.isBefore(before) || afterId<=0))) {
            throw new IllegalArgumentException("이전 계획 조회 범위를 확인해주세요.");
        }
        String card = billsOnly ? " AND p.card_issuer IS NOT NULL" : "";
        String cursor = afterDate==null ? "" : " AND (e.planned_date>? OR (e.planned_date=? AND e.id>?))";
        Object[] params = afterDate==null ? new Object[]{before,EARLIER_PAGE_SIZE+1}
            : new Object[]{before,afterDate,afterDate,afterId,EARLIER_PAGE_SIZE+1};
        var rows = jdbc.queryForList(SELECT+"WHERE e.planned_date<? AND "+OPEN+card+cursor+PLAN_ORDER+" LIMIT ?",params);
        boolean hasMore = rows.size()>EARLIER_PAGE_SIZE;
        return Map.of("plans",clean(hasMore ? rows.subList(0,EARLIER_PAGE_SIZE) : rows),"hasMore",hasMore);
    }

    @Transactional(isolation=Isolation.READ_COMMITTED)
    public Map<String,Object> createBatch(List<PlanInput> plans,long user) {
        if(plans==null || plans.isEmpty() || plans.size()>60)throw new IllegalArgumentException("계획을 1~60건 입력해주세요.");
        if(plans.stream().anyMatch(p -> p!=null && p.cardIssuer()!=null))
            jdbc.queryForMap("SELECT version FROM schema_migrations WHERE version='022_cash_planning' FOR UPDATE");
        Set<String> keys=new HashSet<>();
        int count=0;
        for(int i=0;i<plans.size();i++){
            var plan=plans.get(i);
            try {
                if(plan==null || !keys.add(plan.requestKey()))
                    throw new IllegalArgumentException("같은 계획을 두 번 등록할 수 없습니다.");
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
            jdbc.update("INSERT INTO accounting_ledger_entries(entry_group_key,line_no,entry_type,direction,title,entry_date,planned_date,planned_bank_account_id,amount,pnl_treatment,memo,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,'EXCLUDED',?,?,?)",group,i+1,p.cardIssuer()==null?"OTHER":"CARD_BILL",p.direction(),p.title().trim(),LocalDate.now(ZoneId.of("Asia/Seoul")),date,p.accountId(),plannedAmount(p),text(p.memo()),user,user);
            long id=jdbc.queryForObject("SELECT id FROM accounting_ledger_entries WHERE entry_group_key=? AND line_no=?",Long.class,group,i+1);
            jdbc.update("INSERT INTO accounting_cash_plans(ledger_entry_id,original_date,original_amount,counterparty_name,category_name,certainty,card_issuer,billing_month) VALUES(?,?,?,?,?,?,?,?)",id,nominal,plannedAmount(p),text(p.counterparty()),text(p.category()),p.certainty(),p.cardIssuer(),bill);
            ids.add(id);audit(user,"CREATE",id,null,read(id));
        }
        return Map.of("ids",ids);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED) public Map<String,Object> update(long id,PlanInput p,long user) {
        requireReady();validate(p);billLock(p);lock(id);var old=read(id);version(old,p.version());
        if("VOID".equals(old.get("status")))throw new IllegalArgumentException("취소된 계획은 변경할 수 없습니다.");
        if(jdbc.queryForObject("SELECT COUNT(*) FROM accounting_payment_allocations WHERE ledger_entry_id=? AND status='CONFIRMED'",Integer.class,id)>0) {
            if(!Objects.equals(old.get("direction"),p.direction()) || !Objects.equals(number(old.get("account_id")),p.accountId()) || !Objects.equals(old.get("card_issuer"),p.cardIssuer()))throw new IllegalArgumentException("거래 연결을 해제한 뒤 입출금 방향·계좌·카드사를 변경해주세요.");
        }
        checkBill(p.cardIssuer(),p.billingMonth(),id);
        jdbc.update("UPDATE accounting_ledger_entries SET title=?,direction=?,amount=?,planned_date=?,planned_bank_account_id=?,memo=?,entry_type=?,version=version+1,updated_by=? WHERE id=?",p.title().trim(),p.direction(),plannedAmount(p),adjustDate(p.plannedDate(),p.previousBusinessDay()),p.accountId(),text(p.memo()),p.cardIssuer()==null?"OTHER":"CARD_BILL",user,id);
        jdbc.update("UPDATE accounting_cash_plans SET execution_confirmed=FALSE,execution_reviewed=FALSE,counterparty_name=?,category_name=?,certainty=?,card_issuer=?,billing_month=? WHERE ledger_entry_id=?",text(p.counterparty()),text(p.category()),p.certainty(),p.cardIssuer(),p.billingMonth(),id);
        var result=read(id);audit(user,"UPDATE",id,old,result);return result;
    }
    @Transactional(isolation=Isolation.READ_COMMITTED) public void cancel(long id,int version,long user) {
        requireReady();lock(id);var old=read(id);version(old,version);
        if(jdbc.queryForObject("SELECT COUNT(*) FROM accounting_payment_allocations WHERE ledger_entry_id=? AND status='CONFIRMED'",Integer.class,id)>0)throw new IllegalArgumentException("먼저 반영된 실적을 취소해주세요.");
        jdbc.update("UPDATE accounting_ledger_entries SET status='VOID',version=version+1,updated_by=? WHERE id=?",user,id);audit(user,"UPDATE",id,old,read(id));
    }
    public Map<String,Object> matches(long id,LocalDate from,LocalDate to) {
        requireReady();dates(from,to);var plan=read(id);
        var candidates=bankCandidates(plan,from,to);
        var allocations=jdbc.queryForList("SELECT p.id,p.allocated_amount,p.settled_at,t.description,a.alias account_name FROM accounting_payment_allocations p JOIN accounting_bank_transactions t ON t.id=p.bank_transaction_id JOIN accounting_bank_accounts a ON a.id=t.bank_account_id WHERE p.ledger_entry_id=? AND p.status='CONFIRMED' ORDER BY p.id",id);
        return Map.of("plan",plan,"candidates",clean(candidates),"truncated",false,"allocations",clean(allocations));
    }
    private List<Map<String,Object>> bankCandidates(Map<String,Object> plan,LocalDate from,LocalDate to) {
        var rows=jdbc.queryForList("SELECT t.id,t.trans_at,t.description,t.counterparty_text,t.deposit_amount,t.withdraw_amount,a.alias account_name,t.bank_account_id,t.deposit_amount+t.withdraw_amount-COALESCE(s.used,0) available FROM accounting_bank_transactions t JOIN accounting_bank_accounts a ON a.id=t.bank_account_id LEFT JOIN (SELECT bank_transaction_id,SUM(ABS(allocated_amount)) used FROM accounting_payment_allocations WHERE status='CONFIRMED' GROUP BY bank_transaction_id) s ON s.bank_transaction_id=t.id WHERE t.trans_at>=? AND t.trans_at<? AND t.classification<>'INTERNAL_TRANSFER' AND a.currency='KRW' AND t.deposit_amount+t.withdraw_amount>COALESCE(s.used,0) AND (? IS NULL OR t.bank_account_id=?) ORDER BY t.trans_at DESC,t.id DESC",from,to.plusDays(1),plan.get("account_id"),plan.get("account_id"));
        for(var row:rows) {
            boolean reversal=money(row,"IN".equals(plan.get("direction"))?"deposit_amount":"withdraw_amount").signum()==0;
            String haystack=normalize(row.get("description")+" "+row.get("counterparty_text"));
            var words=new ArrayList<String>();
            String keywords=String.valueOf(plan.get("match_keywords"));
            if(!keywords.isBlank()) words.addAll(Arrays.asList(keywords.split("[,，\\n]")));
            else {
                words.add(String.valueOf(plan.get("counterparty_name")));
                String title=String.valueOf(plan.get("title")).replaceAll("[0-9]+[년월일회차]*", " ").trim();
                words.add(title);
                for(String known:List.of("건강보험","국민연금","고용보험","산재보험"))if(title.contains(known))words.add(known);
            }
            boolean textMatch=words.stream().map(CashPlanService::normalize).filter(w->w.length()>=2).anyMatch(haystack::contains);
            LocalDate date=((java.sql.Timestamp)row.get("trans_at")).toLocalDateTime().toLocalDate();
            long distance=Math.abs(java.time.temporal.ChronoUnit.DAYS.between(LocalDate.parse(plan.get("planned_date").toString()),date));
            boolean inRange=distance<=((Number)plan.get("match_days")).intValue();
            boolean amountMatch=withinTolerance(money(plan,"amount"),money(row,"available").add(money(plan,"settled")));
            row.put("reversal",reversal);row.put("text_match",textMatch);
            row.put("recommended",textMatch && inRange && amountMatch && !reversal);
            row.put("reason",!textMatch?"적요 직접 확인":reversal?"반환·취소 후보":!inRange?"날짜 범위 밖":amountMatch?"적요 일치 · 금액 ±20% 이내":"적요 일치 · 분할/합산 또는 금액 확인");
        }
        rows.sort(Comparator.<Map<String,Object>,Boolean>comparing(r->Boolean.TRUE.equals(r.get("recommended"))).reversed().thenComparing(r->!Boolean.TRUE.equals(r.get("text_match"))));
        return rows;
    }
    static String normalize(String value) { return value.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]", ""); }
    static boolean withinTolerance(BigDecimal expected,BigDecimal actual) { return expected.signum()>0 && actual.subtract(expected).abs().compareTo(expected.multiply(new BigDecimal("0.20")))<=0; }

    public Map<String,Object> review(LocalDate from,LocalDate to) {
        requireReady();dates(from,to);
        var plans=jdbc.queryForList(SELECT+"WHERE e.status<>'VOID' AND (e.planned_date BETWEEN ? AND ? OR (e.planned_date<? AND p.execution_confirmed=FALSE))"+PLAN_ORDER,from,to,from);
        var cleaned=clean(plans);
        for(var plan:cleaned) {
            var date=LocalDate.parse(plan.get("planned_date").toString());
            int days=((Number)plan.get("match_days")).intValue();
            var candidates=bankCandidates(plan,date.minusDays(days),date.plusDays(days));
            plan.put("recommendations",clean(candidates.stream().filter(r->Boolean.TRUE.equals(r.get("text_match"))).toList()));
        }
        var unlinked=jdbc.queryForList("SELECT t.id,t.trans_at,t.description,t.counterparty_text,a.alias account_name,t.deposit_amount,t.withdraw_amount,t.deposit_amount+t.withdraw_amount-COALESCE(s.used,0) available FROM accounting_bank_transactions t JOIN accounting_bank_accounts a ON a.id=t.bank_account_id LEFT JOIN (SELECT bank_transaction_id,SUM(ABS(allocated_amount)) used FROM accounting_payment_allocations WHERE status='CONFIRMED' GROUP BY bank_transaction_id) s ON s.bank_transaction_id=t.id WHERE t.trans_at>=? AND t.trans_at<? AND t.classification<>'INTERNAL_TRANSFER' AND a.currency='KRW' AND t.deposit_amount+t.withdraw_amount>COALESCE(s.used,0) ORDER BY t.trans_at DESC,t.id DESC",from,to.plusDays(1));
        return Map.of("plans",cleaned,"unlinked",clean(unlinked),"accounts",clean(jdbc.queryForList("SELECT alias,last_sync_at,last_sync_error FROM accounting_bank_accounts WHERE active=TRUE AND currency='KRW'")));
    }
    public record ReviewInput(int version,boolean complete,String note,List<CashPlanController.AllocationItem> items) {}
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void confirmExecution(long id,ReviewInput input,long user) {
        requireReady();lock(id);var old=read(id);version(old,input.version());
        if("VOID".equals(old.get("status")))throw new IllegalArgumentException("취소된 계획입니다.");
        if(text(input.note()).length()>1000)throw new IllegalArgumentException("확인 메모는 1,000자 이내로 입력해주세요.");
        var items=input.items()==null?List.<CashPlanController.AllocationItem>of():input.items();
        if(items.size()>200 || items.stream().anyMatch(Objects::isNull) || items.stream().map(CashPlanController.AllocationItem::transactionId).distinct().count()!=items.size())throw new IllegalArgumentException("중복 없이 200건 이내로 선택해주세요.");
        int version=input.version();
        for(var item:items.stream().sorted(Comparator.comparingLong(CashPlanController.AllocationItem::transactionId)).toList())
            allocate(id,new CashPlanController.Allocation(item.transactionId(),item.amount(),version++,item.requestKey()),user,false,true);
        var current=read(id);
        if(input.complete() && money(current,"settled").signum()<=0)throw new IllegalArgumentException("실제 입출금 거래를 연결한 뒤 완료해주세요.");
        if(input.complete() && !withinTolerance(money(current,"amount"),money(current,"settled")) && text(input.note()).isBlank())throw new IllegalArgumentException("금액 미정 또는 ±20% 범위 밖 완료에는 확인 사유를 입력해주세요.");
        jdbc.update("UPDATE accounting_cash_plans SET execution_confirmed=?,execution_reviewed=TRUE,review_note=?,reviewed_by=?,reviewed_at=NOW(6) WHERE ledger_entry_id=?",input.complete(),text(input.note()),user,id);
        jdbc.update("UPDATE accounting_ledger_entries SET version=version+1,updated_by=? WHERE id=?",user,id);
        audit(user,"UPDATE",id,old,read(id));
    }
    public record MatchRule(int version,String keywords,int days) {}
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void matchRule(long id,MatchRule input,long user) {
        lock(id);var old=read(id);version(old,input.version());
        if(input.days()<0 || input.days()>14 || text(input.keywords()).length()>500)throw new IllegalArgumentException("날짜 범위는 0~14일, 검색어는 500자 이내로 입력해주세요.");
        jdbc.update("UPDATE accounting_cash_plans SET match_keywords=?,match_days=? WHERE ledger_entry_id=?",text(input.keywords()),input.days(),id);
        jdbc.update("UPDATE accounting_ledger_entries SET version=version+1,updated_by=? WHERE id=?",user,id);audit(user,"UPDATE",id,old,read(id));
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void allocateBatch(long id,CashPlanController.AllocationBatch input,long user) {
        var items=input.items();
        if(items==null || items.isEmpty() || items.size()>200 || items.stream().anyMatch(Objects::isNull))
            throw new IllegalArgumentException("반영할 거래를 1~200건 선택해주세요.");
        Set<Long> transactionIds=new HashSet<>();
        Set<String> requestKeys=new HashSet<>();
        for(var item:items) {
            if(!transactionIds.add(item.transactionId()) || !requestKeys.add(item.requestKey()))
                throw new IllegalArgumentException("같은 거래를 두 번 선택할 수 없습니다.");
        }
        int version=input.version();
        // Acquire transaction locks in the same order across concurrent batches.
        for(var item:items.stream().sorted(Comparator.comparingLong(CashPlanController.AllocationItem::transactionId)).toList()) {
            allocate(id,new CashPlanController.Allocation(item.transactionId(),item.amount(),version++,item.requestKey()),user,true);
        }
    }
    @Transactional(isolation=Isolation.READ_COMMITTED) public void allocate(long id,CashPlanController.Allocation input,long user) {
        allocate(id,input,user,false);
    }
    private void allocate(long id,CashPlanController.Allocation input,long user,boolean wholeTransaction) { allocate(id,input,user,wholeTransaction,false); }
    private void allocate(long id,CashPlanController.Allocation input,long user,boolean wholeTransaction,boolean review) {
        requireReady();positive(input.amount());key(input.requestKey());lock(id);var plan=read(id);
        String requestKey="cash:"+user+":"+input.requestKey();
        var previous=jdbc.queryForList("SELECT ledger_entry_id,bank_transaction_id,allocated_amount,status FROM accounting_payment_allocations WHERE idempotency_key=?",requestKey);
        if(!previous.isEmpty()) { var row=previous.get(0);if(number(row.get("ledger_entry_id"))!=id || number(row.get("bank_transaction_id"))!=input.transactionId() || money(row,"allocated_amount").abs().compareTo(input.amount())!=0 || !"CONFIRMED".equals(row.get("status")))throw new IllegalArgumentException("이미 처리된 요청입니다. 화면을 새로고침해주세요.");return; }
        version(plan,input.version());
        if("VOID".equals(plan.get("status")))throw new IllegalArgumentException("취소된 계획입니다.");
        var rows=jdbc.queryForList("SELECT * FROM accounting_bank_transactions WHERE id=? FOR UPDATE",input.transactionId());
        if(rows.isEmpty())throw new IllegalArgumentException("거래를 찾을 수 없습니다.");var bank=rows.get(0);
        if("INTERNAL_TRANSFER".equals(bank.get("classification")))throw new IllegalArgumentException("내부이체는 외부 입출금 계획에 연결할 수 없습니다.");
        if(plan.get("account_id")!=null && !number(plan.get("account_id")).equals(number(bank.get("bank_account_id"))))throw new IllegalArgumentException("예정 계좌와 실제 계좌가 다릅니다. 계획의 계좌를 먼저 수정해주세요.");
        if(!"KRW".equals(jdbc.queryForObject("SELECT currency FROM accounting_bank_accounts WHERE id=?",String.class,bank.get("bank_account_id"))))throw new IllegalArgumentException("원화 계좌만 연결할 수 있습니다.");
        BigDecimal amount=money(bank,"IN".equals(plan.get("direction"))?"deposit_amount":"withdraw_amount");
        boolean reversal=amount.signum()==0;
        if(reversal && !review)throw new IllegalArgumentException("입출금 방향이 다릅니다.");
        if(reversal)amount=money(bank,"deposit_amount").add(money(bank,"withdraw_amount"));
        BigDecimal used=jdbc.queryForObject("SELECT COALESCE(SUM(ABS(allocated_amount)),0) FROM accounting_payment_allocations WHERE bank_transaction_id=? AND status='CONFIRMED'",BigDecimal.class,input.transactionId());
        if(wholeTransaction && (input.amount().compareTo(amount)!=0 || used.signum()!=0))
            throw new IllegalArgumentException("은행거래의 전체 금액으로만 확인할 수 있습니다. 거래 목록을 다시 확인해주세요.");
        if(reversal && input.amount().compareTo(money(plan,"settled"))>0)throw new IllegalArgumentException("반환액이 기존 집행액을 초과합니다.");
        if(input.amount().compareTo(amount.subtract(used))>0 || (!review && input.amount().compareTo(money(plan,"remaining"))>0))throw new IllegalArgumentException("거래의 반영 가능 금액 또는 계획의 남은 금액을 초과합니다.");
        jdbc.update("INSERT INTO accounting_payment_allocations(ledger_entry_id,bank_transaction_id,payment_method,allocated_amount,settled_at,status,idempotency_key,created_by) VALUES(?,?,'BANK',?,?,'CONFIRMED',?,?)",id,input.transactionId(),reversal?input.amount().negate():input.amount(),bank.get("trans_at"),requestKey,user);
        jdbc.update("UPDATE accounting_ledger_entries SET version=version+1,updated_by=? WHERE id=?",user,id);
        if("UNCLASSIFIED".equals(bank.get("classification")))jdbc.update("UPDATE accounting_bank_transactions SET classification=? WHERE id=?",plan.get("card_issuer")==null?"NORMAL":"CARD_PAYMENT",input.transactionId());
        jdbc.update("UPDATE accounting_cash_plans SET execution_confirmed=FALSE,execution_reviewed=FALSE WHERE ledger_entry_id=?",id);
        audit(user,"UPDATE",id,plan,read(id));
    }
    @Transactional(isolation=Isolation.READ_COMMITTED) public void unlink(long id,long allocationId,long user) {
        requireReady();lock(id);var old=read(id);
        var rows=jdbc.queryForList("SELECT bank_transaction_id,allocated_amount FROM accounting_payment_allocations WHERE id=? AND ledger_entry_id=? AND status='CONFIRMED'",allocationId,id);
        if(rows.isEmpty())throw new IllegalArgumentException("반영 내역을 찾을 수 없습니다.");
        jdbc.queryForMap("SELECT id FROM accounting_bank_transactions WHERE id=? FOR UPDATE",rows.get(0).get("bank_transaction_id"));
        if(money(old,"settled").subtract(money(rows.get(0),"allocated_amount")).signum()<0)throw new IllegalArgumentException("연결된 반환 거래를 먼저 해제해주세요.");
        jdbc.update("UPDATE accounting_payment_allocations SET status='VOID' WHERE id=?",allocationId);
        jdbc.update("UPDATE accounting_cash_plans SET execution_confirmed=FALSE,execution_reviewed=FALSE WHERE ledger_entry_id=?",id);
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
        if(p.amount()==null) {
            if(!"OUT".equals(p.direction()) || !"ESTIMATED".equals(p.certainty()))
                throw new IllegalArgumentException("금액 미정은 추정 출금 계획에만 사용할 수 있습니다.");
        } else positive(p.amount());
        if(p.plannedDate()==null || p.plannedDate().getYear()<2000 || p.plannedDate().getYear()>2100 || p.months()<1 || p.months()>200 || p.plannedDate().plusMonths(p.months()-1L).getYear()>2100)throw new IllegalArgumentException("예정일과 종료월을 확인해주세요. 한 번에 최대 200회차까지 등록할 수 있습니다.");
        if(text(p.counterparty()).length()>200 || text(p.category()).length()>100 || text(p.memo()).length()>5000)throw new IllegalArgumentException("거래처·분류·메모가 너무 깁니다.");
        if(p.accountId()!=null && jdbc.queryForObject("SELECT COUNT(*) FROM accounting_bank_accounts WHERE id=? AND active=TRUE AND currency='KRW'",Integer.class,p.accountId())!=1)throw new IllegalArgumentException("사용 가능한 원화 계좌를 선택해주세요.");
        if(p.cardIssuer()!=null && (!Set.of("BC","HANA").contains(p.cardIssuer()) || !"OUT".equals(p.direction()) || p.billingMonth()==null || p.billingMonth().getDayOfMonth()!=1 || p.accountId()==null))throw new IllegalArgumentException("카드대금은 카드사·결제월·출금계좌가 필요합니다.");
        if(p.cardIssuer()!=null) {
            var bank=jdbc.queryForMap("SELECT bank_code,bank_name FROM accounting_bank_accounts WHERE id=?",p.accountId());
            if(!cardBankMatches(p.cardIssuer(),String.valueOf(bank.get("bank_code")),String.valueOf(bank.get("bank_name"))))throw new IllegalArgumentException("BC카드는 기업은행, 하나카드는 하나은행 출금계좌를 선택해주세요.");
        }
        if(p.cardIssuer()==null && p.billingMonth()!=null)throw new IllegalArgumentException("일반 계획에는 카드 결제월을 지정할 수 없습니다.");
    }
    private static BigDecimal plannedAmount(PlanInput p) {
        return p.amount()==null ? BigDecimal.ZERO : p.amount();
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
