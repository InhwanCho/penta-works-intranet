package com.pentaworks.intranet.content;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.junit.jupiter.api.Assertions.*;

class ComponentHistoryTest {
    @Test
    void historyIsScopedToComponentAndHospitalAndExcludesDeletedRecords() {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:componentHistory;MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE service_hospitals(id BIGINT,deleted_at TIMESTAMP)");
        jdbc.execute("CREATE TABLE service_equipment(id BIGINT,hospital_id BIGINT)");
        jdbc.execute("CREATE TABLE service_equipment_components(id BIGINT,equipment_id BIGINT)");
        jdbc.execute("CREATE TABLE service_repair_components(repair_id BIGINT,component_id BIGINT,action_type VARCHAR(20),quantity INT,note VARCHAR(100))");
        jdbc.execute("CREATE TABLE workshop_repairs(source_repair_id BIGINT)");
        jdbc.execute("CREATE TABLE repair_requests(id BIGINT,hospital_id BIGINT,equipment_name VARCHAR(100),service_title VARCHAR(100),service_type VARCHAR(20),work_date DATE,written_at DATE,status VARCHAR(20),deleted_at TIMESTAMP,source_deleted_at TIMESTAMP)");
        jdbc.execute("INSERT INTO service_hospitals VALUES(1,NULL),(2,NULL)");
        jdbc.execute("INSERT INTO service_equipment VALUES(10,1),(20,2)");
        jdbc.execute("INSERT INTO service_equipment_components VALUES(100,10),(101,10),(200,20)");
        jdbc.execute("INSERT INTO repair_requests VALUES(1,1,'MRI','점검','PM','2026-10-01','2026-10-01','COMPLETED',NULL,NULL),(2,1,'MRI','교체','REPAIR','2026-10-02','2026-10-02','COMPLETED',NULL,NULL),(3,1,'MRI','삭제','REPAIR',NULL,'2026-10-03','COMPLETED',CURRENT_TIMESTAMP,NULL),(4,1,'MRI','원본 삭제','REPAIR',NULL,'2026-10-04','COMPLETED',NULL,CURRENT_TIMESTAMP),(5,2,'MRI','다른 병원','PM',NULL,'2026-10-05','COMPLETED',NULL,NULL)");
        jdbc.execute("INSERT INTO service_repair_components VALUES(1,100,'CHECKED',1,NULL),(2,100,'REPLACED',2,'교체 메모'),(3,100,'CHECKED',1,NULL),(4,100,'CHECKED',1,NULL),(5,100,'CHECKED',1,NULL),(1,101,'CHECKED',1,NULL),(5,200,'CHECKED',1,NULL)");
        var controller = new ServiceWorkflowController(jdbc);
        var history = controller.componentHistory(1,100);
        assertEquals(2,history.size());
        assertEquals(2L,((Number)history.get(0).get("id")).longValue());
        assertEquals("REPLACED",history.get(0).get("action_type"));
        assertEquals("교체 메모",history.get(0).get("note"));
        assertEquals(1,controller.componentHistory(1,101).size());
        assertTrue(controller.componentHistory(2,100).isEmpty());
        assertTrue(controller.componentHistory(1,200).isEmpty());
    }
}
