package com.pentaworks.intranet.content;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import static org.junit.jupiter.api.Assertions.*;

class DashboardQueryTest {
    @Test
    void dashboardAndCalendarQueriesExecuteAndExcludeDeletedData() {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:dashboard;MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE users(id BIGINT, login_id VARCHAR(30))");
        jdbc.execute("INSERT INTO users VALUES(1,'qa')");
        for (String table : new String[]{"notices", "meetings"}) {
            jdbc.execute("CREATE TABLE " + table + "(deleted_at TIMESTAMP)");
            jdbc.execute("INSERT INTO " + table + " VALUES(NULL),(CURRENT_TIMESTAMP)");
        }
        jdbc.execute("CREATE TABLE manuals(deleted_at TIMESTAMP,active BOOLEAN)");
        jdbc.execute("INSERT INTO manuals VALUES(NULL,TRUE),(NULL,FALSE)");
        jdbc.execute("CREATE TABLE notifications(recipient_id BIGINT,read_at TIMESTAMP)");
        jdbc.execute("INSERT INTO notifications VALUES(1,NULL),(2,NULL),(1,CURRENT_TIMESTAMP)");
        jdbc.execute("CREATE TABLE service_hospitals(id BIGINT,name VARCHAR(100),pm_interval_months INT,pm_override DATE,acr_full_override DATE,acr_doc_override DATE,deleted_at TIMESTAMP)");
        jdbc.execute("INSERT INTO service_hospitals VALUES(1,'테스트',2,NULL,NULL,NULL,NULL)");
        jdbc.execute("CREATE TABLE repair_requests(id BIGINT,hospital_id BIGINT,hospital_name VARCHAR(100),service_type VARCHAR(20),acr_kind VARCHAR(20),status VARCHAR(20),counts_as_pm BOOLEAN,work_date DATE,written_at DATE,deleted_at TIMESTAMP,service_title VARCHAR(100),equipment_name VARCHAR(100))");
        jdbc.execute("INSERT INTO repair_requests VALUES(1,1,NULL,'REPAIR',NULL,'COMPLETED',TRUE,'2026-07-31','2026-07-31',NULL,'점검','MRI'),(2,1,NULL,'PM',NULL,'COMPLETED',FALSE,'2026-09-01','2026-09-01',CURRENT_TIMESTAMP,'삭제된 기록','MRI'),(3,NULL,NULL,'REPAIR',NULL,'REVISIT',FALSE,NULL,'2026-09-25',NULL,NULL,'부품 수리'),(4,1,NULL,'ACR','doc','COMPLETED',FALSE,'2025-10-15','2025-10-15',NULL,'ACR','MRI'),(5,1,NULL,'ACR','pretest','COMPLETED',FALSE,'2026-09-10','2026-09-10',NULL,'사전검사','MRI')");
        jdbc.execute("CREATE TABLE service_schedules(id BIGINT,hospital_id BIGINT,scheduled_date DATE,deleted_at TIMESTAMP,created_at TIMESTAMP)");
        var stats = new PortalController(jdbc).dashboard(new UsernamePasswordAuthenticationToken("qa", ""));
        assertEquals(1L, ((Number)stats.get("openRepairs")).longValue());
        assertEquals(1L, ((Number)stats.get("notices")).longValue());
        assertEquals(1L, ((Number)stats.get("manuals")).longValue());
        assertEquals(1L, ((Number)stats.get("unreadNotifications")).longValue());
        var calendar = new ServiceWorkflowController(jdbc).calendar(LocalDate.of(2026,9,1),LocalDate.of(2026,10,31));
        assertEquals(2,calendar.due().size());
        assertEquals(LocalDate.of(2026,9,30),calendar.due().get(0).date());
        assertEquals(LocalDate.of(2026,10,15),calendar.due().get(1).date());
        assertEquals(2,calendar.records().size());
    }
}
