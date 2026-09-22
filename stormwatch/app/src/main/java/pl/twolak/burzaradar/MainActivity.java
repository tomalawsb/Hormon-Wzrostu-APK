package pl.twolak.burzaradar;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final int LOCATION_REQUEST = 77;

    private static final String URL_BURZE = "https://obserwatorzy.info/mapapp.html";
    private static final String URL_RADAR = "https://meteo.imgw.pl/dyn/index.html#group=radar&param=cmax&loc=52,19,7";
    private static final String URL_OSTRZEZENIA = "https://meteo.imgw.pl/dyn/index.html#osmet=true";
    private static final String URL_BLITZ = "https://map.blitzortung.org/";

    private WebView webView;
    private ProgressBar progressBar;
    private TextView sourceLabel;
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeoCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
        configureWebView();
        showPage("MAPA BURZ", "Sieć Obserwatorów Burz", URL_BURZE);
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(11, 19, 43));

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(dp(16), dp(11), dp(16), dp(8));
        header.setBackgroundColor(Color.rgb(11, 19, 43));

        TextView title = new TextView(this);
        title.setText("⚡ BurzaRadar");
        title.setTextColor(Color.WHITE);
        title.setTextSize(22);
        title.setGravity(Gravity.START);
        title.setTypeface(null, 1);
        header.addView(title, new LinearLayout.LayoutParams(-1, -2));

        sourceLabel = new TextView(this);
        sourceLabel.setTextColor(Color.rgb(148, 163, 184));
        sourceLabel.setTextSize(12);
        sourceLabel.setPadding(0, dp(3), 0, 0);
        header.addView(sourceLabel, new LinearLayout.LayoutParams(-1, -2));

        root.addView(header, new LinearLayout.LayoutParams(-1, -2));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setProgress(0);
        root.addView(progressBar, new LinearLayout.LayoutParams(-1, dp(3)));

        webView = new WebView(this);
        LinearLayout.LayoutParams webParams = new LinearLayout.LayoutParams(-1, 0, 1f);
        root.addView(webView, webParams);

        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setPadding(dp(4), dp(4), dp(4), dp(6));
        nav.setBackgroundColor(Color.rgb(15, 23, 42));

        nav.addView(navButton("BURZE", v -> showPage("MAPA BURZ", "Sieć Obserwatorów Burz", URL_BURZE)), navParams());
        nav.addView(navButton("RADAR", v -> showPage("RADAR OPADÓW", "IMGW-PIB", URL_RADAR)), navParams());
        nav.addView(navButton("ALERTY", v -> showPage("OSTRZEŻENIA", "IMGW-PIB", URL_OSTRZEZENIA)), navParams());
        nav.addView(navButton("BLITZ", v -> showPage("WYŁADOWANIA", "Blitzortung.org", URL_BLITZ)), navParams());
        nav.addView(navButton("⟳", v -> webView.reload()), navParams());

        root.addView(nav, new LinearLayout.LayoutParams(-1, dp(58)));
        setContentView(root);
    }

    private void configureWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        webView.setBackgroundColor(Color.rgb(241, 245, 249));

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri uri = Uri.parse(url);
                String scheme = uri.getScheme();
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setVisibility(newProgress < 100 ? View.VISIBLE : View.GONE);
                progressBar.setProgress(newProgress);
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                        checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                } else {
                    pendingGeoOrigin = origin;
                    pendingGeoCallback = callback;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_REQUEST);
                }
            }
        });
    }

    private void showPage(String pageName, String source, String url) {
        sourceLabel.setText(pageName + " • źródło: " + source);
        progressBar.setVisibility(View.VISIBLE);
        webView.loadUrl(url);
    }

    private Button navButton(String text, View.OnClickListener listener) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(text.equals("⟳") ? 20 : 11);
        b.setTextColor(Color.WHITE);
        b.setAllCaps(false);
        b.setPadding(dp(2), 0, dp(2), 0);
        b.setBackgroundColor(Color.TRANSPARENT);
        b.setOnClickListener(listener);
        return b;
    }

    private LinearLayout.LayoutParams navParams() {
        return new LinearLayout.LayoutParams(0, -1, 1f);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_REQUEST && pendingGeoCallback != null && pendingGeoOrigin != null) {
            boolean granted = false;
            for (int result : grantResults) {
                if (result == PackageManager.PERMISSION_GRANTED) {
                    granted = true;
                    break;
                }
            }
            pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
            if (!granted) {
                Toast.makeText(this, "Lokalizacja wyłączona. Mapy nadal działają, ale bez pozycji użytkownika.", Toast.LENGTH_LONG).show();
            }
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
