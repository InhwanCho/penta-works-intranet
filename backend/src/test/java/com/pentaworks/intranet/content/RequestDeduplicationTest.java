package com.pentaworks.intranet.content;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import static org.junit.jupiter.api.Assertions.*;

class RequestDeduplicationTest {
    @Test void databaseKeysAreScopedToAccountAndPreserveSourceImports() {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:retry" + System.nanoTime() + ";MODE=MySQL;DB_CLOSE_DELAY=-1","sa",""));
        jdbc.execute("CREATE TABLE users(id BIGINT,login_id VARCHAR(30))");
        jdbc.execute("CREATE TABLE repair_requests(id BIGINT,source_system VARCHAR(30),source_id VARCHAR(128),UNIQUE(source_system,source_id))");
        jdbc.update("INSERT INTO users VALUES(1,'one'),(2,'two')");
        var one = RequestDeduplication.key(jdbc,new UsernamePasswordAuthenticationToken("one",""),"retry-1");
        var two = RequestDeduplication.key(jdbc,new UsernamePasswordAuthenticationToken("two",""),"retry-1");
        assertNotEquals(one,two);
        jdbc.update("INSERT INTO repair_requests VALUES(10,'firebase',?),(11,'office_request',?)",one,one);
        assertEquals(11L,RequestDeduplication.existing(jdbc,"repair_requests",one));
        assertNull(RequestDeduplication.existing(jdbc,"repair_requests",two));
    }
}
