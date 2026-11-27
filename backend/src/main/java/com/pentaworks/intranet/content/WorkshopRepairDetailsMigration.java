package com.pentaworks.intranet.content;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class WorkshopRepairDetailsMigration implements ApplicationRunner {
    private final JdbcTemplate jdbc;

    public WorkshopRepairDetailsMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        var legacy = jdbc.query("""
            SELECT id, equipment_name, description_markdown
            FROM workshop_repairs WHERE description_text IS NULL
            """, (rs, rowNum) -> new LegacyRepair(rs.getLong("id"), rs.getString("equipment_name"), rs.getString("description_markdown")));
        for (var repair : legacy) {
            jdbc.update("""
                UPDATE workshop_repairs SET equipment_name=?, description_text=?, updated_at=updated_at
                WHERE id=? AND description_text IS NULL
                """, WorkshopRepairText.equipmentName(repair.name()), WorkshopRepairText.plain(repair.content()), repair.id());
        }
    }

    private record LegacyRepair(long id, String name, String content) {}
}
