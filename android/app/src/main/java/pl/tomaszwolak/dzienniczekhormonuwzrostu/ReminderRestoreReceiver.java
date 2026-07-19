package pl.tomaszwolak.dzienniczekhormonuwzrostu;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class ReminderRestoreReceiver extends BroadcastReceiver {
    private static final String ACTION_EXACT_ALARM_PERMISSION_CHANGED =
            "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED";
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final Set<String> RESTORE_ACTIONS = new HashSet<>(Arrays.asList(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            ACTION_EXACT_ALARM_PERMISSION_CHANGED
    ));

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null || !RESTORE_ACTIONS.contains(intent.getAction())) return;
        if (ACTION_EXACT_ALARM_PERMISSION_CHANGED.equals(intent.getAction())
                && !ReminderScheduler.canScheduleExact(context)) return;
        final PendingResult pendingResult = goAsync();
        final Context appContext = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            try {
                ReminderScheduler.restoreAll(appContext);
            } finally {
                pendingResult.finish();
            }
        });
    }
}
