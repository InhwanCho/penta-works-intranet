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

@WebMvcTest({AccountingController.class,TaxInvoiceController.class})
@Import(SecurityConfig.class)
class AccountingSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean AccountingService service;
    @MockitoBean TaxInvoiceService invoices;
    @MockitoBean CardExcelParser parser;
    @MockitoBean BarobillClient barobill;
    @MockitoBean AccountCrypto crypto;
    @MockitoBean JdbcTemplate jdbc;
    @MockitoBean DataSource dataSource;
    void role(String role){when(jdbc.queryForList("SELECT password_hash,role,active FROM users WHERE login_id=?","test")).thenReturn(List.of(Map.of("password_hash","hash","role",role,"active",true)));}
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
}
