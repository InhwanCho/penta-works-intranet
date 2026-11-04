package com.pentaworks.intranet.content;

import com.pentaworks.intranet.integration.MreyesMeetings;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DashboardQueryTest {
    @Test void dashboardAndSearchWorkWithoutAnyRetiredTables() {
        var db = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:portal;MODE=MySQL;DB_CLOSE_DELAY=-1","sa",""));
        db.execute("CREATE TABLE users(id BIGINT,login_id VARCHAR(30))");
        db.execute("INSERT INTO users VALUES(1,'qa')");
        db.execute("CREATE TABLE notices(id BIGINT,title VARCHAR(100),content_markdown VARCHAR(100),created_at TIMESTAMP,deleted_at TIMESTAMP)");
        db.execute("INSERT INTO notices VALUES(1,'notice','text',CURRENT_TIMESTAMP,NULL),(2,'deleted','text',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
        db.execute("CREATE TABLE manuals(id BIGINT,title VARCHAR(100),created_at TIMESTAMP,deleted_at TIMESTAMP,active BOOLEAN)");
        db.execute("INSERT INTO manuals VALUES(1,'manual',CURRENT_TIMESTAMP,NULL,TRUE),(2,'inactive',CURRENT_TIMESTAMP,NULL,FALSE)");
        db.execute("CREATE TABLE notifications(recipient_id BIGINT,read_at TIMESTAMP)");
        db.execute("INSERT INTO notifications VALUES(1,NULL),(2,NULL),(1,CURRENT_TIMESTAMP)");
        var meetings=mock(MreyesMeetings.class);
        when(meetings.count()).thenReturn(6L);
        var portal=new PortalController(db,meetings);
        var stats=portal.dashboard(new UsernamePasswordAuthenticationToken("qa",""));
        assertEquals(6L,stats.get("meetings"));
        assertEquals(1L,((Number)stats.get("notices")).longValue());
        assertEquals(1L,((Number)stats.get("manuals")).longValue());
        assertEquals(1L,((Number)stats.get("unreadNotifications")).longValue());
        assertEquals(1,portal.search("text").size());
        verify(meetings).search("%text%");
    }
}
