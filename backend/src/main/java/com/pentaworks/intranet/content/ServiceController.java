package com.pentaworks.intranet.content;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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

    public ServiceController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
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
        Map<String, Object> hospital = new LinkedHashMap<>(rows.get(0));
        hospital.put("contacts", contacts(id));
        hospital.put("systems", equipment(id));
        return hospital;
    }

    @PostMapping("/hospitals")
    @Transactional
    public Map<String, Object> createHospital(@Valid @RequestBody HospitalRequest body, Authentication auth) {
        requireAdmin(auth);
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO service_hospitals(code,mreyes_site_id,name,region,address,notes,pm_interval_months,
                    pm_override,acr_full_override,acr_doc_override)
                VALUES(?,?,?,?,?,?,?,?,?,?)
                """, Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, blank(body.code()));
            statement.setString(2, blank(body.mreyesSiteId()));
            statement.setString(3, body.name().trim());
            statement.setString(4, blank(body.region()));
            statement.setString(5, blank(body.address()));
            statement.setString(6, blank(body.notes()));
            statement.setInt(7, body.pmIntervalMonths() == null || body.pmIntervalMonths() < 1 ? 2 : body.pmIntervalMonths());
            statement.setObject(8, body.pmOverride());
            statement.setObject(9, body.acrFullOverride());
            statement.setObject(10, body.acrDocOverride());
            return statement;
        }, keys);
        long hospitalId = keys.getKey().longValue();
        syncContacts(hospitalId, body.contacts());
        syncEquipment(hospitalId, body.systems());
        return Map.of("id", hospitalId);
    }

    @PutMapping("/hospitals/{id}")
    @Transactional
    public void updateHospital(@PathVariable long id, @Valid @RequestBody HospitalRequest body, Authentication auth) {
        requireAdmin(auth);
        int changed = jdbc.update("""
            UPDATE service_hospitals SET code=?,mreyes_site_id=?,name=?,region=?,address=?,notes=?,pm_interval_months=?,
                pm_override=?,acr_full_override=?,acr_doc_override=?
            WHERE id=? AND deleted_at IS NULL
            """, blank(body.code()), blank(body.mreyesSiteId()), body.name().trim(), blank(body.region()), blank(body.address()), blank(body.notes()),
            body.pmIntervalMonths() == null || body.pmIntervalMonths() < 1 ? 2 : body.pmIntervalMonths(),
            body.pmOverride(), body.acrFullOverride(), body.acrDocOverride(), id);
        if (changed == 0) throw new IllegalArgumentException("병원 정보를 찾을 수 없습니다.");
        syncContacts(id, body.contacts());
        syncEquipment(id, body.systems());
    }

    @DeleteMapping("/hospitals/{id}")
    public void deleteHospital(@PathVariable long id, Authentication auth) {
        requireAdmin(auth);
        jdbc.update("UPDATE service_hospitals SET deleted_at=CURRENT_TIMESTAMP(6) WHERE id=?", id);
    }

    @GetMapping("/service-prep")
    public List<Map<String, Object>> prep(@RequestParam(required = false) Long hospitalId) {
        jdbc.update("DELETE FROM service_prep_items WHERE done=TRUE AND done_at < CURRENT_TIMESTAMP(6) - INTERVAL 1 HOUR");
        if (hospitalId == null) return jdbc.queryForList("""
            SELECT p.*,h.name hospital_name FROM service_prep_items p
            JOIN service_hospitals h ON h.id=p.hospital_id
            WHERE h.deleted_at IS NULL ORDER BY p.done,p.created_at
            """);
        return jdbc.queryForList("""
            SELECT p.*,h.name hospital_name FROM service_prep_items p
            JOIN service_hospitals h ON h.id=p.hospital_id
            WHERE p.hospital_id=? AND h.deleted_at IS NULL ORDER BY p.done,p.created_at
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

    @GetMapping("/service-photos")
    public List<Map<String, Object>> photos(@RequestParam long repairId) {
        return jdbc.queryForList("""
            SELECT id,repair_id,source_system,source_id,original_name,mime_type,width_px,height_px,
                   thumbnail_width_px,thumbnail_height_px,source_created_at,created_at
            FROM service_photos WHERE repair_id=? ORDER BY source_created_at,created_at,id
            """, repairId);
    }

    @GetMapping("/service-photos/{id}/content")
    public ResponseEntity<byte[]> photoContent(@PathVariable long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT image_data,mime_type,original_name FROM service_photos WHERE id=?", id);
        if (rows.isEmpty()) throw new IllegalArgumentException("사진을 찾을 수 없습니다.");
        Map<String, Object> row = rows.get(0);
        byte[] data = (byte[]) row.get("image_data");
        String mimeType = String.valueOf(row.getOrDefault("mime_type", "image/jpeg"));
        return ResponseEntity.ok()
            .header(HttpHeaders.CACHE_CONTROL, "private, max-age=86400")
            .contentType(MediaType.parseMediaType(mimeType))
            .body(data);
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

    private List<Map<String, Object>> equipment(long hospitalId) {
        List<Map<String, Object>> equipment = jdbc.queryForList("""
            SELECT id,model,manufacturer vendor,serial_number serial,magnetic_field_tesla tesla,
                   software_version swVersion,installed_at installDate
            FROM service_equipment
            WHERE hospital_id=? AND deleted_at IS NULL
            ORDER BY installed_at,id
            """, hospitalId);
        for (Map<String, Object> item : equipment) {
            item.put("components", jdbc.queryForList("""
                SELECT id,name,component_type componentType,part_number partNumber,serial_number serialNumber,
                       installed_at installedAt,replaced_at replacedAt,status,notes
                FROM service_equipment_components
                WHERE equipment_id=? AND deleted_at IS NULL ORDER BY id
                """, item.get("id")));
        }
        return equipment;
    }

    private List<Map<String, Object>> contacts(long hospitalId) {
        return jdbc.queryForList("""
            SELECT id,name,phone
            FROM service_hospital_contacts
            WHERE hospital_id=? AND deleted_at IS NULL
            ORDER BY sort_order,id
            """, hospitalId);
    }

    private void syncContacts(long hospitalId, List<ContactRequest> contacts) {
        Set<Long> retained = new HashSet<>();
        jdbc.update("UPDATE service_hospital_contacts SET sort_order=sort_order+100000 WHERE hospital_id=? AND deleted_at IS NULL", hospitalId);
        int sortOrder = 0;
        for (ContactRequest contact : contacts == null ? List.<ContactRequest>of() : contacts) {
            if (contact == null || contact.empty()) continue;
            sortOrder++;
            if (contact.id() == null) {
                long id = insert("INSERT INTO service_hospital_contacts(hospital_id,sort_order,name,phone) VALUES(?,?,?,?)",
                    hospitalId, sortOrder, blank(contact.name()), blank(contact.phone()));
                retained.add(id);
                continue;
            }
            int changed = jdbc.update("""
                UPDATE service_hospital_contacts SET sort_order=?,name=?,phone=?,deleted_at=NULL
                WHERE id=? AND hospital_id=?
                """, sortOrder, blank(contact.name()), blank(contact.phone()), contact.id(), hospitalId);
            if (changed == 0 && jdbc.queryForObject("SELECT COUNT(*) FROM service_hospital_contacts WHERE id=? AND hospital_id=?", Integer.class, contact.id(), hospitalId) == 0) {
                throw new IllegalArgumentException("담당자 정보를 찾을 수 없습니다.");
            }
            retained.add(contact.id());
        }
        for (Long existingId : jdbc.queryForList("SELECT id FROM service_hospital_contacts WHERE hospital_id=? AND deleted_at IS NULL", Long.class, hospitalId)) {
            if (!retained.contains(existingId)) jdbc.update("UPDATE service_hospital_contacts SET deleted_at=CURRENT_TIMESTAMP(6) WHERE id=?", existingId);
        }
    }

    private void syncEquipment(long hospitalId, List<EquipmentRequest> systems) {
        Set<Long> retained = new HashSet<>();
        for (EquipmentRequest system : systems == null ? List.<EquipmentRequest>of() : systems) {
            if (system == null || system.empty()) continue;
            if (system.id() == null) {
                long id = insert("""
                    INSERT INTO service_equipment(hospital_id,source_system,source_id,manufacturer,model,serial_number,
                        magnetic_field_tesla,software_version,installed_at,status)
                    VALUES(?,'intranet',UUID(),?,?,?,?,?,?,'ACTIVE')
                    """, hospitalId, blank(system.vendor()), blank(system.model()), blank(system.serial()),
                    blank(system.tesla()), blank(system.swVersion()), system.installDate());
                retained.add(id);
                syncComponents(id, system.components());
                continue;
            }
            int changed = jdbc.update("""
                UPDATE service_equipment
                SET manufacturer=?,model=?,serial_number=?,magnetic_field_tesla=?,software_version=?,installed_at=?,status='ACTIVE',deleted_at=NULL
                WHERE id=? AND hospital_id=?
                """, blank(system.vendor()), blank(system.model()), blank(system.serial()), blank(system.tesla()),
                blank(system.swVersion()), system.installDate(), system.id(), hospitalId);
            if (changed == 0 && jdbc.queryForObject("SELECT COUNT(*) FROM service_equipment WHERE id=? AND hospital_id=?", Integer.class, system.id(), hospitalId) == 0) {
                throw new IllegalArgumentException("설치 장비 정보를 찾을 수 없습니다.");
            }
            retained.add(system.id());
            syncComponents(system.id(), system.components());
        }
        for (Long existingId : jdbc.queryForList("SELECT id FROM service_equipment WHERE hospital_id=? AND deleted_at IS NULL", Long.class, hospitalId)) {
            if (!retained.contains(existingId)) jdbc.update("UPDATE service_equipment SET status='REMOVED',deleted_at=CURRENT_TIMESTAMP(6) WHERE id=?", existingId);
        }
    }

    private void syncComponents(long equipmentId, List<ComponentRequest> components) {
        Set<Long> retained = new HashSet<>();
        for (ComponentRequest component : components == null ? List.<ComponentRequest>of() : components) {
            if (component == null || component.empty()) continue;
            if (component.id() == null) {
                long id = insert("""
                    INSERT INTO service_equipment_components(equipment_id,name,component_type,part_number,serial_number,
                        installed_at,replaced_at,status,notes)
                    VALUES(?,?,?,?,?,?,?,?,?)
                    """, equipmentId, component.name().trim(), blank(component.componentType()), blank(component.partNumber()),
                    blank(component.serialNumber()), component.installedAt(), component.replacedAt(),
                    defaultValue(component.status(), "ACTIVE"), blank(component.notes()));
                retained.add(id);
                continue;
            }
            int changed = jdbc.update("""
                UPDATE service_equipment_components
                SET name=?,component_type=?,part_number=?,serial_number=?,installed_at=?,replaced_at=?,status=?,notes=?,deleted_at=NULL
                WHERE id=? AND equipment_id=?
                """, component.name().trim(), blank(component.componentType()), blank(component.partNumber()),
                blank(component.serialNumber()), component.installedAt(), component.replacedAt(),
                defaultValue(component.status(), "ACTIVE"), blank(component.notes()), component.id(), equipmentId);
            if (changed == 0) throw new IllegalArgumentException("장비 부품 정보를 찾을 수 없습니다.");
            retained.add(component.id());
        }
        for (Long existingId : jdbc.queryForList("SELECT id FROM service_equipment_components WHERE equipment_id=? AND deleted_at IS NULL", Long.class, equipmentId)) {
            if (!retained.contains(existingId)) jdbc.update("""
                UPDATE service_equipment_components SET status='REMOVED',deleted_at=CURRENT_TIMESTAMP(6),replaced_at=COALESCE(replaced_at,CURRENT_DATE)
                WHERE id=?
                """, existingId);
        }
    }

    private void requireAdmin(Authentication auth) {
        boolean admin = auth != null && auth.getAuthorities().stream().anyMatch(role -> "ROLE_ADMIN".equals(role.getAuthority()));
        if (!admin) throw new AccessDeniedException("관리자만 병원 정보를 변경할 수 있습니다.");
    }

    private String blank(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String defaultValue(String value, String fallback) { return value == null || value.isBlank() ? fallback : value.trim(); }

    public record HospitalRequest(String code, String mreyesSiteId, @NotBlank String name, String region, String address, String notes,
        Integer pmIntervalMonths, LocalDate pmOverride, LocalDate acrFullOverride, LocalDate acrDocOverride,
        List<ContactRequest> contacts, List<EquipmentRequest> systems) {}
    public record ContactRequest(Long id, String name, String phone) {
        boolean empty() {
            return (name == null || name.isBlank()) && (phone == null || phone.isBlank());
        }
    }
    public record EquipmentRequest(Long id, String model, String vendor, String serial, String tesla,
        String swVersion, LocalDate installDate, List<ComponentRequest> components) {
        boolean empty() {
            return (model == null || model.isBlank()) && (vendor == null || vendor.isBlank())
                && (serial == null || serial.isBlank());
        }
    }
    public record ComponentRequest(Long id, String name, String componentType, String partNumber, String serialNumber,
        LocalDate installedAt, LocalDate replacedAt, String status, String notes) {
        boolean empty() { return name == null || name.isBlank(); }
    }
    public record PrepRequest(@NotNull Long hospitalId, @NotBlank String text) {}
    public record DoneRequest(boolean done) {}
    public record ServiceScheduleRequest(@NotNull Long hospitalId, @NotNull LocalDate scheduledDate,
        @NotBlank String serviceType, String note) {}
}
