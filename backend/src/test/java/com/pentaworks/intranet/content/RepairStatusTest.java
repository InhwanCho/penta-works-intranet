package com.pentaworks.intranet.content;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RepairStatusTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final PortalController controller = new PortalController(jdbc);
    private final Authentication auth = new UsernamePasswordAuthenticationToken("writer", "");

    @BeforeEach
    void setup() {
        when(jdbc.queryForObject("SELECT COUNT(*) FROM service_hospitals WHERE id=? AND deleted_at IS NULL", Integer.class, 1L)).thenReturn(1);
        when(jdbc.queryForObject("SELECT id FROM users WHERE login_id=?", Long.class, "writer")).thenReturn(7L);
        when(jdbc.update(any(PreparedStatementCreator.class), any(KeyHolder.class))).thenAnswer(invocation -> {
            KeyHolder holder = invocation.getArgument(1);
            holder.getKeyList().add(Map.of("id", 42L));
            return 1;
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {"RECEIVED", "IN_PROGRESS", "REVISIT", "COMPLETED"})
    void creationStoresChosenStatusAndMatchingHistory(String status) {
        var body = new ObjectMapper().convertValue(Map.of("status", status, "hospitalId", 1), PortalController.RepairRequest.class);
        assertEquals(42L, controller.createRepair(body, auth).get("id"));
        if (status.equals("COMPLETED")) {
            verify(jdbc).update(eq("UPDATE repair_requests SET status=?,completed_at=? WHERE id=?"), eq(status), any(LocalDateTime.class), eq(42L));
        } else {
            verify(jdbc).update("UPDATE repair_requests SET status=?,completed_at=? WHERE id=?", status, null, 42L);
        }
        verify(jdbc).update("INSERT INTO repair_status_history(repair_id,new_status,changed_by) VALUES(?,?,?)", 42L, status, 7L);
    }

    @Test
    void legacyRequestsDefaultToReceived() {
        var body = new ObjectMapper().convertValue(Map.of("hospitalId", 1), PortalController.RepairRequest.class);
        controller.createRepair(body, auth);
        verify(jdbc).update("UPDATE repair_requests SET status=?,completed_at=? WHERE id=?", "RECEIVED", null, 42L);
    }

    @Test
    void invalidStatusCannotCreateRecord() {
        var body = new ObjectMapper().convertValue(Map.of("status", "INVALID", "hospitalId", 1), PortalController.RepairRequest.class);
        assertThrows(IllegalArgumentException.class, () -> controller.createRepair(body, auth));
        verify(jdbc, never()).update(any(PreparedStatementCreator.class), any(KeyHolder.class));
    }

    @Test
    void serviceWithoutHospitalCannotBeCreated() {
        var body = new ObjectMapper().convertValue(Map.of("status", "RECEIVED"), PortalController.RepairRequest.class);
        assertThrows(IllegalArgumentException.class, () -> controller.createRepair(body, auth));
        verify(jdbc, never()).update(any(PreparedStatementCreator.class), any(KeyHolder.class));
    }

    @Test
    void nonOwnerCannotChangeStatus() {
        assertThrows(AccessDeniedException.class, () -> controller.updateRepairStatus(
            new PortalController.RepairStatusRequest(42L, "COMPLETED", null), auth));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
}
