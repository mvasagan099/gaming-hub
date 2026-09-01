# =============================================================================
# Gaming Hub — ProGuard / R8 Keep Rules
# =============================================================================
# These rules are REQUIRED to prevent R8 from breaking the Capacitor WebView
# bridge.  Capacitor plugins use reflection and @JavascriptInterface, which R8
# would otherwise strip or rename.  The rules below are as narrow as possible
# while still keeping the bridge intact.
# =============================================================================

# ---------------------------------------------------------------------------
# 1. Capacitor Core
# ---------------------------------------------------------------------------
-keep public class * extends com.getcapacitor.BridgeActivity { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }
-keep class com.getcapacitor.** { *; }

# Keep @JavascriptInterface-annotated methods (WebView <-> JS bridge)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep @PluginMethod-annotated methods (Capacitor plugin dispatch)
-keepclassmembers class * {
    @com.getcapacitor.annotation.PluginMethod <methods>;
}

# Capacitor PluginCall & related public API
-keepclassmembers class com.getcapacitor.PluginCall {
    public *;
}

# ---------------------------------------------------------------------------
# 2. Gaming Hub MainActivity
# ---------------------------------------------------------------------------
-keep public class com.gaminghub.app.MainActivity { *; }

# ---------------------------------------------------------------------------
# 3. AndroidX / Jetpack (used by Capacitor internally)
# ---------------------------------------------------------------------------
-keep class androidx.core.app.** { *; }
-keep class androidx.core.content.** { *; }
-keep class androidx.webkit.** { *; }

# ---------------------------------------------------------------------------
# 4. FileProvider (used for sharing/camera if added later)
# ---------------------------------------------------------------------------
-keep class androidx.core.content.FileProvider { *; }

# ---------------------------------------------------------------------------
# 5. Suppress noisy R8 warnings for WebView-internal classes
# ---------------------------------------------------------------------------
-dontwarn android.webkit.**
-dontwarn com.getcapacitor.**

# ---------------------------------------------------------------------------
# 6. Remove source file / line-number attributes from release APK
#    (prevents stack-trace reconstruction from obfuscated builds)
# ---------------------------------------------------------------------------
# NOTE: Do NOT add -keepattributes SourceFile,LineNumberTable here.
#       Only enable them if you need readable crash reports via a private
#       mapping file uploaded to your crash-reporting service.
-renamesourcefileattribute SourceFile

# ---------------------------------------------------------------------------
# 7. Keep Parcelable / Serializable model classes that Capacitor may
#    pass across the bridge via JSON serialization.
# ---------------------------------------------------------------------------
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}
-keepclassmembers class * implements java.io.Serializable {
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}
