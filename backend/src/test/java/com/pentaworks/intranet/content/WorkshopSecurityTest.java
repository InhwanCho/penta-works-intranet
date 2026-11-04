package com.pentaworks.intranet.content;
import com.pentaworks.intranet.config.SecurityConfig;
import java.util.List;
import java.util.Map;
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
@WebMvcTest(WorkshopRepairController.class)
@Import(SecurityConfig.class)
class WorkshopSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean JdbcTemplate jdbc;
    @MockitoBean DataSource dataSource;
    @Test void workshopIsAvailableToMembersButRequiresAuthenticationAndCsrf() throws Exception {
        mvc.perform(get("/api/v1/workshop-repairs")).andExpect(status().isUnauthorized());
        when(jdbc.queryForList("SELECT password_hash,role,active FROM users WHERE login_id=?","qa"))
            .thenReturn(List.of(Map.of("password_hash","hash","role","USER","active",true)));
        mvc.perform(get("/api/v1/workshop-repairs").with(user("qa")).sessionAttr("accountHash","hash")).andExpect(status().isOk());
        mvc.perform(post("/api/v1/workshop-repairs").with(user("qa")).sessionAttr("accountHash","hash")).andExpect(status().isForbidden());
    }
}
