package com.pentaworks.intranet.content;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1")
public class ServiceWorkflowController {
    private static final int MAX_PHOTOS = 20;
    private static final long MAX_SOURCE_BYTES = 20L * 1024 * 1024;

    private final JdbcTemplate jdbc;

    public ServiceWorkflowController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostMapping(value = "/service-photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Transactional
    public Map<String, Object> uploadPhoto(@RequestParam long repairId, @RequestPart("file") MultipartFile file,
        Authentication auth) throws IOException {
        requireRepairEditor(auth, repairId);
        if (file.isEmpty() || file.getSize() > MAX_SOURCE_BYTES) {
            throw new IllegalArgumentException("사진은 장당 20MB 이하만 업로드할 수 있습니다.");
        }
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM service_photos WHERE repair_id=?", Integer.class, repairId);
        if (count != null && count >= MAX_PHOTOS) throw new IllegalArgumentException("정비기록에는 사진을 최대 20장까지 첨부할 수 있습니다.");

        BufferedImage source = ImageIO.read(new ByteArrayInputStream(file.getBytes()));
        if (source == null) throw new IllegalArgumentException("지원하지 않는 이미지 형식입니다.");
        EncodedImage main = encodeJpeg(resize(source, 1920), 0.84f);
        EncodedImage thumbnail = encodeJpeg(resize(source, 480), 0.76f);
        long id = insert("""
            INSERT INTO service_photos(repair_id,source_system,source_id,original_name,mime_type,image_data,
                thumbnail_data,thumbnail_width_px,thumbnail_height_px,width_px,height_px,source_created_at)
            VALUES(?,'intranet',UUID(),?,'image/jpeg',?,?,?,?,?,?,CURRENT_TIMESTAMP(6))
            """, repairId, cleanName(file.getOriginalFilename()), main.bytes(), thumbnail.bytes(), thumbnail.width(),
            thumbnail.height(), main.width(), main.height());
        return Map.of("id", id, "widthPx", main.width(), "heightPx", main.height(),
            "thumbnailWidthPx", thumbnail.width(), "thumbnailHeightPx", thumbnail.height());
    }

    @GetMapping("/service-photos/{id}/thumbnail")
    public ResponseEntity<byte[]> thumbnail(@PathVariable long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
            SELECT COALESCE(thumbnail_data,image_data) image_data,mime_type
            FROM service_photos WHERE id=?
            """, id);
        if (rows.isEmpty()) throw new IllegalArgumentException("사진을 찾을 수 없습니다.");
        Map<String, Object> row = rows.get(0);
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "private, max-age=86400")
            .contentType(MediaType.parseMediaType(String.valueOf(row.getOrDefault("mime_type", "image/jpeg"))))
            .body((byte[]) row.get("image_data"));
    }

    @DeleteMapping("/service-photos/{id}")
    public void deletePhoto(@PathVariable long id, Authentication auth) {
        Long repairId = jdbc.query("SELECT repair_id FROM service_photos WHERE id=?",
            rs -> rs.next() ? rs.getLong(1) : null, id);
        if (repairId == null) throw new IllegalArgumentException("사진을 찾을 수 없습니다.");
        requireRepairEditor(auth, repairId);
        jdbc.update("DELETE FROM service_photos WHERE id=?", id);
    }

    @GetMapping("/repairs/{repairId}/pm")
    public Map<String, Object> pm(@PathVariable long repairId) {
        List<Map<String, Object>> inspections = jdbc.queryForList(
            "SELECT id,checklist_version FROM service_pm_inspections WHERE repair_id=?", repairId);
        if (inspections.isEmpty()) return Map.of("items", List.of());
        long inspectionId = ((Number) inspections.get(0).get("id")).longValue();
        List<Map<String, Object>> items = jdbc.queryForList("""
            SELECT id,item_order,section_name,item_kind,item_name,purpose,result,comment
            FROM service_pm_items WHERE inspection_id=? ORDER BY item_order
            """, inspectionId);
        for (Map<String, Object> item : items) {
            item.put("fields", jdbc.queryForList("""
                SELECT field_order,label,value_text,input_type,suffix
                FROM service_pm_item_fields WHERE item_id=? ORDER BY field_order
                """, item.get("id")));
        }
        return Map.of("checklistVersion", inspections.get(0).get("checklist_version"), "items", items);
    }

    @PutMapping("/repairs/{repairId}/pm")
    @Transactional
    public void savePm(@PathVariable long repairId, @Valid @RequestBody PmInspectionRequest body, Authentication auth) {
        requireRepairEditor(auth, repairId);
        jdbc.update("DELETE FROM service_pm_inspections WHERE repair_id=?", repairId);
        if (body.items() == null || body.items().isEmpty()) return;
        long inspectionId = insert("INSERT INTO service_pm_inspections(repair_id,checklist_version) VALUES(?,'office-v1')", repairId);
        int itemOrder = 0;
        for (PmItemRequest item : body.items()) {
            long itemId = insert("""
                INSERT INTO service_pm_items(inspection_id,item_order,section_name,item_kind,item_name,purpose,result,comment)
                VALUES(?,?,?,?,?,?,?,?)
                """, inspectionId, ++itemOrder, blank(item.section()), blank(item.kind()), blank(item.name()),
                blank(item.purpose()), blank(item.result()), blank(item.comment()));
            int fieldOrder = 0;
            for (PmFieldRequest field : item.fields() == null ? List.<PmFieldRequest>of() : item.fields()) {
                jdbc.update("""
                    INSERT INTO service_pm_item_fields(item_id,field_order,label,value_text,input_type,suffix)
                    VALUES(?,?,?,?,?,?)
                    """, itemId, ++fieldOrder, blank(field.label()), blank(field.value()), blank(field.type()), blank(field.suffix()));
            }
        }
    }

    @GetMapping("/repairs/{repairId}/acr")
    public Map<String, Object> acr(@PathVariable long repairId) {
        List<Map<String, Object>> inspections = jdbc.queryForList(
            "SELECT id,overall_result FROM service_acr_inspections WHERE repair_id=?", repairId);
        if (inspections.isEmpty()) return Map.of("overallResult", "", "fields", List.of(), "pulseValues", List.of());
        long inspectionId = ((Number) inspections.get(0).get("id")).longValue();
        return Map.of(
            "overallResult", Objects.toString(inspections.get(0).get("overall_result"), ""),
            "fields", jdbc.queryForList("""
                SELECT section_key,field_key,value_text FROM service_acr_fields
                WHERE inspection_id=? ORDER BY section_key,field_key
                """, inspectionId),
            "pulseValues", jdbc.queryForList("""
                SELECT sequence_name,value_order,value_text FROM service_acr_pulse_values
                WHERE inspection_id=? ORDER BY sequence_name,value_order
                """, inspectionId));
    }

    @PutMapping("/repairs/{repairId}/acr")
    @Transactional
    public void saveAcr(@PathVariable long repairId, @Valid @RequestBody AcrInspectionRequest body, Authentication auth) {
        requireRepairEditor(auth, repairId);
        jdbc.update("DELETE FROM service_acr_inspections WHERE repair_id=?", repairId);
        if ((body.fields() == null || body.fields().isEmpty()) && (body.pulseValues() == null || body.pulseValues().isEmpty())
            && (body.overallResult() == null || body.overallResult().isBlank())) return;
        long inspectionId = insert("INSERT INTO service_acr_inspections(repair_id,overall_result) VALUES(?,?)",
            repairId, blank(body.overallResult()));
        for (AcrFieldRequest field : body.fields() == null ? List.<AcrFieldRequest>of() : body.fields()) {
            jdbc.update("""
                INSERT INTO service_acr_fields(inspection_id,section_key,field_key,value_text) VALUES(?,?,?,?)
                """, inspectionId, field.sectionKey(), field.fieldKey(), blank(field.value()));
        }
        for (AcrPulseRequest pulse : body.pulseValues() == null ? List.<AcrPulseRequest>of() : body.pulseValues()) {
            jdbc.update("""
                INSERT INTO service_acr_pulse_values(inspection_id,sequence_name,value_order,value_text) VALUES(?,?,?,?)
                """, inspectionId, pulse.sequenceName(), pulse.valueOrder(), blank(pulse.value()));
        }
    }

    @GetMapping("/repairs/{repairId}/components")
    public List<Map<String, Object>> repairComponents(@PathVariable long repairId) {
        return jdbc.queryForList("""
            SELECT link.component_id,link.action_type,link.quantity,link.note,c.name,c.component_type,c.part_number,
                   c.serial_number,e.model equipment_model
            FROM service_repair_components link
            JOIN service_equipment_components c ON c.id=link.component_id
            JOIN service_equipment e ON e.id=c.equipment_id
            WHERE link.repair_id=? ORDER BY e.id,c.id
            """, repairId);
    }

    @PutMapping("/repairs/{repairId}/components")
    @Transactional
    public void saveRepairComponents(@PathVariable long repairId, @RequestBody List<RepairComponentRequest> components,
        Authentication auth) {
        requireRepairEditor(auth, repairId);
        jdbc.update("DELETE FROM service_repair_components WHERE repair_id=?", repairId);
        for (RepairComponentRequest component : components == null ? List.<RepairComponentRequest>of() : components) {
            int inserted = jdbc.update("""
                INSERT INTO service_repair_components(repair_id,component_id,action_type,quantity,note)
                SELECT r.id,c.id,?,?,?
                FROM repair_requests r
                JOIN service_equipment e ON e.hospital_id=r.hospital_id AND e.deleted_at IS NULL
                JOIN service_equipment_components c ON c.equipment_id=e.id AND c.deleted_at IS NULL
                WHERE r.id=? AND c.id=?
                """, defaultValue(component.actionType(), "CHECKED"),
                component.quantity() == null || component.quantity() < 1 ? 1 : component.quantity(),
                blank(component.note()), repairId, component.componentId());
            if (inserted == 0) throw new IllegalArgumentException("정비기록의 병원에 속하지 않은 부품은 연결할 수 없습니다.");
        }
    }

    @GetMapping("/hospitals/{hospitalId}/memos")
    public List<Map<String, Object>> memos(@PathVariable long hospitalId) {
        return jdbc.queryForList("""
            SELECT m.id,m.memo_text,m.sort_order,m.created_at,m.updated_at,u.name created_by_name
            FROM service_hospital_memos m LEFT JOIN users u ON u.id=m.created_by
            WHERE m.hospital_id=? AND m.deleted_at IS NULL ORDER BY m.sort_order,m.id
            """, hospitalId);
    }

    @PostMapping("/hospitals/{hospitalId}/memos")
    public Map<String, Object> createMemo(@PathVariable long hospitalId, @Valid @RequestBody MemoRequest body,
        Authentication auth) {
        requireAdmin(auth);
        long id = insert("""
            INSERT INTO service_hospital_memos(hospital_id,memo_text,sort_order,created_by)
            SELECT ?,?,COALESCE((SELECT MAX(x.sort_order)+1 FROM service_hospital_memos x WHERE x.hospital_id=?),1),u.id
            FROM users u WHERE u.login_id=?
            """, hospitalId, body.memo().trim(), hospitalId, auth.getName());
        return Map.of("id", id);
    }

    @PutMapping("/hospitals/{hospitalId}/memos/{id}")
    public void updateMemo(@PathVariable long hospitalId, @PathVariable long id, @Valid @RequestBody MemoRequest body,
        Authentication auth) {
        requireAdmin(auth);
        if (jdbc.update("UPDATE service_hospital_memos SET memo_text=? WHERE id=? AND hospital_id=? AND deleted_at IS NULL",
            body.memo().trim(), id, hospitalId) == 0) throw new IllegalArgumentException("메모를 찾을 수 없습니다.");
    }

    @DeleteMapping("/hospitals/{hospitalId}/memos/{id}")
    public void deleteMemo(@PathVariable long hospitalId, @PathVariable long id, Authentication auth) {
        requireAdmin(auth);
        jdbc.update("UPDATE service_hospital_memos SET deleted_at=CURRENT_TIMESTAMP(6) WHERE id=? AND hospital_id=?", id, hospitalId);
    }

    @PutMapping("/service-schedules/{id}")
    public void updateSchedule(@PathVariable long id, @Valid @RequestBody ServiceScheduleUpdate body, Authentication auth) {
        requireAdmin(auth);
        if (jdbc.update("""
            UPDATE service_schedules SET hospital_id=?,scheduled_date=?,service_type=?,note=?
            WHERE id=? AND deleted_at IS NULL AND status='PLANNED'
            """, body.hospitalId(), body.scheduledDate(), body.serviceType(), blank(body.note()), id) == 0) {
            throw new IllegalArgumentException("수정할 일정을 찾을 수 없습니다.");
        }
    }

    @PatchMapping("/service-schedules/{id}/complete")
    public void completeSchedule(@PathVariable long id, @RequestParam long repairId, Authentication auth) {
        requireRepairEditor(auth, repairId);
        if (jdbc.update("""
            UPDATE service_schedules SET status='COMPLETED',repair_id=?,completed_at=CURRENT_TIMESTAMP(6)
            WHERE id=? AND deleted_at IS NULL AND status='PLANNED'
              AND hospital_id=(SELECT hospital_id FROM repair_requests WHERE id=?)
            """, repairId, id, repairId) == 0) {
            throw new IllegalArgumentException("일정과 정비기록의 병원이 일치하지 않거나 이미 완료된 일정입니다.");
        }
    }

    @GetMapping("/service-calendar")
    public ServiceCalendar calendar(@RequestParam LocalDate from, @RequestParam LocalDate to) {
        if (to.isBefore(from) || to.isAfter(from.plusYears(2))) throw new IllegalArgumentException("달력 조회 범위가 올바르지 않습니다.");
        List<Map<String, Object>> hospitals = jdbc.queryForList("""
            SELECT id,name,pm_interval_months,pm_override,acr_full_override,acr_doc_override
            FROM service_hospitals WHERE deleted_at IS NULL ORDER BY name
            """);
        List<Map<String, Object>> logs = jdbc.queryForList("""
            SELECT hospital_id,service_type,acr_kind,counts_as_pm,COALESCE(work_date,written_at) work_date,status,id,service_title,equipment_name
            FROM repair_requests WHERE deleted_at IS NULL AND hospital_id IS NOT NULL
            ORDER BY COALESCE(work_date,written_at) DESC,id DESC
            """);
        List<CalendarItem> due = calculateDue(hospitals, logs, from, to);
        List<Map<String, Object>> schedules = jdbc.queryForList("""
            SELECT s.*,h.name hospital_name FROM service_schedules s JOIN service_hospitals h ON h.id=s.hospital_id
            WHERE s.deleted_at IS NULL AND s.scheduled_date BETWEEN ? AND ? ORDER BY s.scheduled_date,s.created_at
            """, from, to);
        List<Map<String, Object>> records = jdbc.queryForList("""
            SELECT r.id,r.hospital_id,COALESCE(h.name,r.hospital_name) hospital_name,r.service_type,r.acr_kind,r.status,
                   COALESCE(r.work_date,r.written_at) work_date,COALESCE(r.service_title,r.equipment_name) title
            FROM repair_requests r LEFT JOIN service_hospitals h ON h.id=r.hospital_id
            WHERE r.deleted_at IS NULL AND COALESCE(r.work_date,r.written_at) BETWEEN ? AND ?
            ORDER BY work_date,r.id
            """, from, to);
        return new ServiceCalendar(due, schedules, records);
    }

    private List<CalendarItem> calculateDue(List<Map<String, Object>> hospitals, List<Map<String, Object>> logs,
        LocalDate from, LocalDate to) {
        Map<Long, List<Map<String, Object>>> byHospital = new HashMap<>();
        for (Map<String, Object> log : logs) {
            long hospitalId = ((Number) log.get("hospital_id")).longValue();
            byHospital.computeIfAbsent(hospitalId, ignored -> new ArrayList<>()).add(log);
        }
        List<CalendarItem> result = new ArrayList<>();
        for (Map<String, Object> hospital : hospitals) {
            long hospitalId = ((Number) hospital.get("id")).longValue();
            String hospitalName = String.valueOf(hospital.get("name"));
            List<Map<String, Object>> hospitalLogs = byHospital.getOrDefault(hospitalId, List.of());
            LocalDate lastPm = latest(hospitalLogs, log -> "PM".equals(log.get("service_type")) || Boolean.TRUE.equals(log.get("counts_as_pm")));
            LocalDate lastAcr = latest(hospitalLogs, log -> "ACR".equals(log.get("service_type")) && !"pretest".equals(log.get("acr_kind")));
            LocalDate lastFull = latest(hospitalLogs, log -> "ACR".equals(log.get("service_type")) && "full".equals(log.get("acr_kind")));
            LocalDate pmDue = date(hospital.get("pm_override"));
            if (pmDue == null && lastPm != null) pmDue = lastPm.plusMonths(((Number) hospital.get("pm_interval_months")).longValue());
            LocalDate fullDue = date(hospital.get("acr_full_override"));
            if (fullDue == null && lastFull != null) fullDue = lastFull.plusMonths(36);
            LocalDate docDue = date(hospital.get("acr_doc_override"));
            if (docDue == null && lastAcr != null) docDue = lastAcr.plusMonths(12);
            addDue(result, hospitalId, hospitalName, "PM", "PM 예정", pmDue, from, to);
            addDue(result, hospitalId, hospitalName, "ACR_FULL", "ACR 정밀 예정", fullDue, from, to);
            if (docDue != null && (fullDue == null || docDue.getYear() != fullDue.getYear())) {
                addDue(result, hospitalId, hospitalName, "ACR_DOC", "ACR 서류 예정", docDue, from, to);
            }
        }
        result.sort((left, right) -> left.date().compareTo(right.date()));
        return result;
    }

    private LocalDate latest(List<Map<String, Object>> logs, java.util.function.Predicate<Map<String, Object>> predicate) {
        return logs.stream().filter(predicate).map(row -> date(row.get("work_date"))).filter(Objects::nonNull).max(LocalDate::compareTo).orElse(null);
    }

    private void addDue(List<CalendarItem> target, long hospitalId, String hospitalName, String kind, String label,
        LocalDate due, LocalDate from, LocalDate to) {
        if (due != null && !due.isBefore(from) && !due.isAfter(to)) target.add(new CalendarItem(due, kind, label, hospitalId, hospitalName));
    }

    private LocalDate date(Object value) {
        if (value == null) return null;
        if (value instanceof java.sql.Date sqlDate) return sqlDate.toLocalDate();
        if (value instanceof LocalDate localDate) return localDate;
        return LocalDate.parse(String.valueOf(value));
    }

    private void requireRepairEditor(Authentication auth, long repairId) {
        Integer allowed = jdbc.queryForObject("""
            SELECT COUNT(*) FROM repair_requests r JOIN users u ON u.login_id=?
            WHERE r.id=? AND r.deleted_at IS NULL AND (r.requester_id=u.id OR u.role='ADMIN')
            """, Integer.class, auth.getName(), repairId);
        if (allowed == null || allowed == 0) throw new AccessDeniedException("정비기록 작성자와 관리자만 변경할 수 있습니다.");
    }

    private void requireAdmin(Authentication auth) {
        boolean admin = auth != null && auth.getAuthorities().stream().anyMatch(role -> "ROLE_ADMIN".equals(role.getAuthority()));
        if (!admin) throw new AccessDeniedException("관리자만 변경할 수 있습니다.");
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

    private BufferedImage resize(BufferedImage source, int maxDimension) {
        int sourceWidth = source.getWidth();
        int sourceHeight = source.getHeight();
        double scale = Math.min(1.0, (double) maxDimension / Math.max(sourceWidth, sourceHeight));
        int width = Math.max(1, (int) Math.round(sourceWidth * scale));
        int height = Math.max(1, (int) Math.round(sourceHeight * scale));
        BufferedImage target = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = target.createGraphics();
        graphics.setColor(Color.WHITE);
        graphics.fillRect(0, 0, width, height);
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        graphics.drawImage(source, 0, 0, width, height, null);
        graphics.dispose();
        return target;
    }

    private EncodedImage encodeJpeg(BufferedImage image, float quality) throws IOException {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        ImageWriteParam params = writer.getDefaultWriteParam();
        params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        params.setCompressionQuality(quality);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ImageOutputStream imageOutput = ImageIO.createImageOutputStream(output)) {
            writer.setOutput(imageOutput);
            writer.write(null, new IIOImage(image, null, null), params);
        } finally {
            writer.dispose();
        }
        return new EncodedImage(output.toByteArray(), image.getWidth(), image.getHeight());
    }

    private String cleanName(String name) {
        if (name == null || name.isBlank()) return "service-photo.jpg";
        return name.replace('\\', '/').substring(name.replace('\\', '/').lastIndexOf('/') + 1);
    }

    private String blank(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String defaultValue(String value, String fallback) { return value == null || value.isBlank() ? fallback : value.trim(); }

    private record EncodedImage(byte[] bytes, int width, int height) {}
    public record PmInspectionRequest(List<PmItemRequest> items) {}
    public record PmItemRequest(String section, String kind, @NotBlank String name, String purpose, String result,
                                String comment, List<PmFieldRequest> fields) {}
    public record PmFieldRequest(String label, String value, String type, String suffix) {}
    public record AcrInspectionRequest(String overallResult, List<AcrFieldRequest> fields, List<AcrPulseRequest> pulseValues) {}
    public record AcrFieldRequest(@NotBlank String sectionKey, @NotBlank String fieldKey, String value) {}
    public record AcrPulseRequest(@NotBlank String sequenceName, int valueOrder, String value) {}
    public record RepairComponentRequest(@NotNull Long componentId, String actionType, Integer quantity, String note) {}
    public record MemoRequest(@NotBlank String memo) {}
    public record ServiceScheduleUpdate(@NotNull Long hospitalId, @NotNull LocalDate scheduledDate,
                                        @NotBlank String serviceType, String note) {}
    public record CalendarItem(LocalDate date, String kind, String label, long hospitalId, String hospitalName) {}
    public record ServiceCalendar(List<CalendarItem> due, List<Map<String, Object>> schedules,
                                  List<Map<String, Object>> records) {}
}
