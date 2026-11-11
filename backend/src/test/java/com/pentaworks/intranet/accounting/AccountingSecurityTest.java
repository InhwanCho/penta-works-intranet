package com.pentaworks.intranet.accounting;

import com.pentaworks.intranet.config.SecurityConfig;
import java.util.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest({AccountingController.class,TaxInvoiceController.class,CashPlanController.class,CounterpartyLedgerController.class})
@Import(SecurityConfig.class)
class AccountingSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean AccountingService service;
    @MockitoBean CashPlanService cash;
    @MockitoBean CounterpartyLedgerService ledger;
    @MockitoBean TaxInvoiceService invoices;
    @MockitoBean CardExcelParser parser;
    @MockitoBean BarobillClient barobill;
    @MockitoBean AccountCrypto crypto;
    @MockitoBean JdbcTemplate jdbc;
    @MockitoBean DataSource dataSource;
    void role(String role){when(jdbc.queryForList("SELECT password_hash,role,active FROM users WHERE login_id=?","test")).thenReturn(List.of(Map.of("password_hash","hash","role",role,"active",true)));}
    @Test void cashPlanningRequiresAccountingRoleAndCsrf() throws Exception {
        mvc.perform(get("/api/v1/accounting/cash/status")).andExpect(status().isUnauthorized());
        role("USER");mvc.perform(get("/api/v1/accounting/cash/status").with(user("test").roles("USER")).sessionAttr("accountHash","hash")).andExpect(status().isForbidden());
        role("ACCOUNTING");when(cash.ready()).thenReturn(true);
        mvc.perform(get("/api/v1/accounting/cash/status").with(user("test").roles("ACCOUNTING")).sessionAttr("accountHash","hash")).andExpect(status().isOk());
        mvc.perform(post("/api/v1/accounting/cash/plans").contentType("application/json").content("{}").with(user("test").roles("ACCOUNTING")).sessionAttr("accountHash","hash")).andExpect(status().isForbidden());
        verify(cash,never()).create(any(),anyLong());
        mvc.perform(put("/api/v1/accounting/card-transactions/1/cash-details").contentType("application/json").content("{}").with(user("test").roles("ACCOUNTING")).sessionAttr("accountHash","hash")).andExpect(status().isForbidden());
        verify(service,never()).saveCardCashDetails(anyLong(),any(),anyLong());
        mvc.perform(post("/api/v1/accounting/counterparty-ledger").contentType("application/json").content("{}").with(user("test").roles("ACCOUNTING")).sessionAttr("accountHash","hash")).andExpect(status().isForbidden());
        verify(ledger,never()).save(any(),any(),anyLong());
    }
    @Test void ordinaryUsersAndAnonymousCannotReadFinancialData() throws Exception {
        mvc.perform(get("/api/v1/accounting/status")).andExpect(status().isUnauthorized());
        role("USER");mvc.perform(get("/api/v1/accounting/status").with(user("test").roles("USER")).sessionAttr("accountHash","hash")).andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }
    @Test void accountingRoleCanReadButMutationsStillRequireCsrf() throws Exception {
        role("ACCOUNTING");when(service.schemaReady()).thenReturn(true);when(barobill.environment()).thenReturn("test");
        mvc.perform(get("/api/v1/accounting/status").with(user("test").roles("ACCOUNTING")).sessionAttr("accountHash","hash")).andExpect(status().isOk()).andExpect(jsonPath("$.schemaReady").value(true));
        mvc.perform(post("/api/v1/accounting/bank-accounts/refresh").with(user("test").roles("ACCOUNTING")).sessionAttr("accountHash","hash")).andExpect(status().isForbidden());
    }
    @Test void invoiceDataUsesAccountingPermissionsAndCsrf() throws Exception {
        mvc.perform(get("/api/v1/accounting/tax-invoices/settings")).andExpect(status().isUnauthorized());
        role("USER");mvc.perform(get("/api/v1/accounting/tax-invoices/settings").with(user("test").roles("USER")).sessionAttr("accountHash","hash")).andExpect(status().isForbidden());
        role("ACCOUNTING");when(invoices.settings()).thenReturn(Map.of("environment","test"));
        mvc.perform(get("/api/v1/accounting/tax-invoices/settings").with(user("test").roles("ACCOUNTING")).sessionAttr("accountHash","hash")).andExpect(status().isOk());
        mvc.perform(post("/api/v1/accounting/tax-invoices/1/issue").contentType("application/json").content("{\"version\":0}").with(user("test").roles("ACCOUNTING")).sessionAttr("accountHash","hash")).andExpect(status().isForbidden());
        verify(invoices,never()).issue(anyLong(),anyInt(),anyLong());
    }
    @Test void retiredServiceApisRejectEvenAdministrators() throws Exception {
        role("ADMIN");
        for (String path : List.of("/hospitals", "/hospitals/1", "/repairs", "/repairs/1",
                "/work-logs", "/service-calendar", "/service-photos/1/content")) {
            mvc.perform(get("/api/v1" + path).with(user("test").roles("ADMIN"))
                .sessionAttr("accountHash", "hash")).andExpect(status().isForbidden());
            mvc.perform(post("/api/v1" + path).with(csrf()).with(user("test").roles("ADMIN"))
                .sessionAttr("accountHash", "hash")).andExpect(status().isForbidden());
        }
    }

}
