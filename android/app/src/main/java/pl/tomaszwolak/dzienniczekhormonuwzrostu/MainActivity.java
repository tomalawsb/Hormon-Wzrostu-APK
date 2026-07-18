package pl.tomaszwolak.dzienniczekhormonuwzrostu;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {
    private static final int REQ_MICROPHONE = 4101;
    private static final int REQ_NOTIFICATIONS = 4102;
    private static final int REQ_FILE = 4103;
    private static final String PREFS = "permission_state";
    private static final String CHANNEL_ID = "growth-diary-reminders";

    private WebView webView;
    private PermissionRequest pendingWebPermission;
    private ValueCallback<Uri[]> fileCallback;
    private SharedPreferences prefs;
    private boolean firstResume = true;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(245, 248, 251));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        webView.addJavascriptInterface(new AndroidNativeApi(), "AndroidNative");
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() { public void run() { handleWebPermissionRequest(request); } });
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                try {
                    startActivityForResult(intent, REQ_FILE);
                    return true;
                } catch (Exception error) {
                    fileCallback = null;
                    return false;
                }
            }
        });

        createNotificationChannel();
        setContentView(webView);
        webView.loadUrl("file:///android_asset/web/index.html");
    }

    private void handleWebPermissionRequest(PermissionRequest request) {
        boolean asksForAudio = false;
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                asksForAudio = true;
                break;
            }
        }
        if (!asksForAudio) {
            request.deny();
            return;
        }
        if (microphoneGranted()) {
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            pendingWebPermission = request;
            requestMicrophonePermissionNative();
        }
    }

    private boolean microphoneGranted() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean notificationsGranted() {
        return Build.VERSION.SDK_INT < 33
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private String microphoneState() {
        if (microphoneGranted()) return "granted";
        return prefs.getBoolean("microphone_requested", false) ? "denied" : "prompt";
    }

    private String notificationState() {
        if (notificationsGranted()) return "granted";
        return prefs.getBoolean("notification_requested", false) ? "denied" : "prompt";
    }

    private void requestMicrophonePermissionNative() {
        if (microphoneGranted()) {
            dispatchPermission("microphone", "granted");
            return;
        }
        prefs.edit().putBoolean("microphone_requested", true).apply();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MICROPHONE);
        }
    }

    private void requestNotificationPermissionNative() {
        if (notificationsGranted()) {
            dispatchPermission("notification", "granted");
            return;
        }
        prefs.edit().putBoolean("notification_requested", true).apply();
        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        } else {
            dispatchPermission("notification", "granted");
        }
    }

    private void dispatchPermission(String kind, String state) {
        final String safeKind = JSONObject.quote(kind);
        final String safeState = JSONObject.quote(state);
        runOnUiThread(new Runnable() { public void run() { webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('nativePermissionChanged',{detail:{kind:" + safeKind + ",state:" + safeState + "}}));",
                null
        ); } });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (requestCode == REQ_MICROPHONE) {
            if (pendingWebPermission != null) {
                if (granted) pendingWebPermission.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                else pendingWebPermission.deny();
                pendingWebPermission = null;
            }
            dispatchPermission("microphone", granted ? "granted" : "denied");
        } else if (requestCode == REQ_NOTIFICATIONS) {
            dispatchPermission("notification", granted ? "granted" : "denied");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
            fileCallback.onReceiveValue(result);
            fileCallback = null;
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Przypomnienia o zastrzykach",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Przypomnienia Dzienniczka Hormonu");
            channel.enableVibration(true);
            manager.createNotificationChannel(channel);
        }
    }

    private boolean showNativeNotification(String json) {
        if (!notificationsGranted()) return false;
        try {
            JSONObject payload = new JSONObject(json == null ? "{}" : json);
            String title = payload.optString("title", "Dzienniczek Hormonu");
            String body = payload.optString("body", "Otwórz aplikację.");
            Intent openIntent = new Intent(this, MainActivity.class);
            openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                    this, 0, openIntent,
                    Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT
            );
            android.app.Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? new android.app.Notification.Builder(this, CHANNEL_ID)
                    : new android.app.Notification.Builder(this);
            builder.setContentTitle(title)
                    .setContentText(body)
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setAutoCancel(true)
                    .setContentIntent(pendingIntent);
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            manager.notify((int) (System.currentTimeMillis() & 0x7fffffff), builder.build());
            return true;
        } catch (Exception error) {
            return false;
        }
    }


    private boolean openExternalUrlNative(String rawUrl) {
        try {
            Uri uri = Uri.parse(rawUrl == null ? "" : rawUrl.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme())) return false;
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            startActivity(intent);
            return true;
        } catch (Exception error) {
            return false;
        }
    }


    private String appVersionNative() {
        try {
            String value = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            return value == null || value.trim().isEmpty() ? "1.0.8" : value.trim();
        } catch (Exception error) {
            return "1.0.8";
        }
    }

    private String latestReleaseJsonNative() {
        HttpURLConnection connection = null;
        try {
            URL url = new URL("https://api.github.com/repos/tomalawsb/Hormon-Wzrostu-APK/releases/latest");
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(12000);
            connection.setRequestProperty("Accept", "application/vnd.github+json");
            connection.setRequestProperty("User-Agent", "Dzienniczek-Hormonu-Android");
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) return "";
            BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), "UTF-8"));
            StringBuilder result = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) result.append(line);
            reader.close();
            return result.toString();
        } catch (Exception error) {
            return "";
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!firstResume && webView != null) {
            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('nativeAppResume'));", null);
        }
        firstResume = false;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

    public final class AndroidNativeApi {
        @JavascriptInterface public boolean isNative() { return true; }
        @JavascriptInterface public String appVersion() { return appVersionNative(); }
        @JavascriptInterface public String latestReleaseJson() { return latestReleaseJsonNative(); }
        @JavascriptInterface public void initialize() { createNotificationChannel(); }
        @JavascriptInterface public String microphonePermission() { return microphoneState(); }
        @JavascriptInterface public void requestMicrophonePermission() { runOnUiThread(new Runnable() { public void run() { requestMicrophonePermissionNative(); } }); }
        @JavascriptInterface public String notificationPermission() { return notificationState(); }
        @JavascriptInterface public void requestNotificationPermission() { runOnUiThread(new Runnable() { public void run() { requestNotificationPermissionNative(); } }); }
        @JavascriptInterface public String exactAlarmPermission() { return "granted"; }
        @JavascriptInterface public String requestExactAlarmPermission() { return "granted"; }
        @JavascriptInterface public int syncDailyReminders(String profilesJson) { return 0; }
        @JavascriptInterface public boolean showNotification(String payloadJson) { return showNativeNotification(payloadJson); }
        @JavascriptInterface public boolean openExternalUrl(String url) { return openExternalUrlNative(url); }
        @JavascriptInterface public void openAppSettings() {
            runOnUiThread(new Runnable() { public void run() {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            } });
        }
        @JavascriptInterface public void exitApp() { runOnUiThread(new Runnable() { public void run() { finish(); } }); }
    }
}
