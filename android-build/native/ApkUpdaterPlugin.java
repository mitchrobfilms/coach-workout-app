package com.glp1life.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// In-app updater: downloads a release APK (https only, GitHub or glp1life.co.uk) into cache and opens the system installer.
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
    private static boolean allowed(String u) {
        try { URL x = new URL(u); String h = x.getHost();
            return "https".equals(x.getProtocol()) && (h.equals("github.com") || h.equals("glp1life.co.uk") || h.endsWith(".githubusercontent.com")); } catch (Exception e) { return false; }
    }
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject r = new JSObject();
        r.put("allowed", Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(r);
    }
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(i); call.resolve();
    }
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !allowed(url)) { call.reject("URL not allowed"); return; }
        new Thread(() -> {
            try {
                String cur = url; HttpURLConnection c = null;
                for (int hop = 0; hop < 6; hop++) { // follow redirects (GitHub -> objects.githubusercontent.com), https only
                    c = (HttpURLConnection) new URL(cur).openConnection(); c.setInstanceFollowRedirects(false); c.setConnectTimeout(20000); c.setReadTimeout(60000);
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400) { String loc = c.getHeaderField("Location"); c.disconnect(); if (loc == null || !allowed(loc)) throw new Exception("redirect not allowed"); cur = loc; continue; }
                    if (code != 200) throw new Exception("HTTP " + code); break;
                }
                File dir = new File(getContext().getCacheDir(), "updates"); dir.mkdirs();
                File f = new File(dir, "GLP1-Life-update.apk"); long total = c.getContentLengthLong(), done = 0; int lastPct = -1;
                try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(f)) {
                    byte[] buf = new byte[65536]; int n;
                    while ((n = in.read(buf)) > 0) { out.write(buf, 0, n); done += n;
                        if (total > 0) { int pct = (int) (done * 100 / total); if (pct != lastPct) { lastPct = pct; JSObject p = new JSObject(); p.put("percent", pct); notifyListeners("progress", p); } } }
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
                Intent i = new Intent(Intent.ACTION_VIEW); i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                JSObject r = new JSObject(); r.put("bytes", done); call.resolve(r);
            } catch (Exception e) { call.reject(e.getMessage()); }
        }).start();
    }
}
