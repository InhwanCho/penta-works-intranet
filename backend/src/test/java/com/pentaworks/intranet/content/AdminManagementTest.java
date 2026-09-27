package com.pentaworks.intranet.content;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdminManagementTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final AdminController controller = new AdminController(jdbc,mock(PasswordEncoder.class));
    @Test void cannotDisableCurrentAdministrator() {
        when(jdbc.queryForMap("SELECT login_id,role,active FROM users WHERE id=?",1L)).thenReturn(Map.of("login_id","admin","role","ADMIN","active",true));
        assertThrows(IllegalArgumentException.class,() -> controller.updateUser(1L,new AdminController.UserUpdate("관리자",null,null,null,"ADMIN",false,null),new UsernamePasswordAuthenticationToken("admin","")));
    }
    @Test void cannotRemoveLastActiveAdministrator() {
        when(jdbc.queryForList("SELECT id FROM users WHERE role='ADMIN' ORDER BY id FOR UPDATE",Long.class)).thenReturn(List.of(1L));
        when(jdbc.queryForMap("SELECT login_id,role,active FROM users WHERE id=?",1L)).thenReturn(Map.of("login_id","other","role","ADMIN","active",true));
        when(jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE role='ADMIN' AND active=TRUE AND id<>?",Integer.class,1L)).thenReturn(0);
        assertThrows(IllegalArgumentException.class,() -> controller.updateUser(1L,new AdminController.UserUpdate("관리자",null,null,null,"USER",true,null),new UsernamePasswordAuthenticationToken("admin","")));
    }
}
