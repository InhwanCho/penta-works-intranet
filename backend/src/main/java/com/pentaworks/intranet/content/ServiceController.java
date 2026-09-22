package com.pentaworks.intranet.content;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
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
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class ServiceController {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public ServiceController(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @GetMapping("/hospitals")
    public List<Map<String, Object>> hospitals() {
        return jdbc.queryForList("""
            SELECT h.*,
              (SELECT COUNT(*) FROM repair_requests r WHERE r.hospital_id=h.id AND r.deleted_at IS NULL) service_log_count,
              (SELECT COUNT(*) FROM service_prep_items p WHERE p.hospital_id=h.id AND p.done=FALSE) open_prep_count
            FROM service_hospitals h
            WHERE h.deleted_at IS NULL
            ORDER BY h.name
            """);
    }

    @GetMapping("/hospitals/{id}")
    public Map<String, Object> hospital(@PathVariable long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM service_hospitals WHERE id=? AND deleted_at IS NULL", id);
        if (rows.isEmpty()) throw new IllegalArgumentException("병원 정보를 찾을 수 없습니다.");
        return rows.get(0);
    }

    @PostMapping("/hospitals")
    @Transactional
    public Map<String, Object> createHospital(@Valid @RequestBody HospitalRequest body, Authentication auth) {
        requireAdmin(auth);
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO service_hospitals(code,name,region,address,notes,pm_interval_months,contacts_json,systems_json)
                VALUES(?,?,?,?,?,?,?,?)
                """, Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, blank(body.code()));
            statement.setString(2, body.name().trim());
            statement.setString(3, blank(body.region()));
            statement.setString(4, blank(body.address()));
            statement.setString(5, blank(body.notes()));
            statement.setInt(6, body.pmIntervalMonths() == null || body.pmIntervalMonths() < 1 ? 6 : body.pmIntervalMonths());
            statement.setString(7, toJson(body.contacts()));
            statement.setString(8, toJson(body.systems()));
            return statement;
        }, keys);
        return Map.of("id", keys.getKey().longValue());
    }

    @PutMapping("/hospitals/{id}")
    public void updateHospital(@PathVariable long id, @Valid @RequestBody HospitalRequest body, Authentication auth) {
        requireAdmin(auth);
        int changed = jdbc.update("""
            UPDATE service_hospitals SET code=?,name=?,region=?,address=?,notes=?,pm_interval_months=?,contacts_json=?,systems_json=?
            WHERE id=? AND deleted_at IS NULL
            """, blank(body.code()), body.name().trim(), blank(body.region()), blank(body.address()), blank(body.notes()),
            body.pmIntervalMonths() == null || body.pmIntervalMonths() < 1 ? 6 : body.pmIntervalMonths(),
            toJson(body.contacts()), toJson(body.systems()), id);
        if (changed == 0) throw new IllegalArgumentException("병원 정보를 찾을 수 없습니다.");
    }

    @DeleteMapping("/hospitals/{id}")
    public void deleteHospital(@PathVariable long id, Authentication auth) {
        requireAdmin(auth);
        jdbc.update("UPDATE service_hospitals SET deleted_at=CURRENT_TIMESTAMP(6) WHERE id=?", id);
    }

    @GetMapping("/service-prep")
    public List<Map<String, Object>> prep(@RequestParam(required = false) Long hospitalId) {
        if (hospitalId == null) return jdbc.queryForList("""
            SELECT p.*,h.name hospital_name FROM service_prep_items p
            JOIN service_hospitals h ON h.id=p.hospital_id ORDER BY p.done,p.created_at
            """);
        return jdbc.queryForList("""
            SELECT p.*,h.name hospital_name FROM service_prep_items p
            JOIN service_hospitals h ON h.id=p.hospital_id WHERE p.hospital_id=? ORDER BY p.done,p.created_at
            """, hospitalId);
    }

    @PostMapping("/service-prep")
    public Map<String, Object> createPrep(@Valid @RequestBody PrepRequest body) {
        long id = insert("INSERT INTO service_prep_items(hospital_id,text) VALUES(?,?)", body.hospitalId(), body.text().trim());
        return Map.of("id", id);
    }

    @PatchMapping("/service-prep/{id}")
    public void updatePrep(@PathVariable long id, @RequestBody DoneRequest body) {
        jdbc.update("UPDATE service_prep_items SET done=?,done_at=IF(?,CURRENT_TIMESTAMP(6),NULL) WHERE id=?", body.done(), body.done(), id);
    }

    @DeleteMapping("/service-prep/{id}")
    public void deletePrep(@PathVariable long id) {
        jdbc.update("DELETE FROM service_prep_items WHERE id=?", id);
    }

    @GetMapping("/service-schedules")
    public List<Map<String, Object>> schedules(@RequestParam(required = false) Long hospitalId,
        @RequestParam(required = false) LocalDate from, @RequestParam(required = false) LocalDate to) {
        if (hospitalId != null) return jdbc.queryForList("""
            SELECT s.*,h.name hospital_name FROM service_schedules s
            JOIN service_hospitals h ON h.id=s.hospital_id
            WHERE s.deleted_at IS NULL AND s.hospital_id=? ORDER BY s.scheduled_date,s.created_at
            """, hospitalId);
        LocalDate start = from == null ? LocalDate.now().withDayOfMonth(1) : from;
        LocalDate end = to == null ? start.plusMonths(3) : to;
        return jdbc.queryForList("""
            SELECT s.*,h.name hospital_name FROM service_schedules s
            JOIN service_hospitals h ON h.id=s.hospital_id
            WHERE s.deleted_at IS NULL AND s.scheduled_date BETWEEN ? AND ?
            ORDER BY s.scheduled_date,s.created_at
            """, start, end);
    }

    @PostMapping("/service-schedules")
    public Map<String, Object> createSchedule(@Valid @RequestBody ServiceScheduleRequest body, Authentication auth) {
        long id = insert("""
            INSERT INTO service_schedules(hospital_id,scheduled_date,service_type,note,created_by)
            SELECT ?,?,?,?,u.id FROM users u WHERE u.login_id=?
            """, body.hospitalId(), body.scheduledDate(), body.serviceType(), blank(body.note()), auth.getName());
        return Map.of("id", id);
    }

    @DeleteMapping("/service-schedules/{id}")
    public void deleteSchedule(@PathVariable long id, Authentication auth) {
        requireAdmin(auth);
        jdbc.update("UPDATE service_schedules SET deleted_at=CURRENT_TIMESTAMP(6) WHERE id=?", id);
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

    private void requireAdmin(Authentication auth) {
        boolean admin = auth != null && auth.getAuthorities().stream().anyMatch(role -> "ROLE_ADMIN".equals(role.getAuthority()));
        if (!admin) throw new AccessDeniedException("관리자만 병원 정보를 변경할 수 있습니다.");
    }

    private String toJson(Object value) {
        if (value == null) return null;
        try { return json.writeValueAsString(value); }
        catch (JsonProcessingException error) { throw new IllegalArgumentException("연락처 또는 장비 정보 형식이 올바르지 않습니다."); }
    }

    private String blank(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    public record HospitalRequest(String code, @NotBlank String name, String region, String address, String notes,
        Integer pmIntervalMonths, Object contacts, Object systems) {}
    public record PrepRequest(@NotNull Long hospitalId, @NotBlank String text) {}
    public record DoneRequest(boolean done) {}
    public record ServiceScheduleRequest(@NotNull Long hospitalId, @NotNull LocalDate scheduledDate,
        @NotBlank String serviceType, String note) {}
}
