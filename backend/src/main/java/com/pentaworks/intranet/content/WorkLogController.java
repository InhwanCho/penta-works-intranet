package com.pentaworks.intranet.content;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/work-logs")
public class WorkLogController {
    private final JdbcTemplate jdbc;
    public WorkLogController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping
    public List<Map<String,Object>> list() {
        return jdbc.queryForList("SELECT w.*,u.name author_name FROM work_logs w JOIN users u ON u.id=w.author_id WHERE w.deleted_at IS NULL ORDER BY w.work_date DESC,w.id DESC");
    }
    @GetMapping("/{id}")
    public Map<String,Object> detail(@PathVariable long id) {
        var row = jdbc.queryForMap("SELECT w.*,u.name author_name FROM work_logs w JOIN users u ON u.id=w.author_id WHERE w.id=? AND w.deleted_at IS NULL", id);
        row.put("files", jdbc.queryForList("SELECT f.id,f.original_name FROM work_log_files l JOIN files f ON f.id=l.file_id WHERE l.work_log_id=? AND f.deleted_at IS NULL UNION SELECT f.id,f.original_name FROM file_links l JOIN files f ON f.id=l.file_id WHERE l.target_type='REPAIR' AND l.target_id=? AND f.deleted_at IS NULL", id,row.get("source_repair_id")));
        row.put("photos", jdbc.queryForList("SELECT id,original_name FROM service_photos WHERE repair_id=? ORDER BY id", row.get("source_repair_id")));
        return row;
    }
    @PostMapping
    @Transactional
    public Map<String,Object> create(@Valid @RequestBody Draft body, Authentication auth) {
        category(body.category());
        var keys = new GeneratedKeyHolder();
        long userId = userId(auth);
        jdbc.update(connection -> {
            var statement = connection.prepareStatement("INSERT INTO work_logs(title,content_markdown,work_date,category,author_id) VALUES(?,?,?,?,?)", new String[]{"id"});
            statement.setString(1,body.title()); statement.setString(2,body.contentMarkdown()); statement.setObject(3,body.workDate()); statement.setString(4,body.category()); statement.setLong(5,userId); return statement;
        },keys);
        long id = keys.getKey().longValue(); attach(id,body.fileIds(),userId); return Map.of("id",id);
    }
    @PutMapping("/{id}")
    @Transactional
    public void update(@PathVariable long id,@Valid @RequestBody Draft body,Authentication auth) {
        owner(id,auth); category(body.category());
        jdbc.update("UPDATE work_logs SET title=?,content_markdown=?,work_date=?,category=? WHERE id=?",body.title(),body.contentMarkdown(),body.workDate(),body.category(),id);
        attach(id,body.fileIds(),userId(auth));
    }
    @DeleteMapping("/{id}")
    public void delete(@PathVariable long id,Authentication auth) { owner(id,auth); jdbc.update("UPDATE work_logs SET deleted_at=CURRENT_TIMESTAMP(6) WHERE id=?",id); }

    @GetMapping("/migration-candidates")
    public List<Map<String,Object>> candidates(Authentication auth) {
        admin(auth);
        return jdbc.queryForList("SELECT r.id,r.equipment_name,r.service_title,r.hospital_id,r.hospital_name,r.written_at,r.description_markdown FROM repair_requests r WHERE r.deleted_at IS NULL AND r.source_deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM work_logs w WHERE w.source_repair_id=r.id) AND NOT EXISTS(SELECT 1 FROM workshop_repairs w WHERE w.source_repair_id=r.id) ORDER BY r.written_at DESC,r.id DESC");
    }
    @PostMapping("/from-repair/{id}")
    @Transactional
    public Map<String,Object> move(@PathVariable long id,@RequestBody Move body,Authentication auth) {
        admin(auth); category(body.category());
        var source = jdbc.queryForMap("SELECT * FROM repair_requests WHERE id=? FOR UPDATE",id);
        var existing = jdbc.queryForList("SELECT id FROM work_logs WHERE source_repair_id=?",id);
        if (!existing.isEmpty()) return existing.get(0);
        if (jdbc.queryForObject("SELECT COUNT(*) FROM workshop_repairs WHERE source_repair_id=?",Integer.class,id)>0) throw new IllegalArgumentException("이미 사무실 수리 기록으로 이동한 기록입니다.");
        if (source.get("deleted_at") != null || source.get("source_deleted_at") != null) throw new IllegalArgumentException("삭제된 기록은 이동할 수 없습니다.");
        if (jdbc.queryForObject("SELECT COUNT(*) FROM service_repair_components WHERE repair_id=?",Integer.class,id)>0 || jdbc.queryForObject("SELECT COUNT(*) FROM service_schedules WHERE repair_id=? AND deleted_at IS NULL",Integer.class,id)>0) throw new IllegalArgumentException("연결된 부품이나 서비스 일정이 있는 기록은 연결을 확인한 후 이동해주세요.");
        jdbc.update("INSERT INTO work_logs(title,content_markdown,work_date,category,author_id,source_repair_id,created_at,updated_at) SELECT COALESCE(NULLIF(service_title,''),equipment_name),description_markdown,COALESCE(work_date,written_at),?,requester_id,id,created_at,updated_at FROM repair_requests WHERE id=?",body.category(),id);
        jdbc.update("UPDATE repair_requests SET deleted_at=CURRENT_TIMESTAMP(6) WHERE id=?",id);
        return jdbc.queryForMap("SELECT id FROM work_logs WHERE source_repair_id=?",id);
    }
    private void attach(long id,List<Long> files,long userId) {
        for (long fileId : files == null ? List.<Long>of() : files) {
            if (jdbc.queryForObject("SELECT COUNT(*) FROM files WHERE id=? AND uploaded_by=? AND deleted_at IS NULL",Integer.class,fileId,userId)==0) throw new AccessDeniedException("본인이 업로드한 파일만 첨부할 수 있습니다.");
            jdbc.update("INSERT INTO work_log_files(work_log_id,file_id) SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM work_log_files WHERE work_log_id=? AND file_id=?)",id,fileId,id,fileId);
            jdbc.update("UPDATE files SET upload_status='ATTACHED',expires_at=NULL WHERE id=?",fileId);
        }
    }
    private long userId(Authentication auth) { return jdbc.queryForObject("SELECT id FROM users WHERE login_id=?",Long.class,auth.getName()); }
    private void admin(Authentication auth) { if (jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE login_id=? AND role='ADMIN'",Integer.class,auth.getName())==0) throw new AccessDeniedException("관리자만 이동할 수 있습니다."); }
    private void owner(long id,Authentication auth) { if (jdbc.queryForObject("SELECT COUNT(*) FROM work_logs w JOIN users u ON u.login_id=? WHERE w.id=? AND w.deleted_at IS NULL AND (w.author_id=u.id OR u.role='ADMIN')",Integer.class,auth.getName(),id)==0) throw new AccessDeniedException("작성자 또는 관리자만 수정할 수 있습니다."); }
    private void category(String value) { if (!Set.of("EVENT","TOOLS","OFFICE","OTHER").contains(value == null ? "" : value)) throw new IllegalArgumentException("업무일지 분류를 선택해주세요."); }
    public record Draft(@NotBlank String title,@NotBlank String contentMarkdown,@NotNull LocalDate workDate,String category,List<Long> fileIds) {}
    public record Move(String category) {}
}
