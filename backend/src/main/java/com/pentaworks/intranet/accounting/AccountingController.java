package com.pentaworks.intranet.accounting;

import java.time.LocalDate;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/accounting")
public class AccountingController {
    private final AccountingService service;
    private final CardExcelParser parser;
    private final BarobillClient barobill;
    private final AccountCrypto crypto;
    public AccountingController(AccountingService service,CardExcelParser parser,BarobillClient barobill,AccountCrypto crypto){this.service=service;this.parser=parser;this.barobill=barobill;this.crypto=crypto;}
    @org.springframework.beans.factory.annotation.Value("${app.accounting.auto-sync-enabled:true}") private boolean autoSyncEnabled;
    @GetMapping("/status") public Map<String,Object> status(){return Map.of("schemaReady",service.schemaReady(),"bankReady",barobill.ready()&&crypto.ready(),"environment",barobill.environment(),"autoSyncEnabled",autoSyncEnabled);}
    @GetMapping("/card-uploads") public Object uploads(){return service.uploads();}
    @GetMapping("/card-transactions/removed") public Object removed(){return service.removedCards();}
    @PostMapping("/card-uploads/{id}/rollback") public Object rollback(@PathVariable long id,Authentication auth){return service.rollbackUpload(id,service.user(auth.getName()));}
    @DeleteMapping("/card-transactions/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void remove(@PathVariable long id,Authentication auth){service.removeCard(id,false,service.user(auth.getName()));}
    @PostMapping("/card-transactions/{id}/restore") @ResponseStatus(HttpStatus.NO_CONTENT) public void restore(@PathVariable long id,Authentication auth){service.removeCard(id,true,service.user(auth.getName()));}
    @GetMapping("/cards") public Object cards(){return service.cards();}
    @GetMapping("/bank-accounts") public Object accounts(){return service.accounts();}
    @PostMapping("/bank-accounts/refresh") public Object refresh(Authentication auth){
        service.requireSchema();if(!crypto.ready())throw new IllegalArgumentException("계좌 암호화 설정이 필요합니다.");
        var remote=barobill.accounts();int count=service.refreshAccounts(remote,service.user(auth.getName()));
        return Map.of("count",count,"skippedForeign",remote.stream().filter(BarobillClient.RemoteAccount::foreign).count());
    }
    public record BankSync(long accountId,LocalDate from,LocalDate to){}
    @PostMapping("/bank-transactions/sync") public Object sync(@RequestBody BankSync req,Authentication auth){
        BarobillClient.checkDates(req.from(),req.to());String number=service.accountNumber(req.accountId());
        var rows=barobill.transactions(number,req.from(),req.to());return service.importBank(req.accountId(),number,req.from(),req.to(),rows,service.user(auth.getName()));
    }
    @GetMapping("/bank-transactions") public Object bankTransactions(@RequestParam LocalDate from,@RequestParam LocalDate to,@RequestParam(required=false) Long source,@RequestParam(defaultValue="1") int page){return service.transactions(false,from,to,source,page);}
    @GetMapping("/card-transactions") public Object cardTransactions(@RequestParam LocalDate from,@RequestParam LocalDate to,@RequestParam(required=false) Long source,@RequestParam(defaultValue="1") int page){return service.transactions(true,from,to,source,page);}
    @PostMapping("/card-import/preview") public Object preview(@RequestParam MultipartFile file,@RequestParam String issuer) throws java.io.IOException {
        if(file.getSize()>5*1024*1024)throw new IllegalArgumentException("카드 엑셀은 최대 5MB까지 업로드할 수 있습니다.");
        return service.cardPreview(parser.parse(file.getBytes(),file.getOriginalFilename(),issuer));
    }
    @PostMapping("/card-import/commit") public Object commit(@RequestParam MultipartFile file,@RequestParam String issuer,@RequestParam String fileHash,Authentication auth) throws java.io.IOException {
        if(file.getSize()>5*1024*1024)throw new IllegalArgumentException("카드 엑셀은 최대 5MB까지 업로드할 수 있습니다.");
        var parsed=parser.parse(file.getBytes(),file.getOriginalFilename(),issuer);
        if(!parsed.fileHash().equals(fileHash))throw new IllegalArgumentException("검증한 파일과 다릅니다. 다시 검증해주세요.");
        String name=Objects.requireNonNullElse(file.getOriginalFilename(),"card.xlsx").replace('\\','/');name=name.substring(name.lastIndexOf('/')+1);
        if(name.length()>255)throw new IllegalArgumentException("파일명이 너무 깁니다.");
        return service.importCards(parsed,name,service.user(auth.getName()));
    }
    @ExceptionHandler(BarobillClient.UpstreamException.class)
    @ResponseStatus(HttpStatus.BAD_GATEWAY)
    public Map<String,String> upstream(BarobillClient.UpstreamException ex){return Map.of("message",ex.getMessage());}
}
