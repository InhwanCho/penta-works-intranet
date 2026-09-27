package com.pentaworks.intranet.content;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;

/** Uses existing source keys. Call inside the same transaction as the insert. */
final class RequestDeduplication {
    static String key(JdbcTemplate jdbc, Authentication auth, String requestId) {
        if (requestId == null) return null;
        if (!requestId.matches("[a-zA-Z0-9:-]{1,90}")) throw new IllegalArgumentException("잘못된 저장 요청 ID입니다.");
        Long user = jdbc.queryForObject("SELECT id FROM users WHERE login_id=? FOR UPDATE", Long.class, auth.getName());
        return user + ":" + requestId;
    }
    static Long existing(JdbcTemplate jdbc, String table, String key) {
        if (key == null) return null;
        if (!List.of("repair_requests", "service_photos", "service_prep_items").contains(table)) throw new IllegalArgumentException();
        var rows = jdbc.queryForList("SELECT id FROM " + table + " WHERE source_system='office_request' AND source_id=?", Long.class, key);
        return rows.isEmpty() ? null : rows.get(0);
    }
}
