package pl.tomaszwolak.dzienniczekhormonuwzrostu;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executor;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

public class MainActivity extends FragmentActivity {
    private static final String LOG_TAG = "DzienniczekHormonu";
    static final String ACTION_OPEN_REMINDER =
            "pl.tomaszwolak.dzienniczekhormonuwzrostu.OPEN_REMINDER";
    private static final int REQ_MICROPHONE = 4101;
    private static final int REQ_NOTIFICATIONS = 4102;
    private static final int REQ_FILE = 4103;
    private static final int REQ_SAVE_JSON = 4104;
    private static final String PREFS = "permission_state";
    private static final String APP_ASSET_HOST = "appassets.androidplatform.net";
    private static final String APP_ASSET_PREFIX = "/assets/web/";
    private static final String NATIVE_BOOTSTRAP_PATH = "/assets/native-bootstrap.html";
    private static final String NATIVE_BOOTSTRAP_SCRIPT_PATH = "/assets/native-bootstrap.js";
    private static final String APP_START_URL =
            "https://" + APP_ASSET_HOST + NATIVE_BOOTSTRAP_PATH;
    private static final int MAX_NOTIFICATION_JSON_CHARS = 32 * 1024;
    private static final int MAX_REMINDER_JSON_CHARS = 1024 * 1024;
    private static final int MAX_EXPORT_JSON_CHARS = 20 * 1024 * 1024;
    private static final int MAX_VOICE_TRANSCRIPT_CHARS = 2000;
    private static final String APP_CONTENT_SECURITY_POLICY =
            "default-src 'self'; base-uri 'none'; object-src 'none'; "
                    + "script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; "
                    + "img-src 'self' data: blob:; font-src 'self' data:; "
                    + "connect-src 'self'; "
                    + "manifest-src 'self'; worker-src 'self'; child-src 'self' blob:; "
                    + "frame-src 'self' blob:; media-src 'self' blob:; "
                    + "form-action 'self'; frame-ancestors 'none'";
    private static final Set<String> TRUSTED_ASSET_PATHS = Collections.unmodifiableSet(
            new HashSet<>(Arrays.asList(
                    NATIVE_BOOTSTRAP_PATH,
                    NATIVE_BOOTSTRAP_SCRIPT_PATH,
                    APP_ASSET_PREFIX + "index.html",
                    APP_ASSET_PREFIX + "app.js",
                    APP_ASSET_PREFIX + "native-bridge.js",
                    APP_ASSET_PREFIX + "style.css",
                    APP_ASSET_PREFIX + "manifest.json",
                    APP_ASSET_PREFIX + "app-version.json",
                    APP_ASSET_PREFIX + "service-worker.js",
                    APP_ASSET_PREFIX + "privacy.html",
                    APP_ASSET_PREFIX + "icon-192.png",
                    APP_ASSET_PREFIX + "icon-512.png"
            ))
    );

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingJsonFilename;
    private String pendingJsonContent;
    private SharedPreferences prefs;
    private SecureDataStore secureDataStore;
    private BiometricPrompt biometricPrompt;
    private SpeechRecognizer speechRecognizer;
    private boolean voiceRecognitionInProgress = false;
    private boolean firstResume = true;
    private volatile boolean bridgeEnabled = false;
    private volatile boolean notificationEventsReady = false;
    private String pendingNotificationProfileId = "";
    private String pendingNotificationDate = "";

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        secureDataStore = new SecureDataStore(this);
        captureReminderIntent(getIntent());
        configureBiometricPrompt();

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView = new WebView(this);
        boolean systemDarkMode =
                (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                        == Configuration.UI_MODE_NIGHT_YES;
        webView.setBackgroundColor(
                systemDarkMode ? Color.rgb(8, 23, 27) : Color.rgb(243, 247, 249));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setBlockNetworkLoads(true);
        settings.setGeolocationEnabled(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setSaveFormData(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setTextZoom(100);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        CookieManager.getInstance().setAcceptCookie(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(APP_ASSET_HOST)
                .setHttpAllowed(false)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.addJavascriptInterface(new AndroidNativeApi(), "AndroidNative");
        webView.setWebViewClient(new LockedDownWebViewClient(assetLoader));
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() { public void run() {
                    if (request != null) request.deny();
                } });
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!bridgeAllowed()) {
                    callback.onReceiveValue(null);
                    return true;
                }
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                        "application/json", "application/octet-stream", "text/plain"
                });
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
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
        ReminderScheduler.restoreAll(this);
        setContentView(webView);
        webView.loadUrl(APP_START_URL);
    }

    private boolean bridgeAllowed() {
        return bridgeEnabled && webView != null && !isFinishing() && !isDestroyed();
    }

    private static boolean isTrustedAppOrigin(Uri uri) {
        if (uri == null || uri.isOpaque()) return false;
        if (!"https".equalsIgnoreCase(uri.getScheme())) return false;
        if (!APP_ASSET_HOST.equalsIgnoreCase(uri.getHost())) return false;
        if (uri.getUserInfo() != null) return false;
        int port = uri.getPort();
        return port == -1 || port == 443;
    }

    private static boolean isTrustedAppAsset(Uri uri) {
        if (!isTrustedAppOrigin(uri)) return false;
        String path = uri.getPath();
        String encodedPath = uri.getEncodedPath();
        if (path == null || encodedPath == null || !path.equals(encodedPath)) return false;
        return TRUSTED_ASSET_PATHS.contains(path);
    }

    private static boolean isTrustedDocument(Uri uri) {
        return isTrustedAppAsset(uri) && (APP_ASSET_PREFIX + "index.html").equals(uri.getPath());
    }

    private static boolean isTrustedBootstrapDocument(Uri uri) {
        return isTrustedAppAsset(uri) && NATIVE_BOOTSTRAP_PATH.equals(uri.getPath());
    }

    private static boolean isTrustedMainDocument(Uri uri) {
        return isTrustedDocument(uri) || isTrustedBootstrapDocument(uri);
    }

    private static boolean isTrustedInternalFrame(Uri uri) {
        if (uri == null || !"about".equalsIgnoreCase(uri.getScheme())) return false;
        String value = uri.getSchemeSpecificPart();
        return "blank".equalsIgnoreCase(value) || "srcdoc".equalsIgnoreCase(value);
    }

    private static WebResourceResponse blockedWebResponse() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        headers.put("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
        headers.put("X-Content-Type-Options", "nosniff");
        return new WebResourceResponse(
                "text/plain",
                "UTF-8",
                403,
                "Blocked",
                headers,
                new ByteArrayInputStream(new byte[0])
        );
    }

    private static WebResourceResponse secureAssetResponse(Uri uri, WebResourceResponse response) {
        if (response == null) return blockedWebResponse();
        Map<String, String> headers = response.getResponseHeaders() == null
                ? new HashMap<String, String>()
                : new HashMap<>(response.getResponseHeaders());
        headers.put("Cache-Control", "no-store");
        headers.put("Referrer-Policy", "no-referrer");
        headers.put("X-Content-Type-Options", "nosniff");
        if (isTrustedMainDocument(uri)) {
            headers.put("Content-Security-Policy", APP_CONTENT_SECURITY_POLICY);
            headers.put("Permissions-Policy", "microphone=(), camera=(), geolocation=()");
        }
        response.setResponseHeaders(headers);
        return response;
    }

    private final class LockedDownWebViewClient extends WebViewClientCompat {
        private final WebViewAssetLoader assetLoader;

        LockedDownWebViewClient(WebViewAssetLoader assetLoader) {
            this.assetLoader = assetLoader;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return interceptRequest(request == null ? null : request.getUrl());
        }

        @Override         @SuppressWarnings("deprecation")
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            return interceptRequest(url == null ? null : Uri.parse(url));
        }

        private WebResourceResponse interceptRequest(Uri uri) {
            if (isTrustedInternalFrame(uri)) return null;
            if (!isTrustedAppAsset(uri)) return blockedWebResponse();
            return secureAssetResponse(uri, assetLoader.shouldInterceptRequest(uri));
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleNavigation(request == null ? null : request.getUrl(),
                    request != null && request.isForMainFrame());
        }

        @Override         @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleNavigation(url == null ? null : Uri.parse(url), true);
        }

        private boolean handleNavigation(Uri uri, boolean isForMainFrame) {
            if (isTrustedMainDocument(uri)) return false;
            if (!isForMainFrame && isTrustedInternalFrame(uri)) return false;
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            notificationEventsReady = false;
            Uri uri = url == null ? null : Uri.parse(url);
            bridgeEnabled = isTrustedDocument(uri);
            if (!isTrustedMainDocument(uri)) {
                view.stopLoading();
            }
            super.onPageStarted(view, url, favicon);
        }

        @Override
        public void onPageCommitVisible(WebView view, String url) {
            Uri uri = url == null ? null : Uri.parse(url);
            bridgeEnabled = isTrustedDocument(uri);
            if (!isTrustedMainDocument(uri)) view.stopLoading();
            super.onPageCommitVisible(view, url);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            Uri uri = url == null ? null : Uri.parse(url);
            if (!isTrustedDocument(uri)) bridgeEnabled = false;
            super.onPageFinished(view, url);
            if (bridgeEnabled) dispatchPendingNotificationAction();
        }


        @Override
        @SuppressWarnings("deprecation")
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            if (failingUrl != null && failingUrl.equals(view.getUrl())) {
                bridgeEnabled = false;
            }
            super.onReceivedError(view, errorCode, description, failingUrl);
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            bridgeEnabled = false;
            handler.cancel();
        }
    }

    private void configureBiometricPrompt() {
        Executor executor = ContextCompat.getMainExecutor(this);
        biometricPrompt = new BiometricPrompt(this, executor, new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                super.onAuthenticationSucceeded(result);
                dispatchBiometricResult(true, "authenticated");
            }

            @Override
            public void onAuthenticationError(int errorCode, CharSequence errorMessage) {
                super.onAuthenticationError(errorCode, errorMessage);
                dispatchBiometricResult(false, "cancelled");
            }

            @Override
            public void onAuthenticationFailed() {
                super.onAuthenticationFailed();
            }
        });
    }

    private String biometricState() {
        int authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG
                | BiometricManager.Authenticators.BIOMETRIC_WEAK;
        int result = BiometricManager.from(this).canAuthenticate(authenticators);
        return result == BiometricManager.BIOMETRIC_SUCCESS ? "available" : "unavailable";
    }

    private void requestBiometricUnlockNative() {
        if (!"available".equals(biometricState())) {
            dispatchBiometricResult(false, "unavailable");
            return;
        }
        int authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG
                | BiometricManager.Authenticators.BIOMETRIC_WEAK;
        BiometricPrompt.PromptInfo prompt = new BiometricPrompt.PromptInfo.Builder()
                .setTitle("Odblokuj Dzienniczek Hormonu")
                .setSubtitle("Potwierdź tożsamość biometrią")
                .setAllowedAuthenticators(authenticators)
                .setNegativeButtonText("Użyj PIN-u")
                .build();
        biometricPrompt.authenticate(prompt);
    }

    private void dispatchBiometricResult(boolean success, String state) {
        if (!bridgeAllowed()) return;
        final String safeState = JSONObject.quote(state);
        runOnUiThread(new Runnable() { public void run() {
            if (!bridgeAllowed()) return;
            webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('nativeBiometricResult',{detail:{success:"
                            + (success ? "true" : "false") + ",state:" + safeState + "}}));",
                    null
            );
        } });
    }

    private boolean notificationsGranted() {
        return ReminderScheduler.notificationsEnabled(this);
    }

    private String notificationState() {
        if (notificationsGranted()) return "granted";
        boolean runtimePermissionMissing = Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED;
        if (runtimePermissionMissing && !prefs.getBoolean("notification_requested", false)) {
            return "prompt";
        }
        return "denied";
    }

    private void requestNotificationPermissionNative() {
        if (notificationsGranted()) {
            dispatchPermission("notification", "granted");
            return;
        }
        boolean runtimePermissionMissing = Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED;
        if (runtimePermissionMissing) {
            prefs.edit().putBoolean("notification_requested", true).apply();
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        } else {
            openNotificationSettingsNative();
            dispatchPermission("notification", "denied");
        }
    }

    private void dispatchPermission(String kind, String state) {
        if (!bridgeAllowed()) return;
        final String safeKind = JSONObject.quote(kind);
        final String safeState = JSONObject.quote(state);
        runOnUiThread(new Runnable() { public void run() {
            if (!bridgeAllowed()) return;
            webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('nativePermissionChanged',{detail:{kind:" + safeKind + ",state:" + safeState + "}}));",
                    null
            );
        } });
    }

    private boolean microphoneGranted() {
        return checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
    }

    private String microphoneState() {
        if (microphoneGranted()) return "granted";
        return prefs.getBoolean("microphone_requested", false) ? "denied" : "prompt";
    }

    private void requestMicrophonePermissionNative() {
        if (microphoneGranted()) {
            dispatchPermission("microphone", "granted");
            return;
        }
        prefs.edit().putBoolean("microphone_requested", true).apply();
        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MICROPHONE);
    }

    private String voiceRecognitionErrorState(int error) {
        if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) return "permission_denied";
        if (error == SpeechRecognizer.ERROR_NO_MATCH
                || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) return "no_speech";
        if (error == SpeechRecognizer.ERROR_NETWORK
                || error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT) return "network";
        if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) return "busy";
        if (error == SpeechRecognizer.ERROR_AUDIO) return "audio_error";
        if (error == SpeechRecognizer.ERROR_CLIENT) return "cancelled";
        return "unavailable";
    }

    private void ensureSpeechRecognizer() {
        if (speechRecognizer != null) return;
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override
            public void onReadyForSpeech(Bundle params) {}

            @Override
            public void onBeginningOfSpeech() {}

            @Override
            public void onRmsChanged(float rmsdB) {}

            @Override
            public void onBufferReceived(byte[] buffer) {}

            @Override
            public void onEndOfSpeech() {}

            @Override
            public void onError(int error) {
                if (!voiceRecognitionInProgress) return;
                voiceRecognitionInProgress = false;
                dispatchVoiceRecognitionResult(false, "", voiceRecognitionErrorState(error));
            }

            @Override
            public void onResults(Bundle results) {
                if (!voiceRecognitionInProgress) return;
                voiceRecognitionInProgress = false;
                ArrayList<String> matches =
                        results == null
                                ? null
                                : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                String transcript = matches != null && !matches.isEmpty() ? matches.get(0) : "";
                if (transcript != null && !transcript.trim().isEmpty()) {
                    dispatchVoiceRecognitionResult(true, transcript, "recognized");
                } else {
                    dispatchVoiceRecognitionResult(false, "", "no_speech");
                }
            }

            @Override
            public void onPartialResults(Bundle partialResults) {}

            @Override
            public void onEvent(int eventType, Bundle params) {}
        });
    }

    private void startVoiceRecognitionNative() {
        if (!bridgeAllowed()) return;
        if (!microphoneGranted()) {
            dispatchVoiceRecognitionResult(false, "", "permission_required");
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            dispatchVoiceRecognitionResult(false, "", "unavailable");
            return;
        }
        ensureSpeechRecognizer();
        if (voiceRecognitionInProgress) speechRecognizer.cancel();
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
        );
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pl-PL");
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "pl-PL");
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        try {
            voiceRecognitionInProgress = true;
            speechRecognizer.startListening(intent);
        } catch (Exception error) {
            voiceRecognitionInProgress = false;
            dispatchVoiceRecognitionResult(false, "", "unavailable");
        }
    }

    private void stopVoiceRecognitionNative() {
        if (!voiceRecognitionInProgress) return;
        voiceRecognitionInProgress = false;
        if (speechRecognizer != null) speechRecognizer.cancel();
        dispatchVoiceRecognitionResult(false, "", "cancelled");
    }

    private void dispatchVoiceRecognitionResult(boolean success, String transcript, String state) {
        if (!bridgeAllowed()) return;
        String safeTranscript = transcript == null ? "" : transcript.trim();
        if (safeTranscript.length() > MAX_VOICE_TRANSCRIPT_CHARS) {
            safeTranscript = safeTranscript.substring(0, MAX_VOICE_TRANSCRIPT_CHARS);
        }
        final String quotedTranscript = JSONObject.quote(safeTranscript);
        final String quotedState = JSONObject.quote(state == null ? "unknown" : state);
        runOnUiThread(new Runnable() { public void run() {
            if (!bridgeAllowed()) return;
            webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('nativeVoiceRecognitionResult',{detail:{success:"
                            + (success ? "true" : "false")
                            + ",transcript:" + quotedTranscript
                            + ",state:" + quotedState + "}}));",
                    null
            );
        } });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (requestCode == REQ_MICROPHONE) {
            dispatchPermission("microphone", granted ? "granted" : "denied");
        } else if (requestCode == REQ_NOTIFICATIONS) {
            dispatchPermission("notification", granted ? "granted" : "denied");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE && fileCallback != null) {
            Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            fileCallback.onReceiveValue(result);
            fileCallback = null;
            return;
        }
        if (requestCode == REQ_SAVE_JSON) {
            String content;
            synchronized (this) {
                content = pendingJsonContent;
                pendingJsonContent = null;
                pendingJsonFilename = null;
            }
            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                dispatchFileSaveResult(false, "cancelled");
                return;
            }
            if (content == null) {
                dispatchFileSaveResult(false, "missing_content");
                return;
            }
            try (OutputStream output = getContentResolver().openOutputStream(data.getData(), "w")) {
                if (output == null) throw new IllegalStateException("Brak strumienia zapisu");
                output.write(content.getBytes(StandardCharsets.UTF_8));
                output.flush();
                dispatchFileSaveResult(true, "saved");
            } catch (Exception error) {
                dispatchFileSaveResult(false, "write_failed");
            }
        }
    }

    private boolean requestJsonSaveNative(String filename, String content) {
        if (!bridgeAllowed() || content == null || content.length() > MAX_EXPORT_JSON_CHARS) return false;
        String safeFilename = filename == null ? "dzienniczek-kopia.json" : filename.trim();
        safeFilename = safeFilename.replace('/', '-').replace('\\', '-');
        if (safeFilename.isEmpty()) safeFilename = "dzienniczek-kopia.json";
        String lowerFilename = safeFilename.toLowerCase(java.util.Locale.ROOT);
        if (!lowerFilename.endsWith(".json") && !lowerFilename.endsWith(".ghbackup")) {
            safeFilename += ".json";
        }
        synchronized (this) {
            if (pendingJsonContent != null) return false;
            pendingJsonFilename = safeFilename;
            pendingJsonContent = content;
        }
        runOnUiThread(() -> {
            if (!bridgeAllowed()) {
                clearPendingJsonSave();
                dispatchFileSaveResult(false, "bridge_blocked");
                return;
            }
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            intent.putExtra(Intent.EXTRA_TITLE, pendingJsonFilename);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            try {
                startActivityForResult(intent, REQ_SAVE_JSON);
            } catch (Exception error) {
                clearPendingJsonSave();
                dispatchFileSaveResult(false, "picker_failed");
            }
        });
        return true;
    }

    private void clearPendingJsonSave() {
        synchronized (this) {
            pendingJsonFilename = null;
            pendingJsonContent = null;
        }
    }

    private void dispatchFileSaveResult(boolean success, String state) {
        if (!bridgeAllowed()) return;
        final String safeState = JSONObject.quote(state == null ? "unknown" : state);
        runOnUiThread(() -> {
            if (!bridgeAllowed()) return;
            webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('nativeFileSaveResult',{detail:{success:"
                            + (success ? "true" : "false") + ",state:" + safeState + "}}));",
                    null
            );
        });
    }

    private void createNotificationChannel() {
        ReminderScheduler.ensureNotificationChannel(this);
    }

    private boolean showNativeNotification(String json) {
        if (!notificationsGranted() || json == null || json.length() > MAX_NOTIFICATION_JSON_CHARS) {
            return false;
        }
        try {
            JSONObject payload = new JSONObject(json == null ? "{}" : json);
            String title = payload.optString("title", "Dzienniczek Hormonu");
            String body = payload.optString("body", "Otwórz aplikację.");
            String profileId = payload.optString("profileId", "");
            boolean test = payload.optBoolean("test", false);
            return ReminderScheduler.showImmediateNotification(
                    this,
                    title,
                    body,
                    profileId,
                    test
            );
        } catch (Exception error) {
            return false;
        }
    }

    private String exactAlarmState() {
        return ReminderScheduler.canScheduleExact(this) ? "granted" : "denied";
    }

    private boolean openExactAlarmSettingsNative() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S
                || ReminderScheduler.canScheduleExact(this)) return true;
        try {
            Intent intent = new Intent(
                    Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                    Uri.parse("package:" + getPackageName())
            );
            startActivity(intent);
            return true;
        } catch (Exception error) {
            return openApplicationDetailsSettingsNative();
        }
    }

    private boolean openNotificationSettingsNative() {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            } else {
                intent = new Intent(
                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + getPackageName())
                );
            }
            startActivity(intent);
            return true;
        } catch (Exception error) {
            return openApplicationDetailsSettingsNative();
        }
    }

    private boolean openApplicationDetailsSettingsNative() {
        try {
            Intent intent = new Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getPackageName())
            );
            startActivity(intent);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private String notificationDiagnosticsNative() {
        JSONObject diagnostics = ReminderScheduler.diagnostics(this);
        try {
            diagnostics.put("platform", "android");
            diagnostics.put("androidApi", Build.VERSION.SDK_INT);
            diagnostics.put("notificationPermission", notificationState());
            diagnostics.put("notificationsEnabled", notificationsGranted());
            diagnostics.put("channelEnabled", ReminderScheduler.channelEnabled(this));
            diagnostics.put("exactAlarmPermission", exactAlarmState());
        } catch (Exception ignored) {
        }
        return diagnostics.toString();
    }

    private void captureReminderIntent(Intent intent) {
        if (intent == null || !ACTION_OPEN_REMINDER.equals(intent.getAction())) return;
        String profileId = intent.getStringExtra(ReminderScheduler.EXTRA_PROFILE_ID);
        String date = intent.getStringExtra(ReminderScheduler.EXTRA_DATE);
        pendingNotificationProfileId = profileId != null
                && profileId.matches("^[A-Za-z0-9_-]{1,100}$") ? profileId : "";
        pendingNotificationDate = date != null && date.matches("^\\d{4}-\\d{2}-\\d{2}$")
                ? date : "";
        intent.removeExtra(ReminderScheduler.EXTRA_PROFILE_ID);
        intent.removeExtra(ReminderScheduler.EXTRA_DATE);
        intent.setAction(null);
    }

    private void dispatchPendingNotificationAction() {
        if (!bridgeAllowed()
                || !notificationEventsReady
                || pendingNotificationProfileId.isEmpty()
                || pendingNotificationDate.isEmpty()) return;
        final String profileId = pendingNotificationProfileId;
        final String date = pendingNotificationDate;
        pendingNotificationProfileId = "";
        pendingNotificationDate = "";
        final String safeProfileId = JSONObject.quote(profileId);
        final String safeDate = JSONObject.quote(date);
        runOnUiThread(() -> {
            if (!bridgeAllowed()) return;
            webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('nativeNotificationAction',{detail:{profileId:"
                            + safeProfileId + ",date:" + safeDate + "}}));",
                    null
            );
        });
    }


    private String appVersionNative() {
        try {
            String value = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            return value == null || value.trim().isEmpty() ? "1.0.9" : value.trim();
        } catch (Exception error) {
            return "1.0.9";
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!firstResume && bridgeAllowed()) {
            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('nativeAppResume'));", null);
        }
        dispatchPendingNotificationAction();
        firstResume = false;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureReminderIntent(intent);
        dispatchPendingNotificationAction();
    }

    @Override
    protected void onPause() {
        if (bridgeAllowed()) {
            webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('nativeAppBackgrounded'));",
                    null
            );
        }
        super.onPause();
    }

    @Override
        @SuppressLint("GestureBackNavigation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        bridgeEnabled = false;
        notificationEventsReady = false;
        voiceRecognitionInProgress = false;
        if (speechRecognizer != null) {
            speechRecognizer.cancel();
            speechRecognizer.destroy();
            speechRecognizer = null;
        }
        clearPendingJsonSave();
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidNative");
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }

    public final class AndroidNativeApi {
        @JavascriptInterface
        public boolean isNative() {
            return bridgeAllowed();
        }

        @JavascriptInterface
        public String appVersion() {
            return bridgeAllowed() ? appVersionNative() : "";
        }

        @JavascriptInterface
        public void initialize() {
            if (!bridgeAllowed()) return;
            createNotificationChannel();
        }

        @JavascriptInterface
        public String microphonePermission() {
            if (!bridgeAllowed()) return "denied";
            return microphoneState();
        }

        @JavascriptInterface
        public void requestMicrophonePermission() {
            if (!bridgeAllowed()) return;
            runOnUiThread(new Runnable() { public void run() {
                if (bridgeAllowed()) requestMicrophonePermissionNative();
            } });
        }

        @JavascriptInterface
        public boolean startVoiceRecognition() {
            if (!bridgeAllowed() || !microphoneGranted()) return false;
            runOnUiThread(new Runnable() { public void run() {
                if (bridgeAllowed()) startVoiceRecognitionNative();
            } });
            return true;
        }

        @JavascriptInterface
        public void stopVoiceRecognition() {
            if (!bridgeAllowed()) return;
            runOnUiThread(new Runnable() { public void run() {
                if (bridgeAllowed()) stopVoiceRecognitionNative();
            } });
        }

        @JavascriptInterface
        public String notificationPermission() {
            return bridgeAllowed() ? notificationState() : "denied";
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            if (!bridgeAllowed()) return;
            runOnUiThread(new Runnable() { public void run() {
                if (bridgeAllowed()) requestNotificationPermissionNative();
            } });
        }

        @JavascriptInterface
        public String exactAlarmPermission() {
            return bridgeAllowed() ? exactAlarmState() : "denied";
        }

        @JavascriptInterface
        public String requestExactAlarmPermission() {
            if (!bridgeAllowed()) return "denied";
            String state = exactAlarmState();
            if (!"granted".equals(state)) {
                runOnUiThread(() -> {
                    if (bridgeAllowed()) openExactAlarmSettingsNative();
                });
            }
            return state;
        }

        @JavascriptInterface
        public int syncDailyReminders(String profilesJson) {
            if (!bridgeAllowed() || profilesJson == null
                    || profilesJson.length() > MAX_REMINDER_JSON_CHARS) return 0;
            return ReminderScheduler.replaceSchedules(MainActivity.this, profilesJson);
        }

        @JavascriptInterface
        public boolean showNotification(String payloadJson) {
            return bridgeAllowed() && showNativeNotification(payloadJson);
        }

        @JavascriptInterface
        public String notificationDiagnostics() {
            return bridgeAllowed() ? notificationDiagnosticsNative() : "{}";
        }

        @JavascriptInterface
        public boolean openNotificationSettings() {
            if (!bridgeAllowed()) return false;
            runOnUiThread(() -> {
                if (bridgeAllowed()) openNotificationSettingsNative();
            });
            return true;
        }

        @JavascriptInterface
        public void notificationEventsReady() {
            if (!bridgeAllowed()) return;
            notificationEventsReady = true;
            dispatchPendingNotificationAction();
        }

        @JavascriptInterface
        public boolean saveJsonFile(String filename, String content) {
            return bridgeAllowed() && requestJsonSaveNative(filename, content);
        }

        @JavascriptInterface
        public String secureStorageRead(String slot) {
            if (!bridgeAllowed()) {
                return "{\"ok\":false,\"exists\":false,\"error\":\"bridge_blocked\"}";
            }
            return secureDataStore.readResult(slot);
        }

        @JavascriptInterface
        public boolean secureStorageWrite(String slot, String value) {
            return bridgeAllowed() && secureDataStore.write(slot, value);
        }

        @JavascriptInterface
        public boolean secureStorageRemove(String slot) {
            return bridgeAllowed() && secureDataStore.remove(slot);
        }

        @JavascriptInterface
        public String secureStorageType() {
            return bridgeAllowed() ? "android-keystore-aes-gcm" : "unsupported";
        }

        @JavascriptInterface
        public String randomBase64(int byteCount) {
            return bridgeAllowed() ? SecurityCrypto.randomBase64(byteCount) : "";
        }

        @JavascriptInterface
        public String pinHash(String pin, String saltBase64) {
            return bridgeAllowed() ? SecurityCrypto.pinHash(pin, saltBase64) : "";
        }

        @JavascriptInterface
        public String encryptBackup(String plaintext, String password) {
            if (!bridgeAllowed()) return "{\"ok\":false,\"error\":\"bridge_blocked\"}";
            return SecurityCrypto.encryptBackupResult(plaintext, password);
        }

        @JavascriptInterface
        public String decryptBackup(String envelope, String password) {
            if (!bridgeAllowed()) return "{\"ok\":false,\"error\":\"bridge_blocked\"}";
            return SecurityCrypto.decryptBackupResult(envelope, password);
        }

        @JavascriptInterface
        public String biometricStatus() {
            return bridgeAllowed() ? biometricState() : "unavailable";
        }

        @JavascriptInterface
        public void requestBiometricUnlock() {
            if (!bridgeAllowed()) return;
            runOnUiThread(new Runnable() { public void run() {
                if (bridgeAllowed()) requestBiometricUnlockNative();
            } });
        }

        @JavascriptInterface
        public void openAppSettings() {
            if (!bridgeAllowed()) return;
            runOnUiThread(new Runnable() { public void run() {
                if (!bridgeAllowed()) return;
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            } });
        }

        @JavascriptInterface
        public void exitApp() {
            if (!bridgeAllowed()) return;
            runOnUiThread(new Runnable() { public void run() {
                if (bridgeAllowed()) finish();
            } });
        }
    }
}
