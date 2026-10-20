#!/usr/bin/env bash
# Builds the GLP1 Life Android app (Capacitor 8 + Health Connect steps) from the static web app in this repo.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd); W=$ROOT/android-build/work; rm -rf "$W"; mkdir -p "$W/www"; cd "$W"
# The app loads the live site (auto-updates, ~100 MB of class media stays online and is cached by the service worker).
# www/ only holds an offline fallback page + the Health Connect privacy policy.
cat > www/index.html <<'H'
<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GLP1 Life</title></head><body style="font-family:sans-serif;text-align:center;padding:60px 20px;color:#2a1740;background:#f7f4fb"><h2>GLP1 Life</h2><p>You're offline. Connect to the internet once to load GLP1 Life; after that it works offline.</p><button onclick="location.href='https://mitchrobfilms.github.io/coach-workout-app/'" style="padding:14px 24px;border-radius:12px;border:0;background:#5b2a86;color:#fff;font-size:1rem">Try again</button></body></html>
H
cp "$ROOT/privacy.html" www/privacypolicy.html
VER=${APP_VERSION:-1.0.$(date +%y%j)}; CODE=${VERSION_CODE:-1}
cat > package.json <<J
{ "name": "glp1life-android", "private": true, "version": "1.0.0" }
J
npm i --no-audit --no-fund @capacitor/core@^8 @capacitor/cli@^8 @capacitor/android@^8 @capgo/capacitor-health@^8 >/dev/null
cat > capacitor.config.json <<J
{ "appId": "com.glp1life.app", "appName": "GLP1 Life", "webDir": "www", "server": { "url": "https://mitchrobfilms.github.io/coach-workout-app/", "errorPath": "index.html", "allowNavigation": ["mitchrobfilms.github.io", "*.supabase.co", "www.fitbit.com", "api.fitbit.com"] }, "android": { "allowMixedContent": false } }
J
npx cap add android >/dev/null
npx cap sync android >/dev/null
M=android/app/src/main/AndroidManifest.xml
python3 - "$M" <<'PY'
import sys,re
p=sys.argv[1]; s=open(p).read()
if 'xmlns:tools' not in s: s=s.replace('<manifest ','<manifest xmlns:tools="http://schemas.android.com/tools" ',1)
keep={'READ_STEPS'}
types=['STEPS','DISTANCE','ACTIVE_CALORIES_BURNED','HEART_RATE','WEIGHT','SLEEP','RESPIRATORY_RATE','OXYGEN_SATURATION','RESTING_HEART_RATE','HEART_RATE_VARIABILITY','EXERCISE','TOTAL_CALORIES_BURNED','BASAL_METABOLIC_RATE','BODY_FAT','HEIGHT','BLOOD_PRESSURE','BLOOD_GLUCOSE','BODY_TEMPERATURE','BASAL_BODY_TEMPERATURE','FLOORS_CLIMBED','HYDRATION','NUTRITION','MINDFULNESS','VO2_MAX','SPEED','POWER','ELEVATION_GAINED','LEAN_BODY_MASS','BONE_MASS','SKIN_TEMPERATURE','PLANNED_EXERCISE','WHEELCHAIR_PUSHES','CYCLING_PEDALING_CADENCE','STEPS_CADENCE']
perms=['<uses-permission android:name="android.permission.CAMERA"/>','<uses-permission android:name="android.permission.RECORD_AUDIO"/>','<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS"/>','<uses-permission android:name="android.permission.health.READ_STEPS"/>']
for t in types:
  for rw in ('READ','WRITE'):
    n=f'{rw}_{t}'
    if n not in keep: perms.append(f'<uses-permission android:name="android.permission.health.{n}" tools:node="remove"/>')
perms.append('<uses-permission android:name="android.permission.health.READ_HEALTH_DATA_HISTORY" tools:node="remove"/>')
perms.append('<uses-feature android:name="android.hardware.camera" android:required="false"/>')
perms.append('<queries><package android:name="com.google.android.apps.healthdata"/><intent><action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE"/></intent></queries>')
s=s.replace('<application','\n    '.join(perms)+'\n    <application',1)
open(p,'w').write(s)
PY
mkdir -p android/app/src/main/res/values
grep -q health_connect_privacy_policy_url android/app/src/main/res/values/strings.xml || sed -i 's#</resources>#    <string name="health_connect_privacy_policy_url">https://mitchrobfilms.github.io/coach-workout-app/privacy.html</string>\n</resources>#' android/app/src/main/res/values/strings.xml
sed -i "s/minSdkVersion = [0-9]*/minSdkVersion = 26/" android/variables.gradle
sed -i "s/versionCode [0-9]*/versionCode $CODE/; s/versionName \"[^\"]*\"/versionName \"$VER\"/" android/app/build.gradle
# launcher icons from icon-512.png
for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do n=${d%%:*}; px=${d##*:}; for f in ic_launcher ic_launcher_round; do convert "$ROOT/icon-512.png" -resize ${px}x${px} android/app/src/main/res/mipmap-$n/$f.png; done; convert "$ROOT/icon-512.png" -resize $((px*108/48))x$((px*108/48)) -gravity center -background '#f7f4fb' -extent $((px*108/48))x$((px*108/48)) android/app/src/main/res/mipmap-$n/ic_launcher_foreground.png; done
cd android && chmod +x gradlew && ./gradlew --no-daemon -q assembleRelease
echo "$W/android/app/build/outputs/apk/release/app-release-unsigned.apk"
