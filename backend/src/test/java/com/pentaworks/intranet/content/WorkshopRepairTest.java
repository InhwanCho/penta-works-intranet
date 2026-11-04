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
class WorkshopRepairTest {
    static JdbcTemplate database() {
        var jdbc=new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1","sa",""));
        jdbc.execute("CREATE TABLE users(id BIGINT,name VARCHAR(100),login_id VARCHAR(30),role VARCHAR(30))");
        jdbc.execute("INSERT INTO users VALUES(1,'관리자','admin','ADMIN'),(2,'작성자','writer','USER'),(3,'타인','other','USER')");
        jdbc.execute("CREATE TABLE workshop_repairs(id BIGINT AUTO_INCREMENT PRIMARY KEY,equipment_name VARCHAR(200),description_markdown CLOB,work_date DATE,quantity INT,status VARCHAR(30),author_id BIGINT,source_repair_id BIGINT UNIQUE,source_system VARCHAR(30),source_id VARCHAR(128),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,deleted_at TIMESTAMP,UNIQUE(source_system,source_id))");
        jdbc.execute("CREATE TABLE workshop_repair_units(repair_id BIGINT,unit_no INT,serial_number VARCHAR(100),status VARCHAR(30),fault_axis VARCHAR(10),test_result CLOB,PRIMARY KEY(repair_id,unit_no))");
        jdbc.execute("CREATE TABLE workshop_repair_photos(id BIGINT,repair_id BIGINT,original_name VARCHAR(200),image_data BLOB,mime_type VARCHAR(100),width_px INT,height_px INT,source_system VARCHAR(30),source_id VARCHAR(128))");
        jdbc.execute("CREATE TABLE workshop_repair_files(repair_id BIGINT,file_id BIGINT)");
        jdbc.execute("CREATE TABLE files(id BIGINT,original_name VARCHAR(100),uploaded_by BIGINT,deleted_at TIMESTAMP,upload_status VARCHAR(30),expires_at TIMESTAMP)");
        return jdbc;
    }
    private UsernamePasswordAuthenticationToken auth(String name) {return new UsernamePasswordAuthenticationToken(name,"");}
    @Test
    void tracksSeparateFailedYAxisAndZAxisUnitsAndEnforcesOwner() {
        var jdbc=database();var controller=new WorkshopRepairController(jdbc);
        var draft=new WorkshopRepairController.Draft("Gradient Power Supply","두 대 테스트 실패",LocalDate.of(2026,9,29),"TEST_FAILED",List.of(new WorkshopRepairController.Unit(null,"TEST_FAILED","Y","Over Voltage Y축 (OVY)"),new WorkshopRepairController.Unit(null,"TEST_FAILED","Z","Over Voltage Z축 (OVZ)")),List.of());
        long id=((Number)controller.create(draft,auth("writer")).get("id")).longValue();
        var units=jdbc.queryForList("SELECT status,fault_axis FROM workshop_repair_units WHERE repair_id=? ORDER BY unit_no",id);
        assertEquals(2,units.size());assertEquals("Y",units.get(0).get("fault_axis"));assertEquals("Z",units.get(1).get("fault_axis"));
        assertEquals(2,((Number)controller.detail(id).get("quantity")).intValue());
        jdbc.update("INSERT INTO workshop_repair_photos(id,repair_id,original_name,image_data,mime_type) VALUES(?,?,?,?,?)",1,id,"시험 사진",new byte[]{1,2,3},"image/jpeg");
        assertArrayEquals(new byte[]{1,2,3},controller.photo(1).getBody());
        assertEquals(1,((List<?>)controller.detail(id).get("workshop_photos")).size());
        assertThrows(AccessDeniedException.class,()->controller.update(id,draft,auth("other")));
        assertThrows(IllegalArgumentException.class,()->controller.update(id,new WorkshopRepairController.Draft("Gradient Power Supply","오류",draft.workDate(),"COMPLETED",draft.units(),List.of()),auth("writer")));
        controller.delete(id,auth("writer"));assertTrue(controller.list().isEmpty());
    }
}
