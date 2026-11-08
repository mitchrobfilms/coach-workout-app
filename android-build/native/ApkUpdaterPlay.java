package com.glp1life.app;

import android.content.Intent;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Play builds keep screen-cast settings only. They do not download or install an APK.
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
    @PluginMethod
    public void openCastSettings(PluginCall call) {
        String[] acts = { "android.settings.CAST_SETTINGS", "android.settings.WIFI_DISPLAY_SETTINGS", Settings.ACTION_DISPLAY_SETTINGS };
        for (String a : acts) {
            try {
                Intent i = new Intent(a);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                JSObject r = new JSObject();
                r.put("opened", a);
                call.resolve(r);
                return;
            } catch (Exception e) { }
        }
        call.reject("No cast settings on this phone");
    }
}
