package com.pentaworks.intranet.integration;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.annotation.PreDestroy;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Uses a separate SELECT-only account; never participates in intranet write transactions. */
@Service
public class MreyesMeetings {
    private final HikariDataSource pool;
    private final JdbcTemplate db;
    static final String FROM = " FROM office_meeting_read m WHERE m.deleted_at IS NULL";
    static final String SELECT = "SELECT m.id,m.title,m.meeting_at,m.content_markdown,m.author_name,"
        + "m.updated_by_name,m.participant_names,m.created_at,m.updated_at" + FROM;

    @org.springframework.beans.factory.annotation.Autowired
    public MreyesMeetings(@Value("${app.integrations.mreyes.meetings-db-url:}") String url,
        @Value("${app.integrations.mreyes.meetings-db-username:}") String username,
        @Value("${app.integrations.mreyes.meetings-db-password:}") String password) {
        if (url.isBlank() || username.isBlank() || password.isBlank()) { pool=null; db=null; return; }
        var config = new HikariConfig();
        config.setJdbcUrl(url); config.setUsername(username); config.setPassword(password);
        config.setReadOnly(true); config.setMaximumPoolSize(2); config.setMinimumIdle(0);
        config.setConnectionTimeout(5000); config.setInitializationFailTimeout(-1);
        config.setPoolName("mreyes-meetings-readonly");
        pool = new HikariDataSource(config); db = new JdbcTemplate(pool);
        db.setQueryTimeout(10);
    }
    MreyesMeetings(JdbcTemplate db) { this.db=db; this.pool=null; }
    private JdbcTemplate db() {
        if(db==null) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"MREyes 회의록 연결이 설정되지 않았습니다.");
        return db;
    }
    public List<Map<String,Object>> list() { return normalize(db().queryForList(SELECT+" ORDER BY m.meeting_at DESC,m.id DESC")); }
    public Map<String,Object> get(long id) {
        var rows=db().queryForList(SELECT+" AND m.id=?",id);
        if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"회의록을 찾을 수 없습니다.");
        return normalize(rows).get(0);
    }
    public long count() { return db().queryForObject("SELECT COUNT(*)"+FROM,Long.class); }
    public List<Map<String,Object>> search(String term) {
        return normalize(db().queryForList("SELECT 'MEETING' target_type,m.id target_id,m.title,LEFT(m.content_markdown,240) summary,m.created_at"
            +FROM+" AND (m.title LIKE ? OR m.content_markdown LIKE ?) ORDER BY m.created_at DESC LIMIT 50",term,term));
    }
    // DATETIME is a Seoul wall-clock value, as in MREyes; avoid Jackson converting Timestamp to UTC.
    private static List<Map<String,Object>> normalize(List<Map<String,Object>> rows) {
        rows.forEach(row -> row.replaceAll((key,value) -> value instanceof java.sql.Timestamp timestamp
            ? timestamp.toLocalDateTime().toString() : value));
        return rows;
    }
    @PreDestroy public void close() { if(pool!=null)pool.close(); }
}
