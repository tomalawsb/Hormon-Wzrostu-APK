# Zachowaj wyłącznie metody udostępniane bezpiecznemu interfejsowi WebView.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations
