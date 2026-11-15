package com.byurek.rfreflex;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * The whole app is the web page in assets/ (index.html, engine.js, app.js, style.css).
 * This activity only hosts it in a WebView, keeps it offline, and forwards the back button.
 */
public class MainActivity extends Activity {

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.setBackgroundColor(0xFF0D1014);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);   // localStorage holds the progress
        settings.setTextZoom(100);             // ignore the system font scale so the layout stays put
        settings.setSupportZoom(false);
        settings.setBlockNetworkLoads(true);   // belt and braces: there is no INTERNET permission either

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return true;                   // never navigate away from the bundled page
            }
        });

        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
        web.pauseTimers();                     // freezes the sprint clock while the app is in the background
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.resumeTimers();
        web.onResume();
    }

    @Override
    public void onBackPressed() {
        // The page decides: it returns true when it handled the press (went back a screen),
        // false when it is already on the home screen and the app should close.
        web.evaluateJavascript("(window.onAndroidBack && window.onAndroidBack()) ? 'handled' : 'exit'",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if (value == null || !value.contains("handled")) {
                            finish();
                        }
                    }
                });
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
