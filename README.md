# Kova Coach

Mobile-first static web app: live-camera rep counting and form cues (MediaPipe PoseLandmarker lite, on-device), a rule-based live coach "Kova" with en-GB voice, "Hey Kova" voice commands, trainer demo clips, food check-in, progress history (localStorage).

- Serve over HTTPS (camera + mic need a secure context; localhost is OK for testing): `python3 -m http.server 8765`
- Test hook: `?speed=10` runs the timers 10x faster.
- Tests: `node tests/unit.mjs` (logic/food), `node tests/e2e.mjs` (headless Chrome, fake camera; needs playwright-core).
- Files: index.html, style.css, app.js (UI/flow/camera/voice), logic.js (angles, rep counters, coach engine), food.js (food analyser, fussy mode, ready meals), media/ (demo loops + posters), clips/ (bundled fallback demos), hero.jpg, avatar.jpg, sw.js, manifest.webmanifest.
