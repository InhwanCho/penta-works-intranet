package com.pentaworks.intranet.integration;

import com.pentaworks.intranet.config.SecurityConfig;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import javax.sql.DataSource;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(MeetingReadController.class)
@Import(SecurityConfig.class)
class MeetingSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean MreyesMeetings meetings;
    @MockitoBean JdbcTemplate jdbc;
    @MockitoBean DataSource dataSource;
    @BeforeEach void account() {
        when(jdbc.queryForList("SELECT password_hash,role,active FROM users WHERE login_id=?","qa"))
            .thenReturn(List.of(Map.of("password_hash","hash","role","ADMIN","active",true)));
        when(meetings.list()).thenReturn(List.of());
    }
    @Test void requiresLoginAndAllowsAuthenticatedReads() throws Exception {
        mvc.perform(get("/api/v1/meetings")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/meetings").with(user("qa").roles("ADMIN")).sessionAttr("accountHash","hash")).andExpect(status().isOk());
    }
    @Test void evenAdministratorsCannotWriteOrUseRetiredEndpoints() throws Exception {
        mvc.perform(post("/api/v1/meetings").with(user("qa").roles("ADMIN")).sessionAttr("accountHash","hash").with(csrf())).andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/meetings/1").with(user("qa").roles("ADMIN")).sessionAttr("accountHash","hash").with(csrf())).andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/meetings/1").with(user("qa").roles("ADMIN")).sessionAttr("accountHash","hash").with(csrf())).andExpect(status().isForbidden());
        for(String path:new String[]{"schedules","hospitals","repairs","work-logs","workshop-repairs"})
            mvc.perform(get("/api/v1/"+path).with(user("qa").roles("ADMIN")).sessionAttr("accountHash","hash")).andExpect(status().isForbidden());
        verifyNoInteractions(meetings);
    }
}
