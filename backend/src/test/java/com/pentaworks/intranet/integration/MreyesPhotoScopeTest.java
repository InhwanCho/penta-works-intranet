package com.pentaworks.intranet.integration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.junit.jupiter.api.Assertions.*;

class MreyesPhotoScopeTest {
    private MreyesReadController controller;
    private JdbcTemplate jdbc;

    @BeforeEach void setup() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:photo" + System.nanoTime() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE service_hospitals(id BIGINT, mreyes_site_id VARCHAR(32), deleted_at TIMESTAMP)");
        jdbc.execute("CREATE TABLE workshop_repairs(source_repair_id BIGINT)");
        jdbc.execute("CREATE TABLE repair_requests(id BIGINT, hospital_id BIGINT, deleted_at TIMESTAMP, source_deleted_at TIMESTAMP)");
        jdbc.execute("CREATE TABLE service_photos(id BIGINT, repair_id BIGINT, image_data BLOB, mime_type VARCHAR(50))");
        jdbc.update("INSERT INTO service_hospitals VALUES(1,'003',NULL),(2,'004',NULL)");
        jdbc.update("INSERT INTO repair_requests VALUES(10,1,NULL,NULL),(11,2,NULL,NULL)");
        jdbc.update("INSERT INTO service_photos VALUES(20,10,?,'image/jpeg')", new byte[]{1,2,3});
        controller = new MreyesReadController(jdbc);
    }

    @Test void correctSiteGetsPhotoAndNormalizesShortId() {
        assertArrayEquals(new byte[]{1,2,3}, controller.maintenancePhoto("3",10,20).getBody());
    }
    @Test void anotherSiteCannotReadPhoto() {
        assertThrows(IllegalArgumentException.class, () -> controller.maintenancePhoto("004",10,20));
    }
    @Test void anotherRecordCannotReadPhoto() {
        assertThrows(IllegalArgumentException.class, () -> controller.maintenancePhoto("003",11,20));
    }
    @Test void deletedRecordPhotoIsHidden() {
        jdbc.update("UPDATE repair_requests SET deleted_at=CURRENT_TIMESTAMP WHERE id=10");
        assertThrows(IllegalArgumentException.class, () -> controller.maintenancePhoto("003",10,20));
    }
}
