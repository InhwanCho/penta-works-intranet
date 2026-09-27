package com.pentaworks.intranet.auth;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AccountStateFilterTest {
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    private MockHttpServletResponse run(boolean active, String storedHash, String currentRole) throws Exception {
        var jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList("SELECT password_hash,role,active FROM users WHERE login_id=?","qa")).thenReturn(List.of(Map.of("password_hash","new-hash","role",currentRole,"active",active)));
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("qa",null,AuthorityUtils.createAuthorityList("ROLE_ADMIN")));
        var request = new MockHttpServletRequest(); request.getSession().setAttribute("accountHash",storedHash);
        var response = new MockHttpServletResponse();
        new AccountStateFilter(jdbc).doFilter(request,response,(req,res) -> res.getWriter().write("ok"));
        return response;
    }
    @Test void disabledAccountIsRejected() throws Exception { assertEquals(401,run(false,"new-hash","USER").getStatus()); }
    @Test void changedPasswordRejectsExistingSession() throws Exception { assertEquals(401,run(true,"old-hash","USER").getStatus()); }
    @Test void roleChangeTakesEffectInExistingSession() throws Exception {
        assertEquals("ok",run(true,"new-hash","USER").getContentAsString());
        assertEquals("ROLE_USER",SecurityContextHolder.getContext().getAuthentication().getAuthorities().iterator().next().getAuthority());
    }
}
