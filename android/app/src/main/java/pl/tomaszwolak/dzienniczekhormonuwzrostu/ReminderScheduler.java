package pl.tomaszwolak.dzienniczekhormonuwzrostu;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.regex.Pattern;

final class ReminderScheduler {
    static final String CHANNEL_ID = "growth-diary-reminders";
    static final String ACTION_REMINDER =
            "pl.tomaszwolak.dzienniczekhormonuwzrostu.ACTION_REMINDER";
    static final String EXTRA_PROFILE_ID = "reminder_profile_id";
    static final String EXTRA_DATE = "reminder_date";

    private static final int STATE_VERSION = 1;
    private static final int MAX_PROFILES = 50;
    private static final int MAX_PROFILE_ID_CHARS = 100;
    private static final int MAX_PROFILE_NAME_CHARS = 80;
    private static final int MAX_BODY_CHARS = 1400;
    private static final long LATE_REMINDER_DELAY_MS = 5_000L;
    private static final Pattern PROFILE_ID = Pattern.compile("^[A-Za-z0-9_-]{1,100}$");
    private static final Pattern TIME = Pattern.compile("^(?:[01]\\d|2[0-3]):[0-5]\\d$");
    private static final Pattern ISO_DATE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");

    private ReminderScheduler() {}

    static synchronized int replaceSchedules(Context context, String profilesJson) {
        if (context == null || profilesJson == null || profilesJson.length() > 1024 * 1024) return 0;
        try {
            JSONArray incoming = new JSONArray(profilesJson);
            if (incoming.length() > MAX_PROFILES) return 0;
            JSONArray previous = readProfiles(context);
            Map<String, JSONObject> previousById = profilesById(previous);
            cancelProfiles(context, previous);

            JSONArray profiles = new JSONArray();
            for (int index = 0; index < incoming.length(); index += 1) {
                JSONObject profile = sanitizeProfile(incoming.optJSONObject(index), false);
                if (profile == null) continue;
                JSONObject oldProfile = previousById.get(profile.optString("profileId"));
                if (oldProfile != null) {
                    profile.put("lastDeliveredDate", oldProfile.optString("lastDeliveredDate"));
                    profile.put("lastAttemptDate", oldProfile.optString("lastAttemptDate"));
                }
                profiles.put(profile);
            }
            return scheduleAndPersist(context, profiles);
        } catch (Exception error) {
            return 0;
        }
    }

    static synchronized void restoreAll(Context context) {
        if (context == null) return;
        try {
            JSONArray profiles = readProfiles(context);
            cancelProfiles(context, profiles);
            scheduleAndPersist(context, profiles);
        } catch (Exception ignored) {
        }
    }

    static synchronized void handleAlarm(Context context, String profileId, String scheduledDate) {
        if (context == null || !validProfileId(profileId) || !validDate(scheduledDate)) return;
        try {
            JSONArray profiles = readProfiles(context);
            JSONObject profile = findProfile(profiles, profileId);
            if (profile == null || !profile.optBoolean("enabled")) return;
            String expectedDate = profile.optString("nextDate");
            if (!expectedDate.isEmpty() && !expectedDate.equals(scheduledDate)) return;

            String today = localDate(new Date());
            boolean entryAlreadySaved = today.equals(profile.optString("today"))
                    && profile.optBoolean("todayHasEntry");
            String lastKnown = maxDate(
                    profile.optString("lastReminderDate"),
                    profile.optString("lastDeliveredDate"),
                    profile.optString("lastAttemptDate")
            );
            boolean shouldNotify = scheduledDate.compareTo(today) <= 0
                    && !entryAlreadySaved
                    && lastKnown.compareTo(today) < 0;
            if (shouldNotify) {
                profile.put("lastAttemptDate", today);
                if (showNotification(context, profile, today, false)) {
                    profile.put("lastDeliveredDate", today);
                }
            }
            scheduleAndPersist(context, profiles);
        } catch (Exception ignored) {
        }
    }

    static synchronized JSONObject diagnostics(Context context) {
        JSONObject result = new JSONObject();
        try {
            JSONArray profiles = readProfiles(context);
            int configured = 0;
            int scheduled = 0;
            long nextAt = 0L;
            String mode = "none";
            for (int index = 0; index < profiles.length(); index += 1) {
                JSONObject profile = profiles.optJSONObject(index);
                if (profile == null || !profile.optBoolean("enabled")) continue;
                configured += 1;
                long candidate = profile.optLong("nextAt", 0L);
                if (candidate <= 0L) continue;
                scheduled += 1;
                if (nextAt == 0L || candidate < nextAt) nextAt = candidate;
                String candidateMode = profile.optString("scheduleMode", "none");
                if ("inexact".equals(candidateMode)) mode = "inexact";
                else if ("none".equals(mode) && "exact".equals(candidateMode)) mode = "exact";
            }
            result.put("storageReady", true);
            result.put("configuredProfiles", configured);
            result.put("scheduledProfiles", scheduled);
            result.put("nextTriggerAt", nextAt);
            result.put("scheduleMode", mode);
        } catch (Exception error) {
            putQuietly(result, "storageReady", false);
            putQuietly(result, "configuredProfiles", 0);
            putQuietly(result, "scheduledProfiles", 0);
            putQuietly(result, "nextTriggerAt", 0L);
            putQuietly(result, "scheduleMode", "none");
        }
        putQuietly(result, "exactAlarmPermission", canScheduleExact(context) ? "granted" : "denied");
        return result;
    }

    static boolean showImmediateNotification(
            Context context,
            String title,
            String body,
            String profileId,
            boolean test
    ) {
        if (context == null || !notificationsEnabled(context)) return false;
        try {
            JSONObject profile = new JSONObject();
            profile.put("profileId", validProfileId(profileId) ? profileId : "test");
            profile.put("profileName", bounded(title, MAX_PROFILE_NAME_CHARS, "Dzienniczek Hormonu"));
            profile.put("body", bounded(body, MAX_BODY_CHARS, "Otwórz aplikację."));
            profile.put("customTitle", bounded(title, 160, "Dzienniczek Hormonu"));
            return showNotification(context, profile, localDate(new Date()), test);
        } catch (Exception error) {
            return false;
        }
    }

    static boolean notificationsEnabled(Context context) {
        if (context == null) return false;
        if (Build.VERSION.SDK_INT >= 33
                && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) return false;
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || !manager.areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = manager.getNotificationChannel(CHANNEL_ID);
            return channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
        }
        return true;
    }

    static boolean channelEnabled(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel channel = manager == null ? null : manager.getNotificationChannel(CHANNEL_ID);
        return channel != null && channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
    }

    static boolean canScheduleExact(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        try {
            return manager != null && manager.canScheduleExactAlarms();
        } catch (Exception error) {
            return false;
        }
    }

    static void ensureNotificationChannel(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Przypomnienia o zastrzykach",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Codzienne przypomnienia Dzienniczka Hormonu");
        channel.enableVibration(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(channel);
    }

    private static int scheduleAndPersist(Context context, JSONArray profiles) throws Exception {
        boolean notificationAccess = notificationsEnabled(context);
        long now = System.currentTimeMillis();
        for (int index = 0; index < profiles.length(); index += 1) {
            JSONObject profile = profiles.optJSONObject(index);
            if (profile == null) continue;
            profile.remove("nextAt");
            profile.remove("nextDate");
            profile.put("scheduleMode", "none");
            if (!notificationAccess || !profile.optBoolean("enabled")) continue;
            Trigger trigger = nextTrigger(profile, now);
            profile.put("nextAt", trigger.atMillis);
            profile.put("nextDate", trigger.date);
            profile.put("scheduleMode", canScheduleExact(context) ? "exact" : "inexact");
        }
        writeProfiles(context, profiles);

        int scheduled = 0;
        boolean stateChanged = false;
        for (int index = 0; index < profiles.length(); index += 1) {
            JSONObject profile = profiles.optJSONObject(index);
            if (profile == null || profile.optLong("nextAt", 0L) <= 0L) continue;
            Trigger trigger = new Trigger(
                    profile.optLong("nextAt"),
                    profile.optString("nextDate")
            );
            String mode = scheduleAlarm(context, profile.optString("profileId"), trigger);
            if ("none".equals(mode)) {
                profile.remove("nextAt");
                profile.remove("nextDate");
                profile.put("scheduleMode", "none");
                stateChanged = true;
                continue;
            }
            if (!mode.equals(profile.optString("scheduleMode"))) {
                profile.put("scheduleMode", mode);
                stateChanged = true;
            }
            scheduled += 1;
        }
        if (stateChanged) writeProfiles(context, profiles);
        return scheduled;
    }

    private static Trigger nextTrigger(JSONObject profile, long nowMillis) {
        Calendar now = Calendar.getInstance();
        now.setTimeInMillis(nowMillis);
        String today = localDate(now.getTime());
        String[] time = profile.optString("time", "21:00").split(":", 2);
        int hour = Integer.parseInt(time[0]);
        int minute = Integer.parseInt(time[1]);
        Calendar target = Calendar.getInstance();
        target.setTimeInMillis(nowMillis);
        target.set(Calendar.HOUR_OF_DAY, hour);
        target.set(Calendar.MINUTE, minute);
        target.set(Calendar.SECOND, 0);
        target.set(Calendar.MILLISECOND, 0);
        boolean todayHasEntry = today.equals(profile.optString("today"))
                && profile.optBoolean("todayHasEntry");
        String lastKnown = maxDate(
                profile.optString("lastReminderDate"),
                profile.optString("lastDeliveredDate"),
                profile.optString("lastAttemptDate")
        );
        if (todayHasEntry || lastKnown.compareTo(today) >= 0) {
            target.add(Calendar.DAY_OF_YEAR, 1);
            return new Trigger(target.getTimeInMillis(), localDate(target.getTime()));
        }
        if (target.getTimeInMillis() <= nowMillis) {
            return new Trigger(nowMillis + LATE_REMINDER_DELAY_MS, today);
        }
        return new Trigger(target.getTimeInMillis(), today);
    }

    private static String scheduleAlarm(Context context, String profileId, Trigger trigger) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return "none";
        PendingIntent operation = alarmPendingIntent(
                context,
                profileId,
                trigger.date,
                PendingIntent.FLAG_UPDATE_CURRENT
        );
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (canScheduleExact(context)) {
                    manager.setExactAndAllowWhileIdle(
                            AlarmManager.RTC_WAKEUP,
                            trigger.atMillis,
                            operation
                    );
                    return "exact";
                }
                manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger.atMillis, operation);
                return "inexact";
            }
            manager.setExact(AlarmManager.RTC_WAKEUP, trigger.atMillis, operation);
            return "exact";
        } catch (SecurityException error) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger.atMillis, operation);
                } else {
                    manager.set(AlarmManager.RTC_WAKEUP, trigger.atMillis, operation);
                }
                return "inexact";
            } catch (Exception ignored) {
                return "none";
            }
        } catch (Exception error) {
            return "none";
        }
    }

    private static void cancelProfiles(Context context, JSONArray profiles) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        for (int index = 0; index < profiles.length(); index += 1) {
            JSONObject profile = profiles.optJSONObject(index);
            String profileId = profile == null ? "" : profile.optString("profileId");
            if (!validProfileId(profileId)) continue;
            PendingIntent operation = alarmPendingIntent(
                    context,
                    profileId,
                    "",
                    PendingIntent.FLAG_NO_CREATE
            );
            if (operation != null) {
                manager.cancel(operation);
                operation.cancel();
            }
        }
    }

    private static PendingIntent alarmPendingIntent(
            Context context,
            String profileId,
            String date,
            int behaviorFlag
    ) {
        Intent intent = new Intent(context, ReminderAlarmReceiver.class);
        intent.setAction(ACTION_REMINDER);
        intent.putExtra(EXTRA_PROFILE_ID, profileId);
        if (!date.isEmpty()) intent.putExtra(EXTRA_DATE, date);
        int flags = behaviorFlag;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, stableId(profileId), intent, flags);
    }

    private static boolean showNotification(
            Context context,
            JSONObject profile,
            String date,
            boolean test
    ) {
        if (!notificationsEnabled(context)) return false;
        ensureNotificationChannel(context);
        String profileId = profile.optString("profileId", "test");
        String profileName = profile.optString("profileName", "Profil");
        String title = profile.optString(
                "customTitle",
                test ? "Test przypomnienia — " + profileName : "Czas na zastrzyk — " + profileName
        );
        String body = profile.optString("body", "Otwórz aplikację i zapisz podanie.");
        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setAction(MainActivity.ACTION_OPEN_REMINDER);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        openIntent.putExtra(EXTRA_PROFILE_ID, profileId);
        openIntent.putExtra(EXTRA_DATE, date);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(
                context,
                stableId("open:" + profileId),
                openIntent,
                pendingFlags
        );
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, CHANNEL_ID)
                : new Notification.Builder(context);
        builder.setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .setContentIntent(contentIntent);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setPriority(Notification.PRIORITY_HIGH);
        }
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return false;
        manager.notify(test ? stableId("test:" + profileId) : stableId("daily:" + profileId), builder.build());
        return true;
    }

    private static JSONArray readProfiles(Context context) {
        try {
            SecureDataStore store = new SecureDataStore(context.getApplicationContext());
            String raw = store.readValue(SecureDataStore.REMINDER_SCHEDULE_SLOT);
            if (raw.isEmpty()) return new JSONArray();
            JSONObject state = new JSONObject(raw);
            if (state.optInt("version", 0) != STATE_VERSION) return new JSONArray();
            JSONArray source = state.optJSONArray("profiles");
            JSONArray profiles = new JSONArray();
            if (source == null) return profiles;
            for (int index = 0; index < source.length() && index < MAX_PROFILES; index += 1) {
                JSONObject profile = sanitizeProfile(source.optJSONObject(index), true);
                if (profile != null) profiles.put(profile);
            }
            return profiles;
        } catch (Exception error) {
            return new JSONArray();
        }
    }

    private static void writeProfiles(Context context, JSONArray profiles) throws Exception {
        JSONObject state = new JSONObject();
        state.put("version", STATE_VERSION);
        state.put("updatedAt", System.currentTimeMillis());
        state.put("profiles", profiles);
        SecureDataStore store = new SecureDataStore(context.getApplicationContext());
        boolean saved = profiles.length() == 0
                ? store.remove(SecureDataStore.REMINDER_SCHEDULE_SLOT)
                : store.write(SecureDataStore.REMINDER_SCHEDULE_SLOT, state.toString());
        if (!saved) throw new IllegalStateException("Reminder state was not saved");
    }

    private static JSONObject sanitizeProfile(JSONObject source, boolean stored) {
        if (source == null) return null;
        try {
            String id = source.optString("profileId", "").trim();
            String time = source.optString("time", "").trim();
            if (!validProfileId(id) || !TIME.matcher(time).matches()) return null;
            JSONObject profile = new JSONObject();
            profile.put("profileId", id);
            profile.put(
                    "profileName",
                    bounded(source.optString("profileName"), MAX_PROFILE_NAME_CHARS, "Profil")
            );
            profile.put("enabled", source.optBoolean("enabled", false));
            profile.put("time", time);
            profile.put("body", bounded(source.optString("body"), MAX_BODY_CHARS, "Otwórz aplikację."));
            profile.put("today", validDate(source.optString("today")) ? source.optString("today") : "");
            profile.put("todayHasEntry", source.optBoolean("todayHasEntry", false));
            profile.put(
                    "lastReminderDate",
                    validDate(source.optString("lastReminderDate"))
                            ? source.optString("lastReminderDate")
                            : ""
            );
            if (stored) {
                copyDate(source, profile, "lastDeliveredDate");
                copyDate(source, profile, "lastAttemptDate");
                long nextAt = source.optLong("nextAt", 0L);
                if (nextAt > 0L) profile.put("nextAt", nextAt);
                copyDate(source, profile, "nextDate");
                String mode = source.optString("scheduleMode");
                profile.put(
                        "scheduleMode",
                        "exact".equals(mode) || "inexact".equals(mode) ? mode : "none"
                );
            }
            return profile;
        } catch (Exception error) {
            return null;
        }
    }

    private static void copyDate(JSONObject source, JSONObject target, String key) throws Exception {
        String value = source.optString(key);
        target.put(key, validDate(value) ? value : "");
    }

    private static Map<String, JSONObject> profilesById(JSONArray profiles) {
        Map<String, JSONObject> result = new HashMap<>();
        for (int index = 0; index < profiles.length(); index += 1) {
            JSONObject profile = profiles.optJSONObject(index);
            if (profile != null) result.put(profile.optString("profileId"), profile);
        }
        return result;
    }

    private static JSONObject findProfile(JSONArray profiles, String profileId) {
        for (int index = 0; index < profiles.length(); index += 1) {
            JSONObject profile = profiles.optJSONObject(index);
            if (profile != null && profileId.equals(profile.optString("profileId"))) return profile;
        }
        return null;
    }

    private static boolean validProfileId(String value) {
        return value != null
                && value.length() <= MAX_PROFILE_ID_CHARS
                && PROFILE_ID.matcher(value).matches();
    }

    private static boolean validDate(String value) {
        if (value == null || !ISO_DATE.matcher(value).matches()) return false;
        try {
            SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            format.setLenient(false);
            format.parse(value);
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    private static String localDate(Date date) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        format.setTimeZone(TimeZone.getDefault());
        return format.format(date);
    }

    private static String maxDate(String... values) {
        String latest = "";
        for (String value : values) {
            if (validDate(value) && value.compareTo(latest) > 0) latest = value;
        }
        return latest;
    }

    private static String bounded(String value, int maxChars, String fallback) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty()) normalized = fallback;
        return normalized.length() <= maxChars ? normalized : normalized.substring(0, maxChars);
    }

    private static int stableId(String value) {
        int hash = value == null ? 0 : value.hashCode();
        return 100_000 + (hash & 0x3fffffff);
    }

    private static void putQuietly(JSONObject target, String key, Object value) {
        try {
            target.put(key, value);
        } catch (Exception ignored) {
        }
    }

    private static final class Trigger {
        final long atMillis;
        final String date;

        Trigger(long atMillis, String date) {
            this.atMillis = atMillis;
            this.date = date;
        }
    }
}
