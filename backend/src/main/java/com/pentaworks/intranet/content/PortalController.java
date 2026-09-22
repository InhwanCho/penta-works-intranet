package com.pentaworks.intranet.content;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
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
            "hospitals", count("service_hospitals", "deleted_at IS NULL"),
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
                FROM meetings WHERE deleted_at IS NULL AND (title LIKE ? OR content_markdown LIKE ?)
              UNION ALL
              SELECT 'REPAIR', id, equipment_name, LEFT(description_markdown, 240), created_at
                FROM repair_requests WHERE deleted_at IS NULL AND (equipment_name LIKE ? OR description_markdown LIKE ?)
              UNION ALL
              SELECT 'HOSPITAL', id, name, CONCAT_WS(' · ',region,address), created_at
                FROM service_hospitals WHERE deleted_at IS NULL AND (name LIKE ? OR region LIKE ? OR address LIKE ?)
              UNION ALL
              SELECT 'MANUAL', id, title, title, created_at
                FROM manuals WHERE deleted_at IS NULL AND active = TRUE AND title LIKE ?
            ) search_result ORDER BY created_at DESC LIMIT 50
            """, term, term, term, term, term, term, term, term, term, term);
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

    @GetMapping("/meetings")
    public List<Map<String, Object>> meetings() {
        return jdbc.queryForList("""
            SELECT m.*, u.name author_name, editor.name updated_by_name,
              GROUP_CONCAT(pu.name ORDER BY pu.name SEPARATOR ', ') participant_names,
              GROUP_CONCAT(mp.user_id ORDER BY mp.user_id SEPARATOR ',') participant_ids
            FROM meetings m JOIN users u ON u.id=m.author_id
            JOIN users editor ON editor.id=m.updated_by_id
            LEFT JOIN meeting_participants mp ON mp.meeting_id=m.id
            LEFT JOIN users pu ON pu.id=mp.user_id
            WHERE m.deleted_at IS NULL GROUP BY m.id ORDER BY m.meeting_at DESC
            """);
    }

    @GetMapping("/meetings/{id}")
    public Map<String, Object> meeting(@PathVariable long id) {
        return one("""
            SELECT m.*, u.name author_name, editor.name updated_by_name,
              GROUP_CONCAT(pu.name ORDER BY pu.name SEPARATOR ', ') participant_names,
              GROUP_CONCAT(mp.user_id ORDER BY mp.user_id SEPARATOR ',') participant_ids
            FROM meetings m JOIN users u ON u.id=m.author_id
            JOIN users editor ON editor.id=m.updated_by_id
            LEFT JOIN meeting_participants mp ON mp.meeting_id=m.id
            LEFT JOIN users pu ON pu.id=mp.user_id
            WHERE m.id=? AND m.deleted_at IS NULL GROUP BY m.id
            """, id);
    }

    @PostMapping("/meetings")
    @Transactional
    public Map<String, Object> createMeeting(@Valid @RequestBody MeetingRequest body, Authentication auth) {
        long userId = userId(auth);
        long id = insert("INSERT INTO meetings(title,meeting_at,content_markdown,author_id,updated_by_id) VALUES(?,?,?,?,?)",
            body.title(), Timestamp.valueOf(body.meetingAt()), body.contentMarkdown(), userId, userId);
        if (body.participantIds() != null) body.participantIds().stream().distinct().forEach(participantId ->
            jdbc.update("INSERT INTO meeting_participants(meeting_id,user_id) VALUES(?,?)", id, participantId));
        attach(body.fileIds(), "MEETING", id);
        audit(userId, "CREATE", "MEETING", id);
        return Map.of("id", id);
    }

    @PutMapping("/meetings/{id}")
    @Transactional
    public void updateMeeting(@PathVariable long id, @Valid @RequestBody MeetingRequest body, Authentication auth) {
        long editorId = userId(auth);
        int changed = jdbc.update("UPDATE meetings SET title=?,meeting_at=?,content_markdown=?,updated_by_id=? WHERE id=? AND deleted_at IS NULL",
            body.title(), Timestamp.valueOf(body.meetingAt()), body.contentMarkdown(), editorId, id);
        if (changed == 0) throw new IllegalArgumentException("회의록을 찾을 수 없습니다.");
        jdbc.update("DELETE FROM meeting_participants WHERE meeting_id=?", id);
        if (body.participantIds() != null) body.participantIds().stream().distinct().forEach(user -> jdbc.update("INSERT INTO meeting_participants(meeting_id,user_id) VALUES(?,?)", id, user));
        attach(body.fileIds(), "MEETING", id); audit(userId(auth), "UPDATE", "MEETING", id);
    }

    @DeleteMapping("/meetings/{id}")
    public void deleteMeeting(@PathVariable long id, Authentication auth) { softDelete(auth, "meetings", "author_id", "MEETING", id); }

    @GetMapping("/repairs")
    public List<Map<String, Object>> repairs() {
        return jdbc.queryForList("""
            SELECT r.*, COALESCE(h.name,r.hospital_name) hospital_name, requester.name requester_name, assignee.name assignee_name
            FROM repair_requests r JOIN users requester ON requester.id=r.requester_id
            LEFT JOIN service_hospitals h ON h.id=r.hospital_id
            LEFT JOIN users assignee ON assignee.id=r.assignee_id
            WHERE r.deleted_at IS NULL ORDER BY FIELD(r.status,'RECEIVED','IN_PROGRESS','COMPLETED'), r.created_at DESC
            """);
    }

    @GetMapping("/repairs/{id}")
    public Map<String, Object> repair(@PathVariable long id) {
        return one("""
            SELECT r.*, COALESCE(h.name,r.hospital_name) hospital_name, requester.name requester_name, assignee.name assignee_name
            FROM repair_requests r JOIN users requester ON requester.id=r.requester_id
            LEFT JOIN service_hospitals h ON h.id=r.hospital_id
            LEFT JOIN users assignee ON assignee.id=r.assignee_id
            WHERE r.id=? AND r.deleted_at IS NULL
            """, id);
    }

    @PostMapping("/repairs")
    @Transactional
    public Map<String, Object> createRepair(@Valid @RequestBody RepairRequest body, Authentication auth) {
        long userId = userId(auth);
        long id = insert("""
            INSERT INTO repair_requests(hospital_id,equipment_name,description_markdown,written_at,hospital_name,model_name,service_type,contract_type,
              work_date,work_start_time,work_end_time,travel_minutes,special_notes,
              parts_details,labor_fee,parts_fee,travel_fee,total_fee,remarks,customer_confirmation,requester_id,assignee_id)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, body.hospitalId(), body.equipmentName(), body.contentMarkdown(), body.writtenAt(), body.hospitalName(), body.modelName(), body.serviceType(), body.contractType(),
            body.workDate(), body.workStartTime(), body.workEndTime(), body.travelMinutes(), body.specialNotes(),
            body.partsDetails(), body.laborFee(), body.partsFee(), body.travelFee(), body.totalFee(), body.remarks(), body.customerConfirmation(), userId, body.assigneeId());
        jdbc.update("INSERT INTO repair_status_history(repair_id,new_status,changed_by) VALUES(?,'RECEIVED',?)", id, userId);
        attach(body.fileIds(), "REPAIR", id);
        audit(userId, "CREATE", "REPAIR", id);
        notifyAdmins(userId, "REPAIR", "새 수리 요청", body.equipmentName(), "REPAIR", id);
        return Map.of("id", id);
    }

    @PutMapping("/repairs/{id}")
    @Transactional
    public void updateRepair(@PathVariable long id, @Valid @RequestBody RepairRequest body, Authentication auth) {
        requireOwnerOrAdmin(auth, "repair_requests", "requester_id", id);
        jdbc.update("""
            UPDATE repair_requests SET hospital_id=?,equipment_name=?,description_markdown=?,written_at=?,hospital_name=?,model_name=?,service_type=?,contract_type=?,
              work_date=?,work_start_time=?,work_end_time=?,travel_minutes=?,special_notes=?,
              parts_details=?,labor_fee=?,parts_fee=?,travel_fee=?,total_fee=?,remarks=?,customer_confirmation=?,assignee_id=? WHERE id=?
            """, body.hospitalId(), body.equipmentName(), body.contentMarkdown(), body.writtenAt(), body.hospitalName(), body.modelName(), body.serviceType(), body.contractType(),
            body.workDate(), body.workStartTime(), body.workEndTime(), body.travelMinutes(), body.specialNotes(),
            body.partsDetails(), body.laborFee(), body.partsFee(), body.travelFee(), body.totalFee(), body.remarks(), body.customerConfirmation(), body.assigneeId(), id);
        attach(body.fileIds(), "REPAIR", id); audit(userId(auth), "UPDATE", "REPAIR", id);
    }

    @DeleteMapping("/repairs/{id}")
    public void deleteRepair(@PathVariable long id, Authentication auth) { softDelete(auth, "repair_requests", "requester_id", "REPAIR", id); }

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
    public record MeetingRequest(@NotBlank String title, @NotNull LocalDateTime meetingAt,
        @NotBlank String contentMarkdown, List<Long> participantIds, List<Long> fileIds) {}
    public record RepairRequest(Long hospitalId, @NotBlank String equipmentName, @NotBlank String contentMarkdown, @NotNull LocalDate writtenAt,
        String hospitalName, String modelName, String serviceType, String contractType,
        LocalDate workDate, LocalTime workStartTime, LocalTime workEndTime,
        Integer travelMinutes, String specialNotes, String partsDetails, BigDecimal laborFee, BigDecimal partsFee,
        BigDecimal travelFee, BigDecimal totalFee, String remarks, String customerConfirmation, Long assigneeId, List<Long> fileIds) {}
    public record RepairStatusRequest(@NotNull Long id, @NotBlank String status, String memo) {}
    public record ManualRequest(@NotBlank String title, @NotNull Long fileId) {}
    public record ManualUpdateRequest(@NotBlank String title, @NotNull Long fileId) {}
    public record ScheduleRequest(Long userId, @NotBlank String type, @NotBlank String title, String descriptionMarkdown,
        @NotNull LocalDateTime startAt, @NotNull LocalDateTime endAt, boolean allDay, @NotBlank String visibility) {}
    public record IdRequest(@NotNull Long id) {}
}
