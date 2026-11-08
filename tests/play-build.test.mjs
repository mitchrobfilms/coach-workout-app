// Play listing prep. Checks the shell script and the update channel. No SDK, no keystore, no upload.
import fs from 'fs';
globalThis.window = {};
globalThis.document = { readyState: 'complete', documentElement: { classList: { add() {} }, style: { setProperty() {} } }, getElementById: () => null, addEventListener() {} };
const { updateChannel } = await import('../native.js');

let fail = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const sh = fs.readFileSync(new URL('../android-build/build.sh', import.meta.url), 'utf8');
const play = fs.readFileSync(new URL('../android-build/native/ApkUpdaterPlay.java', import.meta.url), 'utf8');

ok(sh.includes('compileSdkVersion = 36') && sh.includes('targetSdkVersion = 36'), 'Play and sideload builds pin API 36');
ok(sh.includes('bundleRelease') && sh.includes('PLAY=1'), 'Play mode builds an app bundle');
ok(sh.includes('tools:node="remove"/>') && sh.includes('REQUEST_INSTALL_PACKAGES'), 'Play mode can strip the sideload install permission');
ok(/if play:[\s\S]*REQUEST_INSTALL_PACKAGES/.test(sh) && sh.includes("os.environ.get('PLAY')=='1'"), 'the install permission is removed only for PLAY=1');
ok(!/keytool|keystore\.jks|storePassword/.test(sh), 'the build script does not create a signing identity');
ok(sh.includes("echo 'refusing to build: a keystore is in the project'"), 'a keystore in the project stops the build');
ok(sh.includes('com.glp1life.app'), 'package name stays the existing candidate');
ok(!play.includes('downloadAndInstall') && !play.includes('REQUEST_INSTALL_PACKAGES'), 'the Play plugin does not install an APK');
ok(play.includes('openCastSettings'), 'the Play plugin still opens cast settings');
ok(updateChannel({}) === 'play', 'a shell without the installer is treated as Play');
ok(updateChannel({ ApkUpdater: { canInstall() {}, downloadAndInstall() {} } }) === 'sideload', 'a shell with the installer stays on the sideload channel');
ok(updateChannel({ ApkUpdater: { openCastSettings() {} } }) === 'play', 'cast alone does not enable sideload updates');

console.log(fail ? `${fail} FAILED` : 'ALL PLAY BUILD CHECKS PASSED');
process.exit(fail ? 1 : 0);
