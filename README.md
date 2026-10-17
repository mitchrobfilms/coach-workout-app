# Kova Coach

Mobile-first static web app: live-camera rep counting and form cues (MediaPipe PoseLandmarker lite, on-device), a rule-based live coach "Kova" with en-GB voice, "Hey Kova" voice commands, trainer demo clips, food check-in, progress history (localStorage).

- Serve over HTTPS (camera + mic need a secure context; localhost is OK for testing): `python3 -m http.server 8765`
- Test hook: `?speed=10` runs the timers 10x faster.
- Tests: `node tests/unit.mjs` (logic/food), `node tests/e2e.mjs` (headless Chrome, fake camera; needs playwright-core).
- Files: index.html, style.css, app.js (UI/flow/camera/voice), logic.js (angles, rep counters, coach engine), food.js (food analyser, fussy mode, ready meals), media/ (demo loops + posters), clips/ (bundled fallback demos), hero.jpg, avatar.jpg, sw.js, manifest.webmanifest.

## Live-class layout, accounts, trainers (v2)
- Workout screen: trainer video big (cover in portrait, contain + blurred fill in landscape; floor moves always contain), live camera as a tile (portrait: bottom ~40%; landscape: draggable 30% PiP). Tap the small view or ⇄ to swap.
- Overlays: trainer name + "Live coaching" badge, move timeline, rep count, form score, captions, your reps vs last session.
- Trainers: male/female Kova from media/m and media/f (`slug.mp4`, `slug-hd.mp4` for the big view, `slug.jpg`, `avatar.jpg`), falling back to media/ then clips/.
- Accounts: auth.js (LocalAuth: PBKDF2-SHA256 150k + salt, per-account localStorage prefix `kova.u.<id>.`). Swap in another provider with `setAuthProvider()` implementing signUp/signIn/signOut/currentUser/listAccounts/resetAccount/dataPrefix.
- Tests: `node tests/unit.mjs`, `node tests/{weight,voice,auth}.test.mjs`; browser: `tests/{class,voice-e2e,weight-ui,weight,e2e}.mjs` (need playwright-core).
