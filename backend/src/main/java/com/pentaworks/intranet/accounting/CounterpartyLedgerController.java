package com.pentaworks.intranet.accounting;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.Authentication;
@RestController
@RequestMapping("/api/v1/accounting/counterparty-ledger")
public class CounterpartyLedgerController {
 private final CounterpartyLedgerService service; private final AccountingService accounting;
 public CounterpartyLedgerController(CounterpartyLedgerService service,AccountingService accounting){this.service=service;this.accounting=accounting;}
 @GetMapping("/status") public Object status(){return java.util.Map.of("ready",service.ready());}
 @GetMapping public Object list(@RequestParam int year,@RequestParam int quarter){return service.list(year,quarter);}
 @PostMapping public Object create(@RequestBody CounterpartyLedgerService.Input p,Authentication a){return service.save(null,p,accounting.user(a.getName()));}
 @PutMapping("/{id}") public Object update(@PathVariable long id,@RequestBody CounterpartyLedgerService.Input p,Authentication a){return service.save(id,p,accounting.user(a.getName()));}
 public record Version(int version){}
 @PostMapping("/{id}/cancel") public void cancel(@PathVariable long id,@RequestBody Version p,Authentication a){service.cancel(id,p.version(),accounting.user(a.getName()));}
}
