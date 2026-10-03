package pl.tomaszwolak.dzienniczekhormonuwzrostu;

import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.TimeZone;

public final class ReminderTimingTest {
    private static long at(String time) throws Exception {
        return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).parse(time).getTime();
    }

    private static void check(String time, String now, String snapshot, boolean saved,
                              String delivered, boolean replacement, String from,
                              String expected, String doseDate) throws Exception {
        ReminderTiming.Trigger result = ReminderTiming.next(time, snapshot, saved, delivered,
                replacement, from, at(now));
        if (result.atMillis != at(expected) || !doseDate.equals(result.date)) {
            throw new AssertionError(now + " -> " + new java.util.Date(result.atMillis) + " / " + result.date);
        }
    }

    public static void main(String[] args) throws Exception {
        TimeZone.setDefault(TimeZone.getTimeZone("Europe/Warsaw"));
        check("21:00", "2026-09-23 10:00:00", "2026-09-23", false, "", false, "", "2026-09-23 21:00:00", "2026-09-23");
        check("21:00", "2026-09-23 22:00:00", "2026-09-23", false, "", false, "", "2026-09-23 22:00:05", "2026-09-23");
        check("21:00", "2026-09-23 10:00:00", "2026-09-23", true, "", false, "", "2026-09-24 21:00:00", "2026-09-24");
        check("21:00", "2026-09-23 10:00:00", "2026-09-22", false, "2026-09-23", false, "", "2026-09-24 21:00:00", "2026-09-24");
        check("21:00", "2026-09-23 10:00:00", "2026-09-23", false, "", true, "2026-09-23", "2026-09-23 20:30:00", "2026-09-23");
        check("21:00", "2026-09-23 21:05:00", "2026-09-23", true, "", true, "2026-09-24", "2026-09-24 20:30:00", "2026-09-24");
        check("21:00", "2026-09-23 20:40:00", "2026-09-23", false, "", true, "2026-09-23", "2026-09-23 20:40:05", "2026-09-23");
        check("21:00", "2026-09-23 22:00:00", "2026-09-23", false, "", true, "2026-09-23", "2026-09-24 20:30:00", "2026-09-24");
        check("21:00", "2026-09-23 20:31:00", "2026-09-23", false, "2026-09-23", true, "2026-09-23", "2026-09-24 20:30:00", "2026-09-24");
        check("00:15", "2026-09-23 12:00:00", "2026-09-23", true, "", true, "2026-09-24", "2026-09-23 23:45:00", "2026-09-24");
        check("00:15", "2026-09-23 23:46:00", "2026-09-23", true, "2026-09-24", true, "2026-09-24", "2026-09-24 23:45:00", "2026-09-25");
        check("00:15", "2026-09-24 00:05:00", "2026-09-23", true, "", true, "2026-09-24", "2026-09-24 00:05:05", "2026-09-24");
        check("00:15", "2026-12-31 12:00:00", "2026-12-31", true, "", true, "2027-01-01", "2026-12-31 23:45:00", "2027-01-01");
        check("08:00", "2026-03-28 21:00:00", "2026-03-28", true, "", true, "2026-03-29", "2026-03-29 07:30:00", "2026-03-29");
        check("08:00", "2026-10-24 21:00:00", "2026-10-24", true, "", true, "2026-10-25", "2026-10-25 07:30:00", "2026-10-25");
        System.out.println("Reminder timing: OK — 15 cases, midnight, year rollover, DST, late sync and duplicate delivery.");
    }
}
