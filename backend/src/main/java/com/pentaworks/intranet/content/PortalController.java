package com.pentaworks.intranet.content;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class PortalController {
    private final JdbcTemplate jdbc;
    private final com.pentaworks.intranet.integration.MreyesMeetings meetings;

    public PortalController(JdbcTemplate jdbc, com.pentaworks.intranet.integration.MreyesMeetings meetings) {
        this.jdbc = jdbc;
        this.meetings = meetings;
    }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard(Authentication auth) {
        long userId = userId(auth);
        var result = jdbc.queryForMap("""
            SELECT (SELECT COUNT(*) FROM notices WHERE deleted_at IS NULL) notices,
              (SELECT COUNT(*) FROM manuals WHERE deleted_at IS NULL AND active=TRUE) manuals,
              (SELECT COUNT(*) FROM notifications WHERE recipient_id=? AND read_at IS NULL) unreadNotifications
            """, userId);
        result.put("meetings", meetings.count());
        return result;
    }

    @GetMapping("/search")
    public List<Map<String, Object>> search(@RequestParam String q) {
        if (q.isBlank()) return List.of();
        String term = "%" + q.trim() + "%";
        var result = new java.util.ArrayList<>(jdbc.queryForList("""
            SELECT 'NOTICE' target_type, id target_id, title, LEFT(content_markdown,240) summary, created_at
              FROM notices WHERE deleted_at IS NULL AND (title LIKE ? OR content_markdown LIKE ?)
            UNION ALL
            SELECT 'MANUAL', id, title, title, created_at FROM manuals
              WHERE deleted_at IS NULL AND active=TRUE AND title LIKE ?
            """, term, term, term));
        result.addAll(meetings.search(term));
        result.sort(java.util.Comparator.comparing((Map<String,Object> row) -> String.valueOf(row.get("created_at"))).reversed());
        return result.stream().limit(50).toList();
    }

    @GetMapping("/notices")
    public List<Map<String, Object>> notices() {
        return jdbc.queryForList("""
            SELECT n.*, u.name author_name FROM notices n JOIN users u ON u.id=n.author_id
            WHERE n.deleted_at IS NULL ORDER BY n.pinned DESC, n.published_at DESC
            """);
    }

    @GetMapping("/notices/{id}")
    public Map<String, Object> notice(@PathVariable long id) {
        return one("""
            SELECT n.*, u.name author_name FROM notices n JOIN users u ON u.id=n.author_id
            WHERE n.id=? AND n.deleted_at IS NULL
            """, id);
    }

    @PostMapping("/notices")
    @Transactional
    public Map<String, Object> createNotice(@Valid @RequestBody NoticeRequest body, Authentication auth) {
        long userId = userId(auth);
        long id = insert("INSERT INTO notices(title,content_markdown,author_id,pinned) VALUES(?,?,?,?)",
            body.title(), body.contentMarkdown(), userId, body.pinned());
        attach(body.fileIds(), "NOTICE", id);
        audit(userId, "CREATE", "NOTICE", id);
        notifyAllExcept(userId, "NOTICE", "새 공지사항", body.title(), "NOTICE", id);
        return Map.of("id", id);
    }

    @PutMapping("/notices/{id}")
    @Transactional
    public void updateNotice(@PathVariable long id, @Valid @RequestBody NoticeRequest body, Authentication auth) {
        requireOwnerOrAdmin(auth, "notices", "author_id", id);
        jdbc.update("UPDATE notices SET title=?,content_markdown=?,pinned=? WHERE id=?", body.title(), body.contentMarkdown(), body.pinned(), id);
        attach(body.fileIds(), "NOTICE", id); audit(userId(auth), "UPDATE", "NOTICE", id);
    }

    @DeleteMapping("/notices/{id}")
    public void deleteNotice(@PathVariable long id, Authentication auth) { softDelete(auth, "notices", "author_id", "NOTICE", id); }

    @GetMapping("/manuals")
    public List<Map<String, Object>> manuals() {
        return jdbc.queryForList("""
            SELECT m.*, mv.version_no, mv.file_id, f.original_name, f.file_size
            FROM manuals m
            JOIN manual_versions mv ON mv.manual_id=m.id
            JOIN files f ON f.id=mv.file_id
            WHERE m.deleted_at IS NULL AND m.active=TRUE
              AND mv.version_no=(SELECT MAX(v.version_no) FROM manual_versions v WHERE v.manual_id=m.id)
            ORDER BY m.title
            """);
    }

    @GetMapping("/manuals/{id}")
    public Map<String, Object> manual(@PathVariable long id) {
        return one("""
            SELECT m.*, u.name author_name, mv.version_no, mv.file_id,
              mv.change_note, f.original_name, f.file_size
            FROM manuals m
            JOIN users u ON u.id=m.author_id
            JOIN manual_versions mv ON mv.manual_id=m.id
            JOIN files f ON f.id=mv.file_id
            WHERE m.id=? AND m.deleted_at IS NULL AND m.active=TRUE
              AND mv.version_no=(SELECT MAX(v.version_no) FROM manual_versions v WHERE v.manual_id=m.id)
            """, id);
    }

    @PostMapping("/manuals")
    @Transactional
    public Map<String, Object> createManual(@Valid @RequestBody ManualRequest body, Authentication auth) {
        long userId = userId(auth);
        String mime = jdbc.queryForObject("SELECT mime_type FROM files WHERE id=? AND deleted_at IS NULL", String.class, body.fileId());
        if (!"application/pdf".equals(mime)) throw new IllegalArgumentException("업무 매뉴얼은 PDF만 등록할 수 있습니다.");
        long id = insert("INSERT INTO manuals(title,author_id) VALUES(?,?)", body.title(), userId);
        jdbc.update("INSERT INTO manual_versions(manual_id,version_no,file_id,change_note,uploaded_by) VALUES(?,1,?,?,?)",
            id, body.fileId(), "파일 등록", userId);
        jdbc.update("UPDATE files SET upload_status='ATTACHED', expires_at=NULL WHERE id=?", body.fileId());
        audit(userId, "CREATE", "MANUAL", id);
        notifyAllExcept(userId, "MANUAL", "새 업무 매뉴얼", body.title(), "MANUAL", id);
        return Map.of("id", id);
    }

    @PutMapping("/manuals/{id}")
    @Transactional
    public void updateManual(@PathVariable long id, @Valid @RequestBody ManualUpdateRequest body, Authentication auth) {
        requireOwnerOrAdmin(auth, "manuals", "author_id", id);
        long userId = userId(auth);
        String mime = jdbc.queryForObject("SELECT mime_type FROM files WHERE id=? AND deleted_at IS NULL", String.class, body.fileId());
        if (!"application/pdf".equals(mime)) throw new IllegalArgumentException("업무 매뉴얼은 PDF만 등록할 수 있습니다.");
        jdbc.update("UPDATE manuals SET title=? WHERE id=?", body.title(), id);
        Long currentFileId = jdbc.queryForObject("SELECT file_id FROM manual_versions WHERE manual_id=? ORDER BY version_no DESC LIMIT 1", Long.class, id);
        if (!body.fileId().equals(currentFileId)) {
            jdbc.update("INSERT INTO manual_versions(manual_id,version_no,file_id,change_note,uploaded_by) SELECT ?,COALESCE(MAX(version_no),0)+1,?,'파일 교체',? FROM manual_versions WHERE manual_id=?",
                id, body.fileId(), userId, id);
            jdbc.update("UPDATE files SET upload_status='ATTACHED', expires_at=NULL WHERE id=?", body.fileId());
        }
        audit(userId, "UPDATE", "MANUAL", id);
    }

    @DeleteMapping("/manuals/{id}")
    public void deleteManual(@PathVariable long id, Authentication auth) { softDelete(auth, "manuals", "author_id", "MANUAL", id); }

    @GetMapping("/notifications")
    public List<Map<String, Object>> notifications(Authentication auth) {
        return jdbc.queryForList("SELECT * FROM notifications WHERE recipient_id=? ORDER BY created_at DESC LIMIT 50", userId(auth));
    }

    @PatchMapping("/notifications/read")
    public void readNotification(@RequestBody IdRequest body, Authentication auth) {
        jdbc.update("UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP(6)) WHERE id=? AND recipient_id=?", body.id(), userId(auth));
    }

    @GetMapping("/users")
    public List<Map<String, Object>> users() {
        return jdbc.queryForList("SELECT id,name,email,phone,position,role FROM users WHERE active=TRUE ORDER BY name");
    }

    private Map<String, Object> one(String sql, Object... values) {
        List<Map<String, Object>> rows = jdbc.queryForList(sql, values);
        if (rows.isEmpty()) throw new IllegalArgumentException("내용을 찾을 수 없습니다.");
        return rows.get(0);
    }

    private void requireOwnerOrAdmin(Authentication auth, String table, String ownerColumn, long id) {
        Integer allowed = jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " t JOIN users u ON u.login_id=? WHERE t.id=? AND t.deleted_at IS NULL AND (t." + ownerColumn + "=u.id OR u.role='ADMIN')", Integer.class, auth.getName(), id);
        if (allowed == null || allowed == 0) throw new org.springframework.security.access.AccessDeniedException("수정 또는 삭제 권한이 없습니다.");
    }

    @Transactional
    protected void softDelete(Authentication auth, String table, String ownerColumn, String targetType, long id) {
        requireOwnerOrAdmin(auth, table, ownerColumn, id);
        jdbc.update("UPDATE " + table + " SET deleted_at=CURRENT_TIMESTAMP(6) WHERE id=?", id);
        audit(userId(auth), "DELETE", targetType, id);
    }

    private long userId(Authentication auth) {
        Long id = jdbc.queryForObject("SELECT id FROM users WHERE login_id=?", Long.class, auth.getName());
        if (id == null) throw new IllegalArgumentException("사용자를 찾을 수 없습니다.");
        return id;
    }

    private long insert(String sql, Object... values) {
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            for (int i = 0; i < values.length; i++) statement.setObject(i + 1, values[i]);
            return statement;
        }, keys);
        if (keys.getKey() == null) throw new IllegalStateException("생성된 ID를 확인할 수 없습니다.");
        return keys.getKey().longValue();
    }

    private void attach(List<Long> fileIds, String targetType, long targetId) {
        if (fileIds == null) return;
        fileIds.stream().distinct().forEach(fileId -> {
            jdbc.update("INSERT INTO file_links(file_id,target_type,target_id,usage_type) VALUES(?,?,?,'INLINE_IMAGE')",
                fileId, targetType, targetId);
            jdbc.update("UPDATE files SET upload_status='ATTACHED', expires_at=NULL WHERE id=?", fileId);
        });
    }

    private void audit(long userId, String action, String targetType, long targetId) {
        jdbc.update("INSERT INTO audit_logs(user_id,action,target_type,target_id) VALUES(?,?,?,?)", userId, action, targetType, targetId);
    }

    private void notifyAllExcept(long actorId, String type, String title, String message, String targetType, long targetId) {
        jdbc.update("""
            INSERT INTO notifications(recipient_id,type,title,message,target_type,target_id)
            SELECT id,?,?,?,?,? FROM users WHERE active=TRUE AND id<>?
            """, type, title, message, targetType, targetId, actorId);
    }

    public record NoticeRequest(@NotBlank String title, @NotBlank String contentMarkdown, boolean pinned, List<Long> fileIds) {}
    public record ManualRequest(@NotBlank String title, @NotNull Long fileId) {}
    public record ManualUpdateRequest(@NotBlank String title, @NotNull Long fileId) {}
    public record IdRequest(@NotNull Long id) {}
}
