package com.pentaworks.intranet.content;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.access.AccessDeniedException;
import static org.junit.jupiter.api.Assertions.*;

class WorkLogTest {
    static JdbcTemplate database() {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE users(id BIGINT,name VARCHAR(100),login_id VARCHAR(30),role VARCHAR(30))");
        jdbc.execute("INSERT INTO users VALUES(1,'관리자','admin','ADMIN'),(2,'작성자','writer','USER'),(3,'타인','other','USER')");
        jdbc.execute("CREATE TABLE repair_requests(id BIGINT PRIMARY KEY,equipment_name VARCHAR(200),service_title VARCHAR(200),description_markdown CLOB,work_date DATE,written_at DATE,requester_id BIGINT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,deleted_at TIMESTAMP,source_deleted_at TIMESTAMP,hospital_id BIGINT,hospital_name VARCHAR(200),source_system VARCHAR(30),source_id VARCHAR(128))");
        jdbc.execute("CREATE TABLE workshop_repairs(id BIGINT AUTO_INCREMENT PRIMARY KEY,equipment_name VARCHAR(200),description_markdown CLOB,work_date DATE,quantity INT,status VARCHAR(30),author_id BIGINT,source_repair_id BIGINT UNIQUE,source_system VARCHAR(30),source_id VARCHAR(128),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,deleted_at TIMESTAMP,UNIQUE(source_system,source_id))");
        jdbc.execute("CREATE TABLE workshop_repair_units(repair_id BIGINT,unit_no INT,serial_number VARCHAR(100),status VARCHAR(30),fault_axis VARCHAR(10),test_result CLOB,PRIMARY KEY(repair_id,unit_no))");
        jdbc.execute("CREATE TABLE workshop_repair_photos(id BIGINT,repair_id BIGINT,original_name VARCHAR(200),image_data BLOB,mime_type VARCHAR(100),width_px INT,height_px INT,source_system VARCHAR(30),source_id VARCHAR(128))");
        jdbc.execute("CREATE TABLE workshop_repair_files(repair_id BIGINT,file_id BIGINT)");
        jdbc.execute("CREATE TABLE service_repair_components(repair_id BIGINT)");
        jdbc.execute("CREATE TABLE service_schedules(repair_id BIGINT,deleted_at TIMESTAMP)");
        jdbc.execute("CREATE TABLE work_logs(id BIGINT AUTO_INCREMENT PRIMARY KEY,title VARCHAR(200),content_markdown CLOB,work_date DATE,category VARCHAR(30),author_id BIGINT,source_repair_id BIGINT UNIQUE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,deleted_at TIMESTAMP)");
        jdbc.execute("CREATE TABLE work_log_files(work_log_id BIGINT,file_id BIGINT)");
        jdbc.execute("CREATE TABLE files(id BIGINT,original_name VARCHAR(100),uploaded_by BIGINT,deleted_at TIMESTAMP,upload_status VARCHAR(30),expires_at TIMESTAMP)");
        jdbc.execute("CREATE TABLE file_links(file_id BIGINT,target_type VARCHAR(30),target_id BIGINT)");
        jdbc.execute("CREATE TABLE service_photos(id BIGINT,repair_id BIGINT,original_name VARCHAR(100),source_system VARCHAR(30),source_id VARCHAR(128))");
        jdbc.execute("INSERT INTO repair_requests(id,equipment_name,description_markdown,written_at,requester_id) VALUES(10,'환송회','사내 행사 내용','2026-10-01',2),(11,'부품 작업','수리 내용','2026-10-02',2),(12,'방문','방문 내용','2026-10-03',2)");
        return jdbc;
    }
    private UsernamePasswordAuthenticationToken auth(String name) { return new UsernamePasswordAuthenticationToken(name,""); }

    @Test
    void movePreservesOriginalAttachmentsAndAuthorAndIsIdempotent() {
        var jdbc=database(); var controller=new WorkLogController(jdbc);
        jdbc.execute("INSERT INTO service_photos(id,repair_id,original_name) VALUES(1,10,'행사 사진')");
        jdbc.execute("INSERT INTO files VALUES(2,'행사.pdf',2,NULL,'ATTACHED',NULL)");
        jdbc.execute("INSERT INTO file_links VALUES(2,'REPAIR',10)");
        assertThrows(AccessDeniedException.class,()->controller.move(10,new WorkLogController.Move("EVENT"),auth("writer")));
        var result=controller.move(10,new WorkLogController.Move("EVENT"),auth("admin"));
        long id=((Number)result.get("id")).longValue();
        assertEquals(id,((Number)controller.move(10,new WorkLogController.Move("EVENT"),auth("admin")).get("id")).longValue());
        assertEquals(1,controller.list().size());
        var detail=controller.detail(id);
        assertEquals("환송회",detail.get("title"));
        assertEquals(2L,((Number)detail.get("author_id")).longValue());
        assertEquals(1,((List<?>)detail.get("photos")).size());
        assertEquals(1,((List<?>)detail.get("files")).size());
        assertNotNull(jdbc.queryForObject("SELECT deleted_at FROM repair_requests WHERE id=10",java.sql.Timestamp.class));
        assertEquals(2,controller.candidates(auth("admin")).size());
        var portal = new PortalController(jdbc);
        assertEquals(id,((Number)portal.repair(10).get("moved_work_log_id")).longValue());
        assertThrows(AccessDeniedException.class,()->portal.restoreRepair(10,auth("admin")));
        assertThrows(AccessDeniedException.class,()->portal.purgeRepair(10,auth("admin")));
        controller.delete(id,auth("writer"));
        controller.move(10,new WorkLogController.Move("EVENT"),auth("admin"));
        assertTrue(controller.list().isEmpty()); // Repeating migration does not resurrect deleted journals.
    }
    @Test
    void connectedPartsAndSchedulesCannotBeMoved() {
        var jdbc=database();var controller=new WorkLogController(jdbc);
        jdbc.execute("INSERT INTO service_repair_components VALUES(11)");
        jdbc.execute("INSERT INTO service_schedules VALUES(12,NULL)");
        assertThrows(IllegalArgumentException.class,()->controller.move(11,new WorkLogController.Move("OTHER"),auth("admin")));
        assertThrows(IllegalArgumentException.class,()->controller.move(12,new WorkLogController.Move("OTHER"),auth("admin")));
        assertTrue(controller.list().isEmpty());
    }
    @Test
    void importClassificationOnlyMovesExactReviewedTitlesAndCanRepeat() throws Exception {
        var jdbc=database();
        jdbc.execute("INSERT INTO repair_requests(id,equipment_name,description_markdown,written_at,requester_id) VALUES(13,'복스알 정리','공구 정리','2026-10-01',2),(14,'환송회 준비 후 병원 방문','실제 방문','2026-10-02',2),(15,'환송회','연결된 작업','2026-10-03',2),(16,'환송회','삭제 기록','2026-10-04',2)");
        jdbc.execute("INSERT INTO service_repair_components VALUES(15)");
        jdbc.execute("UPDATE repair_requests SET source_deleted_at=CURRENT_TIMESTAMP WHERE id=16");
        String sql;
        try (var input=WorkLogTest.class.getResourceAsStream("/db/maintenance/classify-work-logs.sql")) {
            assertNotNull(input);
            sql=new String(input.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
        }
        for (int run=0;run<2;run++) for (String statement:sql.split(";")) if (!statement.isBlank()) jdbc.execute(statement);
        assertEquals(2,jdbc.queryForObject("SELECT COUNT(*) FROM work_logs",Integer.class));
        assertEquals("EVENT",jdbc.queryForObject("SELECT category FROM work_logs WHERE source_repair_id=10",String.class));
        assertEquals("TOOLS",jdbc.queryForObject("SELECT category FROM work_logs WHERE source_repair_id=13",String.class));
        assertEquals(2,jdbc.queryForObject("SELECT COUNT(*) FROM repair_requests WHERE deleted_at IS NOT NULL",Integer.class));
    }
    @Test
    void journalCrudChecksOwnershipAndAttachesUploadedFiles() {
        var jdbc=database();var controller=new WorkLogController(jdbc);
        jdbc.execute("INSERT INTO files VALUES(4,'정리.jpg',2,NULL,'TEMP',CURRENT_TIMESTAMP)");
        var draft=new WorkLogController.Draft("복스알 정리","정리 완료",LocalDate.of(2026,10,7),"TOOLS",List.of(4L));
        long id=((Number)controller.create(draft,auth("writer")).get("id")).longValue();
        assertEquals("ATTACHED",jdbc.queryForObject("SELECT upload_status FROM files WHERE id=4",String.class));
        assertThrows(AccessDeniedException.class,()->controller.update(id,draft,auth("other")));
        controller.update(id,new WorkLogController.Draft("정리 수정","수정 완료",LocalDate.of(2026,10,7),"OFFICE",List.of()),auth("writer"));
        assertEquals("정리 수정",controller.detail(id).get("title"));
        assertThrows(AccessDeniedException.class,()->controller.delete(id,auth("other")));
        controller.delete(id,auth("admin"));assertTrue(controller.list().isEmpty());
    }
}
