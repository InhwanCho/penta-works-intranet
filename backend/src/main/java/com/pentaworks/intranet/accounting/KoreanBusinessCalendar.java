package com.pentaworks.intranet.accounting;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.Map;
import java.util.Set;

final class KoreanBusinessCalendar {
    // KASA annual calendar notices, plus the 2026 nationwide local election,
    // Labor Day and Constitution Day. 2028–2030 use published lunar dates and
    // current public/substitute holiday and regular election rules; temporary holidays need updates.
    private static final Map<Integer, Set<String>> HOLIDAYS = Map.of(
        2026, Set.of("01-01", "02-16", "02-17", "02-18", "03-01", "03-02",
            "05-01", "05-05", "05-24", "05-25", "06-03", "06-06", "07-17",
            "08-15", "08-17", "09-24", "09-25", "09-26", "10-03", "10-05", "10-09", "12-25"),
        2027, Set.of("01-01", "02-06", "02-07", "02-08", "02-09", "03-01",
            "05-01", "05-03", "05-05", "05-13", "06-06", "07-17", "07-19",
            "08-15", "08-16", "09-14", "09-15", "09-16", "10-03", "10-04",
            "10-09", "10-11", "12-25", "12-27"),
        2028, Set.of("01-01", "01-26", "01-27", "01-28", "03-01", "04-12",
            "05-01", "05-02", "05-05", "06-06", "07-17", "08-15",
            "10-02", "10-03", "10-04", "10-05", "10-09", "12-25"),
        2029, Set.of("01-01", "02-12", "02-13", "02-14", "03-01",
            "05-01", "05-05", "05-07", "05-20", "05-21", "06-06", "07-17", "08-15",
            "09-21", "09-22", "09-23", "09-24", "10-03", "10-09", "12-25"),
        2030, Set.of("01-01", "02-02", "02-03", "02-04", "02-05", "03-01", "03-27",
            "05-01", "05-05", "05-06", "05-09", "06-06", "06-12", "07-17", "08-15",
            "09-11", "09-12", "09-13", "10-03", "10-09", "12-25")
    );

    private KoreanBusinessCalendar() {}

    static LocalDate onOrBefore(LocalDate nominal) {
        LocalDate date = nominal;
        while (true) {
            var holidays = HOLIDAYS.get(date.getYear());
            if (holidays == null) {
                throw new IllegalArgumentException(date.getYear() + "년 공휴일 자료가 없습니다. 기간을 줄이거나 예정일을 직접 지정해주세요.");
            }
            var day = date.getDayOfWeek();
            if (day != DayOfWeek.SATURDAY && day != DayOfWeek.SUNDAY &&
                !holidays.contains(date.toString().substring(5))) return date;
            date = date.minusDays(1);
        }
    }
}
