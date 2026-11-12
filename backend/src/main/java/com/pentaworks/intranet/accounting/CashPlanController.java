package com.pentaworks.intranet.accounting;

import java.math.BigDecimal;
import java.time.LocalDate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/accounting/cash")
public class CashPlanController {
    private final CashPlanService service;
    private final AccountingService accounting;
    public CashPlanController(CashPlanService service, AccountingService accounting) { this.service=service; this.accounting=accounting; }
    @GetMapping("/status") public Object status() { return java.util.Map.of("ready",service.ready()); }
    @GetMapping
    public Object workspace(@RequestParam LocalDate from,@RequestParam LocalDate to,
        @RequestParam(defaultValue="false") boolean plansOnly,@RequestParam(defaultValue="full") String view,
        @RequestParam(defaultValue="true") boolean includeEarlier) {
        return service.workspace(from,to,plansOnly,view,includeEarlier);
    }
    @GetMapping("/earlier-plans")
    public Object earlierPlans(@RequestParam LocalDate before,
        @RequestParam(defaultValue="false") boolean billsOnly,
        @RequestParam(required=false) LocalDate afterDate,
        @RequestParam(required=false) Long afterId) {
        return service.earlierPlans(before,billsOnly,afterDate,afterId);
    }
    @PostMapping("/plans") public Object create(@RequestBody CashPlanService.PlanInput input,Authentication auth) { return service.create(input,accounting.user(auth.getName())); }
    @PostMapping("/plans/batch")
    public Object createBatch(@RequestBody java.util.List<CashPlanService.PlanInput> plans,Authentication auth){
        return service.createBatch(plans,accounting.user(auth.getName()));
    }
    @PutMapping("/plans/{id}") public Object update(@PathVariable long id,@RequestBody CashPlanService.PlanInput input,Authentication auth) { return service.update(id,input,accounting.user(auth.getName())); }
    public record Version(int version) {}
    @PostMapping("/plans/{id}/cancel") public void cancel(@PathVariable long id,@RequestBody Version input,Authentication auth) { service.cancel(id,input.version(),accounting.user(auth.getName())); }
    @GetMapping("/plans/{id}/matches") public Object matches(@PathVariable long id,@RequestParam LocalDate from,@RequestParam LocalDate to) { return service.matches(id,from,to); }
    public record Allocation(long transactionId,BigDecimal amount,int version,String requestKey) {}
    @PostMapping("/plans/{id}/allocations") public void allocate(@PathVariable long id,@RequestBody Allocation input,Authentication auth) { service.allocate(id,input,accounting.user(auth.getName())); }
    public record AllocationItem(long transactionId,BigDecimal amount,String requestKey) {}
    public record AllocationBatch(int version,java.util.List<AllocationItem> items) {}
    @PostMapping("/plans/{id}/allocations/batch")
    public void allocateBatch(@PathVariable long id,@RequestBody AllocationBatch input,Authentication auth) {
        service.allocateBatch(id,input,accounting.user(auth.getName()));
    }
    @PostMapping("/plans/{id}/allocations/{allocationId}/void") public void unlink(@PathVariable long id,@PathVariable long allocationId,Authentication auth) { service.unlink(id,allocationId,accounting.user(auth.getName())); }
    public record Transfer(long withdrawalId,long depositId,BigDecimal fee) {}
    @PostMapping("/transfers") public void transfer(@RequestBody Transfer input,Authentication auth) { service.transfer(input,accounting.user(auth.getName())); }
    @PostMapping("/transfers/{id}/void") public void undoTransfer(@PathVariable long id,Authentication auth) { service.undoTransfer(id,accounting.user(auth.getName())); }
}
