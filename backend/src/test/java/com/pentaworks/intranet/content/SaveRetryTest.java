package com.pentaworks.intranet.content;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class SaveRetryTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken("qa", "");
    @Test void repeatedCreateReturnsSameRecordWithoutWriting() {
        when(jdbc.queryForObject("SELECT id FROM users WHERE login_id=? FOR UPDATE", Long.class,"qa")).thenReturn(7L);
        when(jdbc.queryForList("SELECT id FROM repair_requests WHERE source_system='office_request' AND source_id=?", Long.class,"7:request-1")).thenReturn(List.of(42L));
        var body = new ObjectMapper().convertValue(Map.of("requestId","request-1"), PortalController.RepairRequest.class);
        assertEquals(42L, new PortalController(jdbc).createRepair(body,auth).get("id"));
        verify(jdbc, never()).update(any(PreparedStatementCreator.class), any(KeyHolder.class));
    }
    @Test void repeatedPreparationReturnsSameItem() {
        when(jdbc.queryForObject("SELECT id FROM users WHERE login_id=? FOR UPDATE", Long.class,"qa")).thenReturn(7L);
        when(jdbc.queryForList("SELECT id FROM service_prep_items WHERE source_system='office_request' AND source_id=?", Long.class,"7:request-1")).thenReturn(List.of(43L));
        assertEquals(43L,new ServiceController(jdbc).createPrep(new ServiceController.PrepRequest(1L,"부품", "request-1"),auth).get("id"));
        verify(jdbc, never()).update(any(PreparedStatementCreator.class), any(KeyHolder.class));
    }
    @Test void requestIdentityCannotContainSqlOrPaths() {
        assertThrows(IllegalArgumentException.class, () -> RequestDeduplication.key(jdbc,auth,"../invalid"));
        verifyNoInteractions(jdbc);
    }
    @Test void invalidScheduleRangeCannotInsert() {
        var start = java.time.LocalDateTime.of(2026,9,26,10,0);
        var body = new PortalController.ScheduleRequest(null,"PERSONAL","test",null,start,start.minusHours(1),false,"PRIVATE");
        assertThrows(IllegalArgumentException.class, () -> new PortalController(jdbc).createSchedule(body,auth));
        verify(jdbc, never()).update(any(PreparedStatementCreator.class), any(KeyHolder.class));
    }
    @Test void nonOwnerCannotEditSchedule() {
        var start = java.time.LocalDateTime.of(2026,9,26,10,0);
        var body = new PortalController.ScheduleRequest(null,"PERSONAL","test",null,start,start.plusHours(1),false,"PRIVATE");
        assertThrows(org.springframework.security.access.AccessDeniedException.class, () -> new PortalController(jdbc).updateSchedule(1,body,auth));
    }
}
