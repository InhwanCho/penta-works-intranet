package com.pentaworks.intranet.integration;

import java.sql.Date;
import java.sql.Time;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/integrations/mreyes")
public class MreyesReadController {
    private final JdbcTemplate jdbc;

    public MreyesReadController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/sites/{siteId}")
    public SiteAssets siteAssets(@PathVariable String siteId) {
        String normalizedSiteId = normalizeSiteId(siteId);
        Site site = jdbc.queryForObject("""
            SELECT id,mreyes_site_id,name,region,address,notes
            FROM service_hospitals
            WHERE mreyes_site_id=? AND deleted_at IS NULL
            """, (rs, row) -> new Site(
                rs.getLong("id"), rs.getString("mreyes_site_id"), rs.getString("name"),
                rs.getString("region"), rs.getString("address"), rs.getString("notes")), normalizedSiteId);

        List<Equipment> equipment = jdbc.query("""
            SELECT id,equipment_type,manufacturer,model,serial_number,magnetic_field_tesla,
                   software_version,installed_at,status
            FROM service_equipment
            WHERE hospital_id=? AND deleted_at IS NULL
            ORDER BY status='ACTIVE' DESC,installed_at DESC,id
            """, (rs, row) -> new Equipment(
                rs.getLong("id"), rs.getString("equipment_type"), rs.getString("manufacturer"),
                rs.getString("model"), rs.getString("serial_number"), rs.getString("magnetic_field_tesla"),
                rs.getString("software_version"), date(rs.getDate("installed_at")), rs.getString("status")), site.id());

        List<Component> components = jdbc.query("""
            SELECT c.id,c.equipment_id,c.name,c.component_type,c.part_number,c.serial_number,
                   c.installed_at,c.replaced_at,c.status,c.notes
            FROM service_equipment_components c
            JOIN service_equipment e ON e.id=c.equipment_id
            WHERE e.hospital_id=? AND e.deleted_at IS NULL AND c.deleted_at IS NULL
            ORDER BY c.status='ACTIVE' DESC,c.installed_at DESC,c.id
            """, (rs, row) -> new Component(
                rs.getLong("id"), rs.getLong("equipment_id"), rs.getString("name"),
                rs.getString("component_type"), rs.getString("part_number"), rs.getString("serial_number"),
                date(rs.getDate("installed_at")), date(rs.getDate("replaced_at")), rs.getString("status"),
                rs.getString("notes")), site.id());

        List<Maintenance> maintenanceHistory = jdbc.query("""
            SELECT r.id,r.equipment_name,r.model_name,r.service_type,r.service_title,r.engineer_name,
                   r.symptom,r.description_markdown,r.contract_type,r.work_date,r.work_start_time,
                   r.work_end_time,r.special_notes,r.parts_details,r.remarks,r.follow_up,r.status,
                   r.completed_at,r.updated_at,
                   (SELECT COUNT(*) FROM service_photos p WHERE p.repair_id=r.id) photo_count
            FROM repair_requests r
            WHERE r.hospital_id=? AND r.deleted_at IS NULL AND r.source_deleted_at IS NULL
            ORDER BY COALESCE(r.work_date,r.written_at) DESC,r.id DESC
            """, (rs, row) -> new Maintenance(
                rs.getLong("id"), rs.getString("equipment_name"), rs.getString("model_name"),
                rs.getString("service_type"), rs.getString("service_title"), rs.getString("engineer_name"),
                rs.getString("symptom"), rs.getString("description_markdown"), rs.getString("contract_type"),
                date(rs.getDate("work_date")), time(rs.getTime("work_start_time")), time(rs.getTime("work_end_time")),
                rs.getString("special_notes"), rs.getString("parts_details"), rs.getString("remarks"),
                rs.getString("follow_up"), rs.getString("status"), instant(rs.getTimestamp("completed_at")),
                instant(rs.getTimestamp("updated_at")), rs.getInt("photo_count")), site.id());

        return new SiteAssets(site, equipment, components, maintenanceHistory, Instant.now().toString());
    }

    private String normalizeSiteId(String siteId) {
        String value = siteId == null ? "" : siteId.trim();
        if (value.isEmpty() || value.length() > 32) throw new IllegalArgumentException("사이트 ID가 올바르지 않습니다.");
        if (value.matches("\\d{1,3}")) return String.format("%03d", Integer.parseInt(value));
        return value;
    }

    private static String date(Date value) { return value == null ? null : value.toLocalDate().toString(); }
    private static String time(Time value) { return value == null ? null : value.toLocalTime().toString(); }
    private static String instant(Timestamp value) { return value == null ? null : value.toInstant().toString(); }

    public record Site(long id, String mreyesSiteId, String name, String region, String address, String notes) {}
    public record Equipment(long id, String equipmentType, String manufacturer, String model, String serialNumber,
        String magneticFieldTesla, String softwareVersion, String installedAt, String status) {}
    public record Component(long id, long equipmentId, String name, String componentType, String partNumber,
        String serialNumber, String installedAt, String replacedAt, String status, String notes) {}
    public record Maintenance(long id, String equipmentName, String modelName, String serviceType, String serviceTitle,
        String engineerName, String symptom, String description, String contractType, String workDate,
        String workStartTime, String workEndTime, String specialNotes, String partsDetails, String remarks,
        String followUp, String status, String completedAt, String updatedAt, int photoCount) {}
    public record SiteAssets(Site site, List<Equipment> equipment, List<Component> components,
        List<Maintenance> maintenanceHistory, String generatedAt) {}
}
