package com.pentaworks.intranet.accounting;

import java.time.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@EnableScheduling
public class BankAutoSync {
    private static final Logger log=LoggerFactory.getLogger(BankAutoSync.class);
    private final AccountingService service;
    private final BarobillClient client;
    private final AccountCrypto crypto;
    private final JdbcTemplate jdbc;
    private final TaskScheduler scheduler;
    private final boolean enabled;
    public BankAutoSync(AccountingService service,BarobillClient client,AccountCrypto crypto,JdbcTemplate jdbc,TaskScheduler scheduler,@Value("${app.accounting.auto-sync-enabled:true}") boolean enabled){this.service=service;this.client=client;this.crypto=crypto;this.jdbc=jdbc;this.scheduler=scheduler;this.enabled=enabled;}
    @EventListener(ApplicationReadyEvent.class)
    public void startup(){if(enabled)scheduler.schedule(this::sync,Instant.now().plusSeconds(20));}
    // Leave time for Barobill's sequential bank collection to finish.
    @Scheduled(cron="0 15 0/4 * * *",zone="Asia/Seoul")
    public void sync(){
        if(!enabled || !client.ready() || !crypto.ready())return;
        try{
            if(!service.schemaReady())return;
            jdbc.execute((ConnectionCallback<Void>) connection->{
                try(var statement=connection.prepareStatement("SELECT GET_LOCK('office_bank_auto_sync',0)")){
                    try(var result=statement.executeQuery()){result.next();if(result.getInt(1)!=1)return null;}
                }
                try{
                    var users=jdbc.queryForList("SELECT id FROM users WHERE role='ADMIN' AND active=1 ORDER BY id LIMIT 1");
                    if(users.isEmpty()){log.warn("Bank auto-sync skipped: no active administrator for audit");return null;}
                    long actor=((Number)users.get(0).get("id")).longValue();
                    service.refreshAccounts(client.accounts(),actor);
                    LocalDate to=LocalDate.now(ZoneId.of("Asia/Seoul")),from=to.minusDays(90);
                    for(var account:service.accounts()){
                        if(!Boolean.TRUE.equals(account.get("active")) && !"1".equals(String.valueOf(account.get("active"))))continue;
                        long id=((Number)account.get("id")).longValue();
                        try{
                            String number=service.accountNumber(id);
                            service.importBank(id,number,from,to,client.transactions(number,from,to),actor);
                        }catch(Exception ex){
                            String message=ex instanceof BarobillClient.UpstreamException || ex instanceof IllegalArgumentException?ex.getMessage():"계좌 자동 갱신에 실패했습니다. 관리자에게 문의해주세요.";
                            jdbc.update("UPDATE accounting_bank_accounts SET last_sync_error=? WHERE id=?",message,id);
                            log.warn("Bank auto-sync failed for internal account {}",id);
                        }
                    }
                } finally {try(var release=connection.prepareStatement("SELECT RELEASE_LOCK('office_bank_auto_sync')")){release.execute();}}
                return null;
            });
        }catch(Exception ex){log.warn("Bank auto-sync failed before account processing ({})",ex.getClass().getSimpleName());}
    }
}
