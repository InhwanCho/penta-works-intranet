package com.pentaworks.intranet.integration;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;

class MreyesMeetingsTest {
    @Test void readsOnlyTheScopedViewAndExcludesDeletedRows() {
        var db=new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:meetings;MODE=MySQL;DB_CLOSE_DELAY=-1","sa",""));
        db.execute("CREATE TABLE company(id BIGINT,code VARCHAR(30),status VARCHAR(20))");
        db.execute("INSERT INTO company VALUES(1,'PENTAWORKS','ACTIVE'),(2,'OTHER','ACTIVE'),(3,'PENTAWORKS','INACTIVE')");
        db.execute("CREATE TABLE workspace_meeting(id BIGINT,company_id BIGINT,title VARCHAR(100),meeting_at TIMESTAMP,content_markdown VARCHAR(200),author_name VARCHAR(100),updated_by_name VARCHAR(100),participant_names VARCHAR(100),created_at TIMESTAMP,updated_at TIMESTAMP,deleted_at TIMESTAMP)");
        db.execute("INSERT INTO workspace_meeting VALUES(1,1,'weekly','2026-11-02 10:00:00','report','author','editor','',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL),(2,2,'other','2026-11-02 10:00:00','report','','','',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL),(3,1,'deleted','2026-11-02 10:00:00','report','','','',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),(4,3,'inactive','2026-11-02 10:00:00','report','','','',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL)");
        db.execute("CREATE VIEW office_meeting_read AS SELECT m.* FROM workspace_meeting m JOIN company c ON c.id=m.company_id WHERE c.code='PENTAWORKS' AND c.status='ACTIVE' AND m.deleted_at IS NULL");
        var reader=new MreyesMeetings(db);
        assertEquals(1,reader.list().size());
        assertEquals(1,reader.count());
        assertEquals("weekly",reader.get(1).get("title"));
        assertEquals("2026-11-02T10:00",reader.get(1).get("meeting_at"));
        for(long id:new long[]{2,3,4,99})assertEquals(404,assertThrows(ResponseStatusException.class,()->reader.get(id)).getStatusCode().value());
        assertEquals(1,reader.search("%report%").size());
        assertTrue(reader.search("%' OR 1=1 --%").isEmpty());
    }
    @Test void missingConnectionFailsExplicitlyWithoutLocalFallback() {
        var reader=new MreyesMeetings("","","");
        assertEquals(503,assertThrows(ResponseStatusException.class,reader::list).getStatusCode().value());
    }
}
