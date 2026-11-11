package com.pentaworks.intranet.accounting;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class KoreanBusinessCalendarTest {
    @Test void skipsConsecutiveHolidaysAndWeekends() {
        assertEquals(LocalDate.parse("2026-09-23"), KoreanBusinessCalendar.onOrBefore(LocalDate.parse("2026-09-25")));
        assertEquals(LocalDate.parse("2026-12-24"), KoreanBusinessCalendar.onOrBefore(LocalDate.parse("2026-12-27")));
        assertEquals(LocalDate.parse("2027-02-05"), KoreanBusinessCalendar.onOrBefore(LocalDate.parse("2027-02-09")));
        assertEquals(LocalDate.parse("2026-12-31"), KoreanBusinessCalendar.onOrBefore(LocalDate.parse("2027-01-01")));
        assertThrows(IllegalArgumentException.class, () -> KoreanBusinessCalendar.onOrBefore(LocalDate.parse("2028-01-25")));
    }

    @Test void adjustsEachMonthFromOriginalDayAndSupportsMonthEnd() {
        var start = LocalDate.parse("2026-12-25");
        assertEquals(LocalDate.parse("2026-12-24"), CashPlanService.adjustDate(CashPlanService.occurrence(start, 0, false), true));
        assertEquals(LocalDate.parse("2027-01-25"), CashPlanService.adjustDate(CashPlanService.occurrence(start, 1, false), true));
        assertEquals(LocalDate.parse("2027-02-26"), CashPlanService.adjustDate(CashPlanService.occurrence(start, 2, true), true));
        assertEquals(start, CashPlanService.adjustDate(start, false));
    }
}
