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
    private final CashPlanService cash;
    private final BarobillClient barobill;
    private final AccountCrypto crypto;
    public AccountingController(AccountingService service,CardExcelParser parser,BarobillClient barobill,AccountCrypto crypto,CashPlanService cash){this.cash=cash;this.service=service;this.parser=parser;this.barobill=barobill;this.crypto=crypto;}
    @org.springframework.beans.factory.annotation.Value("${app.accounting.auto-sync-enabled:true}") private boolean autoSyncEnabled;
    @GetMapping("/status") public Map<String,Object> status(){return Map.of("schemaReady",service.schemaReady(),"bankReady",barobill.ready()&&crypto.ready(),"environment",barobill.environment(),"autoSyncEnabled",autoSyncEnabled);}
    @GetMapping("/card-uploads") public Object uploads(){return service.uploads();}
    @GetMapping("/card-transactions/removed") public Object removed(){return service.removedCards();}
    @PostMapping("/card-uploads/{id}/rollback") public Object rollback(@PathVariable long id,Authentication auth){return service.rollbackUpload(id,service.user(auth.getName()));}
    @DeleteMapping("/card-transactions/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void remove(@PathVariable long id,Authentication auth){service.removeCard(id,false,service.user(auth.getName()));}
    @PostMapping("/card-transactions/{id}/restore") @ResponseStatus(HttpStatus.NO_CONTENT) public void restore(@PathVariable long id,Authentication auth){service.removeCard(id,true,service.user(auth.getName()));}
    @GetMapping("/cards") public Object cards(){return service.cards();}
    @PutMapping("/card-transactions/{id}/cash-details") public Object cardDetails(@PathVariable long id,@RequestBody AccountingService.CardCashInput input,Authentication auth){return service.saveCardCashDetails(id,input,service.user(auth.getName()));}
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
    public record BankMemo(String memo,String previousMemo) {}
    @PutMapping("/bank-transactions/{id}/memo")
    public Object bankMemo(@PathVariable long id,@RequestBody BankMemo input,Authentication auth){
        return service.saveBankMemo(id,input.memo(),input.previousMemo(),service.user(auth.getName()));
    }
    @GetMapping("/bank-transactions") public Object bankTransactions(@RequestParam LocalDate from,@RequestParam LocalDate to,@RequestParam(required=false) Long source,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="") String description,@RequestParam(required=false) List<Long> accounts,@RequestParam(defaultValue="") String direction,@RequestParam(defaultValue="false") boolean ascending){return service.transactions(false,from,to,source,page,description,accounts,direction,ascending);}
    @GetMapping("/card-transactions") public Object cardTransactions(@RequestParam LocalDate from,@RequestParam LocalDate to,@RequestParam(required=false) Long source,@RequestParam(defaultValue="1") int page){return service.transactions(true,from,to,source,page);}
    @PostMapping("/card-import/preview") public Object preview(@RequestParam("file") List<MultipartFile> files,@RequestParam String issuer) throws java.io.IOException {
        return service.cardPreview(parseCardFiles(files,issuer));
    }
    private CardExcelParser.Parsed parseCardFiles(List<MultipartFile> files,String issuer) throws java.io.IOException {
        if(files.isEmpty() || files.size()>10 || files.stream().anyMatch(f->f.getSize()>5*1024*1024))
            throw new IllegalArgumentException("최대 10개, 파일당 5MB까지 선택해주세요.");
        if("BC".equals(issuer) && files.stream().allMatch(f->Objects.toString(f.getOriginalFilename(),"").toLowerCase(Locale.ROOT).endsWith(".pdf"))) {
            String company=service.statementCompany();
            var parts=new ArrayList<BcStatement.Part>();
            for(var file:files) parts.add(BcStatement.read(file.getBytes(),company));
            return BcStatement.combine(parts);
        }
        if(files.size()!=1) throw new IllegalArgumentException("BC 명세서 PDF만 여러 개 선택할 수 있습니다.");
        return parseCardFile(files.get(0),issuer);
    }
    private CardExcelParser.Parsed parseCardFile(MultipartFile file,String issuer) throws java.io.IOException {
        var name=Objects.toString(file.getOriginalFilename(),"");
        if(name.toLowerCase(Locale.ROOT).matches(".*\\.html?")) {
            if(!"HANA".equals(issuer)) throw new IllegalArgumentException("보안 HTML은 하나카드를 선택해주세요.");
            return service.readHanaStatement(file.getBytes());
        }
        return parser.parse(file.getBytes(),name,issuer);
    }
    @org.springframework.transaction.annotation.Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    @PostMapping("/card-import/commit") public Object commit(@RequestParam("file") List<MultipartFile> files,@RequestParam String issuer,@RequestParam String fileHash,Authentication auth) throws java.io.IOException {
        var parsed=parseCardFiles(files,issuer);
        if(!parsed.fileHash().equals(fileHash))throw new IllegalArgumentException("검증한 파일과 다릅니다. 다시 검증해주세요.");
        String name=Objects.requireNonNullElse(files.get(0).getOriginalFilename(),"card.xlsx").replace('\\','/');name=name.substring(name.lastIndexOf('/')+1);
        if(name.length()>255)throw new IllegalArgumentException("파일명이 너무 깁니다.");
        long user=service.user(auth.getName());
        service.validateBcBatch(parsed,true);
        var result=service.importCards(parsed,name,user);
        if(parsed.bill()!=null) {
            long account=service.statementAccount(parsed);
            cash.applyStatement(parsed.bill(),account,user,parsed.issuer());
            service.confirmStatementRows(parsed,account);
        }
        return result;
    }
    @ExceptionHandler(BarobillClient.UpstreamException.class)
    @ResponseStatus(HttpStatus.BAD_GATEWAY)
    public Map<String,String> upstream(BarobillClient.UpstreamException ex){return Map.of("message",ex.getMessage());}
}
