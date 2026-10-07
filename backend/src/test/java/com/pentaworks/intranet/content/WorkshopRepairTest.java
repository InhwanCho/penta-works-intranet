package com.pentaworks.intranet.content;

import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.access.AccessDeniedException;
import static org.junit.jupiter.api.Assertions.*;

class WorkshopRepairTest {
    private UsernamePasswordAuthenticationToken auth(String name) { return new UsernamePasswordAuthenticationToken(name,""); }
    @Test
    void tracksSeparateFailedYAxisAndZAxisUnitsAndEnforcesOwner() {
        var jdbc=WorkLogTest.database();var controller=new WorkshopRepairController(jdbc);
        var draft=new WorkshopRepairController.Draft("Gradient Power Supply","두 대 테스트 실패",LocalDate.of(2026,9,29),"TEST_FAILED",List.of(new WorkshopRepairController.Unit(null,"TEST_FAILED","Y","Over Voltage Y축 (OVY)"),new WorkshopRepairController.Unit(null,"TEST_FAILED","Z","Over Voltage Z축 (OVZ)")),List.of());
        long id=((Number)controller.create(draft,auth("writer")).get("id")).longValue();
        var units=jdbc.queryForList("SELECT status,fault_axis FROM workshop_repair_units WHERE repair_id=? ORDER BY unit_no",id);
        assertEquals(2,units.size());assertEquals("Y",units.get(0).get("fault_axis"));assertEquals("Z",units.get(1).get("fault_axis"));
        assertEquals(2,((Number)controller.detail(id).get("quantity")).intValue());
        jdbc.update("INSERT INTO workshop_repair_photos(id,repair_id,original_name,image_data,mime_type) VALUES(?,?,?,?,?)",1,id,"시험 사진",new byte[]{1,2,3},"image/jpeg");
        assertArrayEquals(new byte[]{1,2,3},controller.photo(1).getBody());
        assertEquals(1,((List<?>)controller.detail(id).get("workshop_photos")).size());
        assertThrows(AccessDeniedException.class,()->controller.update(id,draft,auth("other")));
        assertThrows(IllegalArgumentException.class,()->controller.update(id,new WorkshopRepairController.Draft("Gradient Power Supply","오류",draft.workDate(),"COMPLETED",draft.units(),List.of()),auth("writer")));
        controller.delete(id,auth("writer"));assertTrue(controller.list().isEmpty());
    }
    @Test
    void recoversOwnDeletedOfficeRecordOnceAndPreservesPhotos() {
        var jdbc=WorkLogTest.database();var controller=new WorkshopRepairController(jdbc);
        jdbc.execute("UPDATE repair_requests SET requester_id=1,deleted_at=CURRENT_TIMESTAMP WHERE id=10");
        jdbc.execute("INSERT INTO service_photos(id,repair_id,original_name) VALUES(1,10,'원본 사진')");
        assertEquals(3,controller.candidates(auth("admin")).size());
        var target=controller.move(10,auth("admin"));long id=((Number)target.get("id")).longValue();
        assertEquals(id,((Number)controller.move(10,auth("admin")).get("id")).longValue());
        assertEquals(1,((List<?>)controller.detail(id).get("photos")).size());
        assertNotNull(jdbc.queryForObject("SELECT deleted_at FROM repair_requests WHERE id=10",java.sql.Timestamp.class));
        assertEquals(id,((Number)new PortalController(jdbc).repair(10).get("moved_workshop_id")).longValue());
        assertThrows(AccessDeniedException.class,()->new PortalController(jdbc).purgeRepair(10,auth("admin")));
        assertThrows(IllegalArgumentException.class,()->new WorkLogController(jdbc).move(10,new WorkLogController.Move("OTHER"),auth("admin")));
    }
    @Test
    void hospitalConnectedPartsCannotBeMovedToOffice() {
        var jdbc=WorkLogTest.database();var controller=new WorkshopRepairController(jdbc);
        jdbc.execute("INSERT INTO service_repair_components VALUES(11)");
        assertThrows(IllegalArgumentException.class,()->controller.move(11,auth("admin")));
        assertTrue(controller.list().isEmpty());
    }
}
