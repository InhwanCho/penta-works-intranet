package com.pentaworks.intranet.content;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/workshop-repairs")
public class WorkshopRepairController {
    private final JdbcTemplate jdbc;
    public WorkshopRepairController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping
    public List<Map<String,Object>> list() {
        return jdbc.queryForList("SELECT w.*,u.name author_name FROM workshop_repairs w JOIN users u ON u.id=w.author_id WHERE w.deleted_at IS NULL ORDER BY w.work_date DESC,w.id DESC");
    }
    @GetMapping("/{id}")
    public Map<String,Object> detail(@PathVariable long id) {
        var row = jdbc.queryForMap("SELECT w.*,u.name author_name FROM workshop_repairs w JOIN users u ON u.id=w.author_id WHERE w.id=? AND w.deleted_at IS NULL", id);
        row.put("units", jdbc.queryForList("SELECT unit_no,serial_number,status,fault_axis,test_result FROM workshop_repair_units WHERE repair_id=? ORDER BY unit_no",id));
        row.put("files", jdbc.queryForList("SELECT f.id,f.original_name FROM workshop_repair_files l JOIN files f ON f.id=l.file_id WHERE l.repair_id=? AND f.deleted_at IS NULL", id));
        row.put("workshop_photos",jdbc.queryForList("SELECT id,original_name,width_px,height_px FROM workshop_repair_photos WHERE repair_id=? ORDER BY id",id));
        row.put("photos", List.of());
        return row;
    }
    @GetMapping("/photos/{photoId}/content")
    public ResponseEntity<byte[]> photo(@PathVariable long photoId) {
        var row=jdbc.queryForMap("SELECT p.image_data,p.mime_type FROM workshop_repair_photos p JOIN workshop_repairs w ON w.id=p.repair_id WHERE p.id=? AND w.deleted_at IS NULL",photoId);
        return ResponseEntity.ok().header("Cache-Control","private, max-age=86400").contentType(MediaType.parseMediaType(String.valueOf(row.get("mime_type")))).body((byte[])row.get("image_data"));
    }
    @PostMapping
    @Transactional
    public Map<String,Object> create(@Valid @RequestBody Draft body, Authentication auth) {
        validate(body);
        var keys = new GeneratedKeyHolder();
        long userId = userId(auth);
        jdbc.update(connection -> {
            var statement = connection.prepareStatement("INSERT INTO workshop_repairs(equipment_name,description_markdown,work_date,quantity,status,author_id) VALUES(?,?,?,?,?,?)", new String[]{"id"});
            statement.setString(1,body.equipmentName()); statement.setString(2,body.contentMarkdown()); statement.setObject(3,body.workDate()); statement.setInt(4,body.units().size()); statement.setString(5,body.status()); statement.setLong(6,userId); return statement;
        },keys);
        long id = keys.getKey().longValue(); saveUnits(id,body.units()); attach(id,body.fileIds(),userId); return Map.of("id",id);
    }
    @PutMapping("/{id}")
    @Transactional
    public void update(@PathVariable long id,@Valid @RequestBody Draft body,Authentication auth) {
        owner(id,auth); validate(body);
        jdbc.update("UPDATE workshop_repairs SET equipment_name=?,description_markdown=?,work_date=?,quantity=?,status=? WHERE id=?",body.equipmentName(),body.contentMarkdown(),body.workDate(),body.units().size(),body.status(),id);
        saveUnits(id,body.units()); attach(id,body.fileIds(),userId(auth));
    }
    @DeleteMapping("/{id}")
    public void delete(@PathVariable long id,Authentication auth) { owner(id,auth); jdbc.update("UPDATE workshop_repairs SET deleted_at=CURRENT_TIMESTAMP(6) WHERE id=?",id); }

    private void attach(long id,List<Long> files,long userId) {
        for (long fileId : files == null ? List.<Long>of() : files) {
            if (jdbc.queryForObject("SELECT COUNT(*) FROM files WHERE id=? AND uploaded_by=? AND deleted_at IS NULL",Integer.class,fileId,userId)==0) throw new AccessDeniedException("본인이 업로드한 파일만 첨부할 수 있습니다.");
            jdbc.update("INSERT INTO workshop_repair_files(repair_id,file_id) SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM workshop_repair_files WHERE repair_id=? AND file_id=?)",id,fileId,id,fileId);
            jdbc.update("UPDATE files SET upload_status='ATTACHED',expires_at=NULL WHERE id=?",fileId);
        }
    }
    private long userId(Authentication auth) { return jdbc.queryForObject("SELECT id FROM users WHERE login_id=?",Long.class,auth.getName()); }
    private void admin(Authentication auth) { if (jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE login_id=? AND role='ADMIN'",Integer.class,auth.getName())==0) throw new AccessDeniedException("관리자만 이동할 수 있습니다."); }
    private void owner(long id,Authentication auth) { if (jdbc.queryForObject("SELECT COUNT(*) FROM workshop_repairs w JOIN users u ON u.login_id=? WHERE w.id=? AND w.deleted_at IS NULL AND (w.author_id=u.id OR u.role='ADMIN')",Integer.class,auth.getName(),id)==0) throw new AccessDeniedException("작성자 또는 관리자만 수정할 수 있습니다."); }
    private static final Set<String> STATUSES=Set.of("RECEIVED","IN_PROGRESS","TEST_REQUIRED","TEST_FAILED","COMPLETED");
    private void validate(Draft body) {
        if (!STATUSES.contains(body.status()==null ? "" : body.status()) || body.units()==null || body.units().isEmpty() || body.units().size()>100) throw new IllegalArgumentException("상태와 수량(1~100개)을 확인해주세요.");
        for (Unit unit:body.units()) {
            if (unit==null || !STATUSES.contains(unit.status()==null ? "" : unit.status()) || (unit.faultAxis()!=null && !Set.of("","X","Y","Z").contains(unit.faultAxis()))) throw new IllegalArgumentException("개별 부품의 상태와 축을 확인해주세요.");
            if ("TEST_FAILED".equals(unit.status()) && (unit.testResult()==null || unit.testResult().isBlank())) throw new IllegalArgumentException("테스트 실패 내용을 입력해주세요.");
        }
        if ("TEST_FAILED".equals(body.status()) && body.units().stream().noneMatch(unit->"TEST_FAILED".equals(unit.status()))) throw new IllegalArgumentException("테스트 실패한 개별 부품의 결과를 입력해주세요.");
        if ("COMPLETED".equals(body.status()) && body.units().stream().anyMatch(unit->!"COMPLETED".equals(unit.status()))) throw new IllegalArgumentException("모든 부품이 완료된 후 수리 완료로 변경해주세요.");
        if (body.units().stream().anyMatch(unit->"TEST_FAILED".equals(unit.status())) && !"TEST_FAILED".equals(body.status())) throw new IllegalArgumentException("실패한 부품이 있으면 전체 상태도 테스트 실패여야 합니다.");
    }
    private void saveUnits(long id,List<Unit> units) {
        jdbc.update("DELETE FROM workshop_repair_units WHERE repair_id=?",id);
        for (int i=0;i<units.size();i++) {
            Unit unit=units.get(i);
            jdbc.update("INSERT INTO workshop_repair_units(repair_id,unit_no,serial_number,status,fault_axis,test_result) VALUES(?,?,?,?,?,?)",id,i+1,unit.serialNumber(),unit.status(),unit.faultAxis(),unit.testResult());
        }
    }
    public record Draft(@NotBlank String equipmentName,@NotBlank String contentMarkdown,@NotNull LocalDate workDate,String status,List<Unit> units,List<Long> fileIds) {}
    public record Unit(String serialNumber,String status,String faultAxis,String testResult) {}
}
