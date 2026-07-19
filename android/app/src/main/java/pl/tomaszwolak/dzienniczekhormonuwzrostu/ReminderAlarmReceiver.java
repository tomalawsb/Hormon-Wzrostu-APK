package pl.tomaszwolak.dzienniczekhormonuwzrostu;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class ReminderAlarmReceiver extends BroadcastReceiver {
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null
                || intent == null
                || !ReminderScheduler.ACTION_REMINDER.equals(intent.getAction())) return;
        final PendingResult pendingResult = goAsync();
        final Context appContext = context.getApplicationContext();
        final String profileId = intent.getStringExtra(ReminderScheduler.EXTRA_PROFILE_ID);
        final String date = intent.getStringExtra(ReminderScheduler.EXTRA_DATE);
        EXECUTOR.execute(() -> {
            try {
                ReminderScheduler.handleAlarm(appContext, profileId, date);
            } finally {
                pendingResult.finish();
            }
        });
    }
}
