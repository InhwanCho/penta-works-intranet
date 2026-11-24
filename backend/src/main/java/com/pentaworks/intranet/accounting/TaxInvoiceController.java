package com.pentaworks.intranet.accounting;

import java.time.LocalDate;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/accounting/tax-invoices")
public class TaxInvoiceController {
    private final TaxInvoiceService service;
    private final AccountingService accounting;
    public TaxInvoiceController(TaxInvoiceService service,AccountingService accounting){this.service=service;this.accounting=accounting;}
    @GetMapping("/settings") public Object settings(){return service.settings();}
    public record IssuerRequest(TaxInvoiceDocument.Party issuer,int version){}
    @PutMapping("/settings") public Object settings(@RequestBody IssuerRequest req,Authentication auth){if(req.issuer()==null)throw new IllegalArgumentException("공급자 정보를 입력해주세요.");return service.saveIssuer(req.issuer(),req.version(),accounting.user(auth.getName()));}
    public record VersionRequest(int version){}
    @PostMapping("/settings/import") public Object importIssuer(@RequestBody VersionRequest req,Authentication auth){return service.importIssuer(req.version(),accounting.user(auth.getName()));}
    @GetMapping("/customers")
    public Object customers(@RequestParam(defaultValue="") String keyword,
                            @RequestParam(defaultValue="1") int page) {
        return service.customers(keyword,page);
    }
    public record CustomerRequest(TaxInvoiceDocument.Party party,Integer version){}
    @PostMapping("/customers") public Object saveCustomer(@RequestBody CustomerRequest req,Authentication auth){return service.saveCustomer(req.party(),req.version(),accounting.user(auth.getName()));}
    @GetMapping("/products") public Object products(@RequestParam(defaultValue="") String keyword){if(keyword.length()>100)throw new IllegalArgumentException("검색어는 100자 이내로 입력해주세요.");return service.products(keyword);}
    @GetMapping public Object list(@RequestParam LocalDate from,@RequestParam LocalDate to,@RequestParam(defaultValue="") String keyword,@RequestParam(defaultValue="") String status,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="") String condition){return service.list(from,to,keyword,status,page,condition);}
    @GetMapping("/{id}") public Object detail(@PathVariable long id){return service.detail(id);}
    public record SaveRequest(String requestKey,int version,TaxInvoiceDocument document,TaxInvoiceDocument.Party issuer){}
    @PostMapping public Object create(@RequestBody SaveRequest req,Authentication auth){return save(null,req,auth);}
    @PutMapping("/{id}") public Object update(@PathVariable long id,@RequestBody SaveRequest req,Authentication auth){return save(id,req,auth);}
    private Object save(Long id,SaveRequest req,Authentication auth){if(req.document()==null)throw new IllegalArgumentException("세금계산서 내용을 입력해주세요.");return service.save(id,req.requestKey(),req.version(),req.document(),req.issuer(),accounting.user(auth.getName()));}
    public record ScheduleRequest(int version, LocalDate date) {}
    @PutMapping("/{id}/schedule")
    public Object schedule(@PathVariable long id,@RequestBody ScheduleRequest req,Authentication auth) {
        return service.schedule(id,req.version(),req.date(),accounting.user(auth.getName()));
    }
    @PostMapping("/{id}/cancel-schedule")
    public Object cancelSchedule(@PathVariable long id,@RequestBody VersionRequest req,Authentication auth) {
        return service.cancelSchedule(id,req.version(),accounting.user(auth.getName()));
    }
    @DeleteMapping("/{id}/reservation") public void deleteReservation(@PathVariable long id,@RequestParam int version,Authentication auth){service.deleteReservation(id,version,accounting.user(auth.getName()));}
    @PostMapping("/{id}/cancel") public Object cancel(@PathVariable long id,@RequestBody VersionRequest req,Authentication auth){return service.cancelIssued(id,req.version(),accounting.user(auth.getName()));}
    @PostMapping("/{id}/corrections/preview") public Object preview(@PathVariable long id,@RequestBody InvoiceCorrection req){return service.previewCorrection(id,req);}
    @PostMapping("/{id}/corrections") public Object correct(@PathVariable long id,@RequestBody InvoiceCorrection req,Authentication auth){return service.correct(id,req,accounting.user(auth.getName()));}
    @PostMapping("/{id}/corrections/{group}/resume") public Object resume(@PathVariable long id,@PathVariable String group,Authentication auth){return service.finishGroup(id,group,accounting.user(auth.getName()));}
    @PostMapping("/{id}/issue") public Object issue(@PathVariable long id,@RequestBody VersionRequest req,Authentication auth){return service.issue(id,req.version(),accounting.user(auth.getName()));}
    @PostMapping("/{id}/sync") public Object sync(@PathVariable long id,Authentication auth){return service.sync(id,accounting.user(auth.getName()));}
}
