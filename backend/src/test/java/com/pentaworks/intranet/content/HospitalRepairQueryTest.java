package com.pentaworks.intranet.content;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class HospitalRepairQueryTest {
    @Test
    void hospitalFilterIsBoundAndKeepsDeletedAndWorkshopRecordsExcluded() {
        var jdbc = mock(JdbcTemplate.class);
        var expected = List.<Map<String,Object>>of(Map.of("id", 7, "hospital_id", 20));
        when(jdbc.queryForList(anyString(), eq(20L))).thenReturn(expected);
        assertEquals(expected, new PortalController(jdbc).repairs(20L));
        verify(jdbc).queryForList(argThat(sql -> sql.contains("r.hospital_id=?") && sql.contains("r.deleted_at IS NULL") && sql.contains("NOT EXISTS(SELECT 1 FROM workshop_repairs")), eq(20L));
        verify(jdbc, never()).queryForList(anyString());
    }

    @Test
    void unfilteredReadsRemainAvailableAndInvalidIdsAreRejected() {
        var jdbc = mock(JdbcTemplate.class);
        var controller = new PortalController(jdbc);
        controller.repairs(null);
        verify(jdbc).queryForList(argThat(sql -> !sql.contains("r.hospital_id=?")));
        clearInvocations(jdbc);
        assertThrows(IllegalArgumentException.class, () -> controller.repairs(-1L));
        verify(jdbc, never()).queryForList(anyString(), any(Object[].class));
    }
}
