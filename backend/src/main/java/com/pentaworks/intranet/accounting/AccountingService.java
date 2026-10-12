package com.pentaworks.intranet.accounting;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class AccountingService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final AccountCrypto crypto;
    private final TransactionTemplate transaction;
    public AccountingService(JdbcTemplate jdbc,ObjectMapper mapper,AccountCrypto crypto,PlatformTransactionManager manager) {
        this.jdbc=jdbc;this.mapper=mapper;this.crypto=crypto;transaction=new TransactionTemplate(manager);transaction.setTimeout(120);
    }
    public boolean schemaReady() { return jdbc.queryForObject("SELECT COUNT(*) FROM schema_migrations WHERE version IN ('013_accounting','014_accounting_import')",Integer.class)==2; }
    void requireSchema(){if(!schemaReady())throw new IllegalArgumentException("회계 DB 업데이트가 필요합니다. 서버 관리자에게 문의해주세요.");}
    public List<Map<String,Object>> cards(){requireSchema();return jdbc.queryForList("SELECT id,issuer,card_num_masked,alias,active FROM accounting_cards ORDER BY issuer,alias");}
    public List<Map<String,Object>> accounts(){requireSchema();return jdbc.queryForList("SELECT a.id,a.bank_name,a.account_num_masked,a.alias,a.currency,a.active,(SELECT MAX(t.last_imported_at) FROM accounting_bank_transactions t WHERE t.bank_account_id=a.id) last_imported_at FROM accounting_bank_accounts a ORDER BY a.bank_name,a.id");}

    public Map<String,Object> cardPreview(CardExcelParser.Parsed parsed) {
        requireSchema(); int added=0,updated=0,unchanged=0; BigDecimal total=BigDecimal.ZERO; List<Map<String,Object>> preview=new ArrayList<>();
        for(var row:parsed.rows()) {
            var matches=cardMatches(row);if(matches.size()>1)throw new IllegalArgumentException("같은 마스킹 번호의 카드가 여러 개 등록돼 있습니다. 카드 등록을 확인해주세요.");
            Map<String,Object> old=matches.isEmpty()?null:existingCard(((Number)matches.get(0).get("id")).longValue(),row.key());
            String status=old==null?"NEW":equalFields(old,row.fields())?"UNCHANGED":"UPDATE";
            if(status.equals("NEW"))added++; else if(status.equals("UPDATE"))updated++;else unchanged++;
            if(status.equals("UPDATE")) ensureCardUnallocated(old,row);
            total=total.add(row.net());
            if(preview.size()<100){var item=new LinkedHashMap<String,Object>();item.put("row",row.row());item.put("cardNumber",row.cardNumber());item.put("date",row.fields().get("approval_date"));item.put("approvalNo",row.fields().get("approval_no"));item.put("merchant",row.fields().get("merchant_name"));item.put("amount",row.net());item.put("status",status);item.put("approvalStatus",row.fields().get("approval_status"));preview.add(item);}
        }
        var result=new LinkedHashMap<String,Object>();result.put("issuer",parsed.issuer());result.put("fileHash",parsed.fileHash());result.put("total",parsed.rows().size());result.put("inserted",added);result.put("updated",updated);result.put("unchanged",unchanged);result.put("netAmount",total);result.put("rows",preview);return result;
    }
    public Map<String,Object> importCards(CardExcelParser.Parsed parsed,String filename,long user) {
        requireSchema();
        return transaction.execute(tx->{
            // Consistent lock order across multi-card uploads avoids duplicate mapping and deadlocks.
            Map<String,Long> cardIds=new HashMap<>();
            for(var row:parsed.rows().stream().sorted(Comparator.comparing(CardExcelParser.CardRow::cardNumber)).toList()) {
                if(cardIds.containsKey(row.cardNumber()))continue;
                String identity=CardExcelParser.sha((row.issuer()+"|"+row.cardNumber()).getBytes(StandardCharsets.UTF_8));
                var matches=cardMatches(row);
                if(matches.size()>1)throw new IllegalArgumentException("같은 마스킹 번호의 카드가 여러 개 등록돼 있습니다.");
                if(matches.isEmpty())jdbc.update("INSERT INTO accounting_cards(issuer,card_num_masked,alias,import_identity) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE import_identity=VALUES(import_identity)",row.issuer(),row.cardNumber(),row.issuer()+" · "+row.cardNumber().substring(row.cardNumber().length()-4),identity);
                else jdbc.update("UPDATE accounting_cards SET import_identity=? WHERE id=?",identity,matches.get(0).get("id"));
                var card=jdbc.queryForMap("SELECT id,active FROM accounting_cards WHERE import_identity=? FOR UPDATE",identity);
                if(!Boolean.parseBoolean(String.valueOf(card.get("active"))) && !"1".equals(String.valueOf(card.get("active"))))throw new IllegalArgumentException("비활성 카드는 업로드할 수 없습니다.");
                cardIds.put(row.cardNumber(),((Number)card.get("id")).longValue());
            }
            int added=0,updated=0,unchanged=0;
            for(var row:parsed.rows()) {
                long card=cardIds.get(row.cardNumber());var old=existingCard(card,row.key());
                if(old!=null && equalFields(old,row.fields())){jdbc.update("UPDATE accounting_card_transactions SET last_imported_at=CURRENT_TIMESTAMP(6) WHERE id=?",old.get("id"));unchanged++;continue;}
                if(old!=null)ensureCardUnallocated(old,row);
                var f=new LinkedHashMap<>(row.fields());f.put("source_filename",filename);f.put("source_sheet",row.sheet());f.put("source_row",row.row());f.put("raw_payload",json(row.raw()));
                if(old==null){f.put("card_id",card);f.put("source_event_key",row.key());f.put("imported_by",user);insert("accounting_card_transactions",f);added++;}
                else {update("accounting_card_transactions",f,old.get("id"));jdbc.update("UPDATE accounting_card_transactions SET last_imported_at=CURRENT_TIMESTAMP(6) WHERE id=?",old.get("id"));audit(user,"UPDATE","ACCOUNTING_CARD",old.get("id"),withoutRaw(old),row.fields());updated++;}
            }
            // Link only unambiguous approvals; historical cancellations may have no original in this file.
            for(long card:cardIds.values())jdbc.update("UPDATE accounting_card_transactions c JOIN (SELECT card_id,approval_no,approval_date,MIN(id) id,COUNT(*) n FROM accounting_card_transactions WHERE event_type='APPROVAL' AND card_id=? GROUP BY card_id,approval_no,approval_date) a ON c.card_id=a.card_id AND c.approval_no=a.approval_no AND c.approval_date=a.approval_date SET c.related_approval_id=a.id WHERE c.event_type='CANCELLATION' AND a.n=1 AND c.related_approval_id IS NULL",card);
            Map<String,Object> result=Map.of("total",parsed.rows().size(),"inserted",added,"updated",updated,"unchanged",unchanged,"issuer",parsed.issuer(),"fileHash",parsed.fileHash());
            audit(user,"CREATE","ACCOUNTING_IMPORT",null,null,result);return result;
        });
    }
    private List<Map<String,Object>> cardMatches(CardExcelParser.CardRow row){return jdbc.queryForList("SELECT id FROM accounting_cards WHERE issuer=? AND REPLACE(UPPER(card_num_masked),'-','')=?",row.issuer(),row.cardNumber());}
    private Map<String,Object> existingCard(long card,String key){var list=jdbc.queryForList("SELECT * FROM accounting_card_transactions WHERE card_id=? AND source_event_key=?",card,key);return list.isEmpty()?null:list.get(0);}
    private void ensureCardUnallocated(Map<String,Object> old,CardExcelParser.CardRow row){
        boolean amountChanged=List.of("approval_amount","approval_cancel_amount","purchase_amount","purchase_cancel_amount").stream().anyMatch(k->!equalValue(old.get(k),row.fields().get(k)));
        if(amountChanged && jdbc.queryForObject("SELECT COUNT(*) FROM accounting_payment_allocations WHERE card_transaction_id=? AND status='CONFIRMED'",Integer.class,old.get("id"))>0)throw new IllegalArgumentException("이미 지급 연결된 카드 거래의 금액이 변경됐습니다. 연결 내역을 먼저 확인해주세요.");
    }
    public int refreshAccounts(List<BarobillClient.RemoteAccount> remote,long user) {
        requireSchema();if(!crypto.ready())throw new IllegalArgumentException("서버 계좌 암호화 설정이 필요합니다.");
        return transaction.execute(tx->{int count=0;
            for(var a:remote) {
                if(a.foreign())continue; // Foreign account API requires a different method and per-currency identity.
                String key=crypto.identity(a.bankCode(),a.number());
                String alias=a.alias().isBlank()?a.bankName()+" "+AccountCrypto.masked(a.number()):a.alias();
                jdbc.update("INSERT INTO accounting_bank_accounts(bank_code,bank_name,account_num_encrypted,account_identity_hash,account_num_masked,alias,currency) VALUES(?,?,?,?,?,?,'KRW') ON DUPLICATE KEY UPDATE bank_name=VALUES(bank_name)",a.bankCode(),a.bankName(),crypto.encrypt(a.number()),key,AccountCrypto.masked(a.number()),alias);count++;
            }
            audit(user,"CREATE","ACCOUNTING_ACCOUNTS",null,null,Map.of("count",count));return count;
        });
    }
    public String accountNumber(long id){requireSchema();var account=jdbc.queryForMap("SELECT account_num_encrypted,currency,active FROM accounting_bank_accounts WHERE id=?",id);if(!"KRW".equals(account.get("currency")))throw new IllegalArgumentException("현재 계좌조회는 원화 계좌를 지원합니다.");if(!Boolean.parseBoolean(String.valueOf(account.get("active"))) && !"1".equals(String.valueOf(account.get("active"))))throw new IllegalArgumentException("비활성 계좌입니다.");return crypto.decrypt(String.valueOf(account.get("account_num_encrypted")));}
    public Map<String,Object> importBank(long id,String number,LocalDate from,LocalDate to,List<Map<String,String>> rows,long user) {
        requireSchema();BarobillClient.checkDates(from,to);
        // Validate the complete remote result before acquiring any write locks.
        List<Map<String,Object>> parsed=new ArrayList<>();
        for(var raw:rows) {
            if(!number.equals(raw.getOrDefault("BankAccountNum","").replace("-","").replace(" ","")))throw new IllegalArgumentException("응답 계좌번호가 선택한 계좌와 다릅니다.");
            String currency=raw.getOrDefault("CurrencyCode","");if(!currency.isBlank() && !currency.equals("KRW"))throw new IllegalArgumentException("외화 거래가 포함되어 있어 저장하지 않았습니다.");
            String key=raw.get("TransRefKey");if(key==null || key.isBlank() || key.length()>255)throw new IllegalArgumentException("계좌 거래키가 올바르지 않습니다.");
            LocalDateTime at;try{at=LocalDateTime.parse(raw.get("TransDT"),DateTimeFormatter.ofPattern("uuuuMMddHHmmss").withResolverStyle(java.time.format.ResolverStyle.STRICT));}catch(Exception ex){throw new IllegalArgumentException("계좌 거래일시가 올바르지 않습니다.");}
            if(at.toLocalDate().isBefore(from)||at.toLocalDate().isAfter(to))throw new IllegalArgumentException("조회 기간 밖의 계좌 거래가 포함되어 있습니다.");
            BigDecimal deposit=CardExcelParser.money(raw.get("Deposit"),false),withdraw=CardExcelParser.money(raw.get("Withdraw"),false);
            if(!((deposit.signum()>0 && withdraw.signum()==0)||(withdraw.signum()>0 && deposit.signum()==0)))throw new IllegalArgumentException("입출금 금액이 올바르지 않습니다. 거래를 저장하지 않았습니다.");
            var safeRaw=new LinkedHashMap<>(raw);safeRaw.remove("BankAccountNum");
            Map<String,Object> f=new LinkedHashMap<>();f.put("trans_ref_key",key);f.put("trans_at",at);f.put("deposit_amount",deposit);f.put("withdraw_amount",withdraw);f.put("balance_after",CardExcelParser.money(raw.get("Balance"),true));f.put("description",raw.getOrDefault("TransRemark1",""));f.put("counterparty_text",raw.getOrDefault("TransRemark2",""));f.put("raw_payload",json(safeRaw));parsed.add(f);
        }
        return transaction.execute(tx->{
            jdbc.queryForMap("SELECT id FROM accounting_bank_accounts WHERE id=? FOR UPDATE",id);
            Set<Object> keys=new HashSet<>();int added=0,updated=0,unchanged=0;
            for(var f:parsed) {
                if(!keys.add(f.get("trans_ref_key")))throw new IllegalArgumentException("중복된 계좌 거래키가 있습니다.");
                var oldRows=jdbc.queryForList("SELECT * FROM accounting_bank_transactions WHERE bank_account_id=? AND trans_ref_key=?",id,f.get("trans_ref_key"));
                var old=oldRows.isEmpty()?null:oldRows.get(0);
                // JSON formatting is provider metadata; money/time/remarks determine material change.
                var compare=new LinkedHashMap<>(f);compare.remove("raw_payload");
                if(old!=null && equalFields(old,compare)){jdbc.update("UPDATE accounting_bank_transactions SET last_imported_at=CURRENT_TIMESTAMP(6) WHERE id=?",old.get("id"));unchanged++;continue;}
                if(old!=null && (!equalValue(old.get("deposit_amount"),f.get("deposit_amount")) || !equalValue(old.get("withdraw_amount"),f.get("withdraw_amount"))) && jdbc.queryForObject("SELECT COUNT(*) FROM accounting_payment_allocations WHERE bank_transaction_id=? AND status='CONFIRMED'",Integer.class,old.get("id"))>0)throw new IllegalArgumentException("지급 연결된 계좌 거래의 금액이 변경됐습니다. 연결 내역을 먼저 확인해주세요.");
                if(old==null){var insert=new LinkedHashMap<>(f);insert.put("bank_account_id",id);insert("accounting_bank_transactions",insert);added++;}
                else{update("accounting_bank_transactions",f,old.get("id"));jdbc.update("UPDATE accounting_bank_transactions SET last_imported_at=CURRENT_TIMESTAMP(6) WHERE id=?",old.get("id"));audit(user,"UPDATE","ACCOUNTING_BANK",old.get("id"),withoutRaw(old),compare);updated++;}
            }
            Map<String,Object> result=Map.of("total",rows.size(),"inserted",added,"updated",updated,"unchanged",unchanged);
            audit(user,"CREATE","ACCOUNTING_BANK_SYNC",id,null,result);return result;
        });
    }

    public Map<String,Object> transactions(boolean card,LocalDate from,LocalDate to,Long source,int page) {
        requireSchema();BarobillClient.checkDates(from,to);if(page<1 || page>10000)throw new IllegalArgumentException("페이지 번호가 올바르지 않습니다.");
        String table=card?"accounting_card_transactions":"accounting_bank_transactions",date=card?"approval_date":"trans_at",fk=card?"card_id":"bank_account_id";
        String filter=" WHERE t."+date+">=? AND t."+date+"<?"+(source==null?"":" AND t."+fk+"=?");List<Object> params=new ArrayList<>(List.of(from,to.plusDays(1)));if(source!=null)params.add(source);
        int total=jdbc.queryForObject("SELECT COUNT(*) FROM "+table+" t"+filter,Integer.class,params.toArray());
        var summary=jdbc.queryForMap("SELECT "+(card?"COALESCE(SUM(net_approval_amount),0) netAmount":"COALESCE(SUM(deposit_amount),0) depositAmount,COALESCE(SUM(withdraw_amount),0) withdrawAmount")+" FROM "+table+" t"+filter,params.toArray());
        String fields=card?"t.id,t.card_id,t.approval_date,t.source_time,t.approval_no,t.merchant_name,t.net_approval_amount,t.net_purchase_amount,t.approval_status,t.purchase_status,t.vat_amount,c.alias,c.issuer,c.card_num_masked":"t.id,t.bank_account_id,t.trans_at,t.deposit_amount,t.withdraw_amount,t.balance_after,t.description,t.counterparty_text,t.classification,c.alias,c.account_num_masked,c.currency";
        params.add((page-1)*50);
        var records=jdbc.queryForList("SELECT "+fields+" FROM "+table+" t JOIN "+(card?"accounting_cards":"accounting_bank_accounts")+" c ON c.id=t."+fk+filter+" ORDER BY t."+date+" DESC,t.id DESC LIMIT 50 OFFSET ?",params.toArray());
        return Map.of("rows",records,"total",total,"page",page,"pageSize",50,"summary",summary);
    }
    public long user(String login){return jdbc.queryForObject("SELECT id FROM users WHERE login_id=?",Long.class,login);}
    private boolean equalFields(Map<String,Object> old,Map<String,Object> fields){return fields.entrySet().stream().allMatch(e->equalValue(old.get(e.getKey()),e.getValue()));}
    private boolean equalValue(Object a,Object b){
        if(a==null || b==null)return a==b;
        if(a instanceof Number && b instanceof Number)return new BigDecimal(a.toString()).compareTo(new BigDecimal(b.toString()))==0;
        if(a instanceof java.sql.Date d)return d.toLocalDate().equals(b);
        if(a instanceof java.sql.Time t)return t.toLocalTime().equals(b);
        if(a instanceof java.sql.Timestamp t)return t.toLocalDateTime().equals(b);
        return a.toString().equals(b.toString());
    }
    private void insert(String table,LinkedHashMap<String,Object> fields){jdbc.update("INSERT INTO "+table+"("+String.join(",",fields.keySet())+") VALUES("+String.join(",",Collections.nCopies(fields.size(),"?"))+")",fields.values().toArray());}
    private void update(String table,Map<String,Object> fields,Object id){List<Object> args=new ArrayList<>(fields.values());args.add(id);jdbc.update("UPDATE "+table+" SET "+String.join(",",fields.keySet().stream().map(k->k+"=?").toList())+" WHERE id=?",args.toArray());}
    private String json(Object value){try{return mapper.writeValueAsString(value);}catch(Exception ex){throw new IllegalArgumentException("원본 자료를 변환할 수 없습니다.");}}
    private Map<String,Object> withoutRaw(Map<String,Object> old){var copy=new LinkedHashMap<>(old);copy.remove("raw_payload");return copy;}
    private void audit(long user,String action,String type,Object id,Object old,Object value){jdbc.update("INSERT INTO audit_logs(user_id,action,target_type,target_id,old_value,new_value) VALUES(?,?,?,?,?,?)",user,action,type,id,old==null?null:json(old),json(value));}
}
