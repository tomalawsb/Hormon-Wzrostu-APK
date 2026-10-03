package pl.tomaszwolak.dzienniczekhormonuwzrostu;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/** Calendar arithmetic shared by the Android scheduler and JVM regression tests. */
final class ReminderTiming {
    static final long LATE_DELAY_MS = 5_000L;

    static Trigger next(String time, String snapshotDate, boolean hasEntry, String lastKnown,
                        boolean replacement, String fromDate, long nowMillis) {
        Calendar dose = Calendar.getInstance();
        dose.setTimeInMillis(nowMillis);
        String today = date(dose.getTime());
        String[] parts = time.split(":", 2);
        dose.set(Calendar.HOUR_OF_DAY, Integer.parseInt(parts[0]));
        dose.set(Calendar.MINUTE, Integer.parseInt(parts[1]));
        dose.set(Calendar.SECOND, 0);
        dose.set(Calendar.MILLISECOND, 0);
        if (replacement && fromDate.compareTo(today) > 0) {
            String[] fields = fromDate.split("-", 3);
            dose.set(Integer.parseInt(fields[0]), Integer.parseInt(fields[1]) - 1,
                    Integer.parseInt(fields[2]));
        }
        String doseDate = date(dose.getTime());
        if ((doseDate.equals(snapshotDate) && hasEntry) || lastKnown.compareTo(doseDate) >= 0) {
            // Delivered dates are validated by the scheduler. Skip already handled days.
            if (lastKnown.compareTo(doseDate) > 0) {
                String[] fields = lastKnown.split("-", 3);
                dose.set(Integer.parseInt(fields[0]), Integer.parseInt(fields[1]) - 1,
                        Integer.parseInt(fields[2]));
            }
            dose.add(Calendar.DAY_OF_YEAR, 1);
        }
        if (!replacement) {
            return new Trigger(dose.getTimeInMillis() <= nowMillis ? nowMillis + LATE_DELAY_MS : dose.getTimeInMillis(),
                    date(dose.getTime()));
        }
        // A replacement warning belongs to the injection date, even before midnight.
        if (dose.getTimeInMillis() <= nowMillis + LATE_DELAY_MS) dose.add(Calendar.DAY_OF_YEAR, 1);
        Calendar warning = (Calendar) dose.clone();
        warning.add(Calendar.MINUTE, -30);
        return new Trigger(warning.getTimeInMillis() <= nowMillis ? nowMillis + LATE_DELAY_MS : warning.getTimeInMillis(),
                date(dose.getTime()));
    }

    static String date(Date value) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(value);
    }

    static final class Trigger {
        final long atMillis;
        final String date;
        Trigger(long atMillis, String date) {
            this.atMillis = atMillis;
            this.date = date;
        }
    }
}
