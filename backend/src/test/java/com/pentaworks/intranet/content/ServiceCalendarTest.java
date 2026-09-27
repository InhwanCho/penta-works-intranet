package com.pentaworks.intranet.content;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ServiceCalendarTest {
    @Test
    void aggregatedDatesPreserveIntervalsOverridesAndFullYearRule() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString())).thenReturn(List.of(
            Map.of("id", 1L, "name", "테스트 병원", "pm_interval_months", 2,
                "last_pm", LocalDate.of(2026, 7, 31), "last_acr", LocalDate.of(2025, 10, 1),
                "last_full", LocalDate.of(2023, 10, 1)),
            Map.of("id", 2L, "name", "예정일 지정", "pm_interval_months", 2,
                "last_pm", LocalDate.of(2026, 7, 1), "pm_override", LocalDate.of(2026, 10, 15)),
            Map.of("id", 3L, "name", "기록 없음", "pm_interval_months", 2)
        ));
        var result = new ServiceWorkflowController(jdbc).calendar(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 11, 1));
        assertEquals(3, result.due().size());
        assertEquals(List.of(LocalDate.of(2026, 9, 30), LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 15)),
            result.due().stream().map(ServiceWorkflowController.CalendarItem::date).toList());
        assertEquals("ACR_FULL", result.due().get(1).kind());
        verify(jdbc).queryForList(contains("GROUP BY hospital_id"));
        verify(jdbc, never()).queryForList(contains("SELECT hospital_id,service_type"));
    }

    @Test
    void invalidRangeNeverQueriesDatabase() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var controller = new ServiceWorkflowController(jdbc);
        assertThrows(IllegalArgumentException.class, () -> controller.calendar(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 8, 1)));
        verifyNoInteractions(jdbc);
    }
}
