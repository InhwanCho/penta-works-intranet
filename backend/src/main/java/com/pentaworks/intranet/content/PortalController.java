package com.pentaworks.intranet.content;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class PortalController {
    private final JdbcTemplate jdbc;

    public PortalController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard(Authentication auth) {
        long userId = userId(auth);
        return Map.of(
            "notices", count("notices", "deleted_at IS NULL"),
            "meetings", count("meetings", "deleted_at IS NULL"),
            "openRepairs", count("repair_requests", "deleted_at IS NULL AND status <> 'COMPLETED'"),
            "manuals", count("manuals", "deleted_at IS NULL AND active = TRUE"),
            "unreadNotifications", jdbc.queryForObject(
                "SELECT COUNT(*) FROM notifications WHERE recipient_id = ? AND read_at IS NULL", Long.class, userId));
    }

    @GetMapping("/search")
    public List<Map<String, Object>> search(@RequestParam String q) {
        String term = "%" + q.trim() + "%";
        if (q.isBlank()) return List.of();
        return jdbc.queryForList("""
            SELECT * FROM (
              SELECT 'NOTICE' target_type, id target_id, title, LEFT(content_markdown, 240) summary, created_at
                FROM notices WHERE deleted_at IS NULL AND (title LIKE ? OR content_markdown LIKE ?)
              UNION ALL
              SELECT 'MEETING', id, title, LEFT(content_markdown, 240), created_at
                FROM meetings WHERE deleted_at IS NULL AND (title LIKE ? OR content_markdown LIKE ? OR decisions_markdown LIKE ?)
              UNION ALL
              SELECT 'REPAIR', id, title, LEFT(description_markdown, 240), created_at
                FROM repair_requests WHERE deleted_at IS NULL AND (title LIKE ? OR description_markdown LIKE ?)
              UNION ALL
              SELECT 'MANUAL', id, title, LEFT(description_markdown, 240), created_at
                FROM manuals WHERE deleted_at IS NULL AND active = TRUE AND (title LIKE ? OR description_markdown LIKE ?)
            ) search_result ORDER BY created_at DESC LIMIT 50
            """, term, term, term, term, term, term, term, term, term);
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

    @GetMapping("/meetings")
    public List<Map<String, Object>> meetings() {
        return jdbc.queryForList("""
            SELECT m.*, u.name author_name,
              GROUP_CONCAT(pu.name ORDER BY pu.name SEPARATOR ', ') participant_names
            FROM meetings m JOIN users u ON u.id=m.author_id
            LEFT JOIN meeting_participants mp ON mp.meeting_id=m.id
            LEFT JOIN users pu ON pu.id=mp.user_id
            WHERE m.deleted_at IS NULL GROUP BY m.id ORDER BY m.meeting_at DESC
            """);
    }

    @GetMapping("/meetings/{id}")
    public Map<String, Object> meeting(@PathVariable long id) {
        return one("""
            SELECT m.*, u.name author_name,
              GROUP_CONCAT(pu.name ORDER BY pu.name SEPARATOR ', ') participant_names
            FROM meetings m JOIN users u ON u.id=m.author_id
            LEFT JOIN meeting_participants mp ON mp.meeting_id=m.id
            LEFT JOIN users pu ON pu.id=mp.user_id
            WHERE m.id=? AND m.deleted_at IS NULL GROUP BY m.id
            """, id);
    }

    @PostMapping("/meetings")
    @Transactional
    public Map<String, Object> createMeeting(@Valid @RequestBody MeetingRequest body, Authentication auth) {
        long userId = userId(auth);
        long id = insert("INSERT INTO meetings(title,meeting_at,location,content_markdown,decisions_markdown,author_id) VALUES(?,?,?,?,?,?)",
            body.title(), Timestamp.valueOf(body.meetingAt()), body.location(), body.contentMarkdown(), body.decisionsMarkdown(), userId);
        if (body.participantIds() != null) body.participantIds().stream().distinct().forEach(participantId ->
            jdbc.update("INSERT INTO meeting_participants(meeting_id,user_id) VALUES(?,?)", id, participantId));
        attach(body.fileIds(), "MEETING", id);
        audit(userId, "CREATE", "MEETING", id);
        return Map.of("id", id);
    }

    @GetMapping("/repairs")
    public List<Map<String, Object>> repairs() {
        return jdbc.queryForList("""
            SELECT r.*, requester.name requester_name, assignee.name assignee_name
            FROM repair_requests r JOIN users requester ON requester.id=r.requester_id
            LEFT JOIN users assignee ON assignee.id=r.assignee_id
            WHERE r.deleted_at IS NULL ORDER BY FIELD(r.status,'RECEIVED','IN_PROGRESS','COMPLETED'), r.created_at DESC
            """);
    }

    @GetMapping("/repairs/{id}")
    public Map<String, Object> repair(@PathVariable long id) {
        return one("""
            SELECT r.*, requester.name requester_name, assignee.name assignee_name
            FROM repair_requests r JOIN users requester ON requester.id=r.requester_id
            LEFT JOIN users assignee ON assignee.id=r.assignee_id
            WHERE r.id=? AND r.deleted_at IS NULL
            """, id);
    }

    @PostMapping("/repairs")
    @Transactional
    public Map<String, Object> createRepair(@Valid @RequestBody RepairRequest body, Authentication auth) {
        long userId = userId(auth);
        long id = insert("INSERT INTO repair_requests(title,description_markdown,location,requester_id,assignee_id) VALUES(?,?,?,?,?)",
            body.title(), body.descriptionMarkdown(), body.location(), userId, body.assigneeId());
        jdbc.update("INSERT INTO repair_status_history(repair_id,new_status,changed_by) VALUES(?,'RECEIVED',?)", id, userId);
        attach(body.fileIds(), "REPAIR", id);
        audit(userId, "CREATE", "REPAIR", id);
        notifyAdmins(userId, "REPAIR", "새 수리 요청", body.title(), "REPAIR", id);
        return Map.of("id", id);
    }

    @PatchMapping("/repairs/status")
    @Transactional
    public void updateRepairStatus(@Valid @RequestBody RepairStatusRequest body, Authentication auth) {
        long userId = userId(auth);
        String previous = jdbc.queryForObject("SELECT status FROM repair_requests WHERE id=? AND deleted_at IS NULL", String.class, body.id());
        if (previous == null) throw new IllegalArgumentException("수리 요청을 찾을 수 없습니다.");
        LocalDateTime completedAt = "COMPLETED".equals(body.status()) ? LocalDateTime.now() : null;
        jdbc.update("UPDATE repair_requests SET status=?, completed_at=? WHERE id=?", body.status(), completedAt, body.id());
        jdbc.update("INSERT INTO repair_status_history(repair_id,previous_status,new_status,changed_by,memo) VALUES(?,?,?,?,?)",
            body.id(), previous, body.status(), userId, body.memo());
        audit(userId, "UPDATE", "REPAIR", body.id());
    }

    @GetMapping("/manuals")
    public List<Map<String, Object>> manuals() {
        return jdbc.queryForList("""
            SELECT m.*, c.name category_name, mv.version_no, mv.file_id, f.original_name, f.file_size
            FROM manuals m LEFT JOIN manual_categories c ON c.id=m.category_id
            JOIN manual_versions mv ON mv.manual_id=m.id
            JOIN files f ON f.id=mv.file_id
            WHERE m.deleted_at IS NULL AND m.active=TRUE
              AND mv.version_no=(SELECT MAX(v.version_no) FROM manual_versions v WHERE v.manual_id=m.id)
            ORDER BY c.sort_order, m.title
            """);
    }

    @GetMapping("/manuals/{id}")
    public Map<String, Object> manual(@PathVariable long id) {
        return one("""
            SELECT m.*, c.name category_name, u.name author_name, mv.version_no, mv.file_id,
              mv.change_note, f.original_name, f.file_size
            FROM manuals m LEFT JOIN manual_categories c ON c.id=m.category_id
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
        long id = insert("INSERT INTO manuals(category_id,title,description_markdown,author_id) VALUES(?,?,?,?)",
            body.categoryId(), body.title(), body.descriptionMarkdown(), userId);
        jdbc.update("INSERT INTO manual_versions(manual_id,version_no,file_id,change_note,uploaded_by) VALUES(?,1,?,?,?)",
            id, body.fileId(), body.changeNote(), userId);
        jdbc.update("UPDATE files SET upload_status='ATTACHED', expires_at=NULL WHERE id=?", body.fileId());
        audit(userId, "CREATE", "MANUAL", id);
        notifyAllExcept(userId, "MANUAL", "새 업무 매뉴얼", body.title(), "MANUAL", id);
        return Map.of("id", id);
    }

    @GetMapping("/schedules")
    public List<Map<String, Object>> schedules(@RequestParam String from, @RequestParam String to, Authentication auth) {
        long userId = userId(auth);
        return jdbc.queryForList("""
            SELECT s.*, u.name user_name FROM schedules s LEFT JOIN users u ON u.id=s.user_id
            WHERE s.deleted_at IS NULL AND s.start_at < ? AND s.end_at >= ?
              AND (s.visibility='PUBLIC' OR s.user_id=? OR s.created_by=?)
            ORDER BY s.start_at
            """, Timestamp.valueOf(to + " 23:59:59"), Timestamp.valueOf(from + " 00:00:00"), userId, userId);
    }

    @PostMapping("/schedules")
    @Transactional
    public Map<String, Object> createSchedule(@Valid @RequestBody ScheduleRequest body, Authentication auth) {
        long userId = userId(auth);
        Long ownerId = "COMPANY".equals(body.type()) ? body.userId() : (body.userId() == null ? userId : body.userId());
        long id = insert("INSERT INTO schedules(user_id,type,title,description_markdown,start_at,end_at,all_day,visibility,created_by) VALUES(?,?,?,?,?,?,?,?,?)",
            ownerId, body.type(), body.title(), body.descriptionMarkdown(), Timestamp.valueOf(body.startAt()), Timestamp.valueOf(body.endAt()),
            body.allDay(), body.visibility(), userId);
        audit(userId, "CREATE", "SCHEDULE", id);
        return Map.of("id", id);
    }

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

    private long count(String table, String condition) {
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE " + condition, Long.class);
        return count == null ? 0 : count;
    }

    private Map<String, Object> one(String sql, Object... values) {
        List<Map<String, Object>> rows = jdbc.queryForList(sql, values);
        if (rows.isEmpty()) throw new IllegalArgumentException("내용을 찾을 수 없습니다.");
        return rows.get(0);
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

    private void notifyAdmins(long actorId, String type, String title, String message, String targetType, long targetId) {
        jdbc.update("""
            INSERT INTO notifications(recipient_id,type,title,message,target_type,target_id)
            SELECT id,?,?,?,?,? FROM users WHERE active=TRUE AND role='ADMIN' AND id<>?
            """, type, title, message, targetType, targetId, actorId);
    }

    private void notifyAllExcept(long actorId, String type, String title, String message, String targetType, long targetId) {
        jdbc.update("""
            INSERT INTO notifications(recipient_id,type,title,message,target_type,target_id)
            SELECT id,?,?,?,?,? FROM users WHERE active=TRUE AND id<>?
            """, type, title, message, targetType, targetId, actorId);
    }

    public record NoticeRequest(@NotBlank String title, @NotBlank String contentMarkdown, boolean pinned, List<Long> fileIds) {}
    public record MeetingRequest(@NotBlank String title, @NotNull LocalDateTime meetingAt, String location,
        @NotBlank String contentMarkdown, String decisionsMarkdown, List<Long> participantIds, List<Long> fileIds) {}
    public record RepairRequest(@NotBlank String title, @NotBlank String descriptionMarkdown, String location,
        Long assigneeId, List<Long> fileIds) {}
    public record RepairStatusRequest(@NotNull Long id, @NotBlank String status, String memo) {}
    public record ManualRequest(@NotBlank String title, String descriptionMarkdown, Long categoryId,
        @NotNull Long fileId, String changeNote) {}
    public record ScheduleRequest(Long userId, @NotBlank String type, @NotBlank String title, String descriptionMarkdown,
        @NotNull LocalDateTime startAt, @NotNull LocalDateTime endAt, boolean allDay, @NotBlank String visibility) {}
    public record IdRequest(@NotNull Long id) {}
}
