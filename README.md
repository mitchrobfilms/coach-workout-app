# Reta Coach

Mobile-first static web app: live-camera rep counting and form cues (MediaPipe PoseLandmarker lite, on-device), a rule-based live coach "Reta" with en-GB voice, "Hey Reta" voice commands, trainer demo clips, food check-in, progress history (localStorage).

- Serve over HTTPS (camera + mic need a secure context; localhost is OK for testing): `python3 -m http.server 8765`
- Test hook: `?speed=10` runs the timers 10x faster.
- Tests: `node tests/unit.mjs` (logic/food), `node tests/e2e.mjs` (headless Chrome, fake camera; needs playwright-core).
- Files: index.html, style.css, app.js (UI/flow/camera/voice), logic.js (angles, rep counters, coach engine), food.js (food analyser, fussy mode, ready meals), media/ (demo loops + posters), clips/ (bundled fallback demos), hero.jpg, avatar.jpg, sw.js, manifest.webmanifest.

## Live-class layout, accounts, trainers (v2)
- Workout screen: trainer video big (cover in portrait, contain + blurred fill in landscape; floor moves always contain), live camera as a tile (portrait: bottom ~40%; landscape: draggable 30% PiP). Tap the small view or ⇄ to swap.
- Overlays: trainer name + "Live coaching" badge, move timeline, rep count, form score, captions, your reps vs last session.
- Trainers: male/female Reta from media/m and media/f (`slug.mp4`, `slug-hd.mp4` for the big view, `slug.jpg`, `avatar.jpg`), falling back to media/ then clips/.
- Accounts: auth.js (LocalAuth: PBKDF2-SHA256 150k + salt, per-account localStorage prefix `kova.u.<id>.`). Swap in another provider with `setAuthProvider()` implementing signUp/signIn/signOut/currentUser/listAccounts/resetAccount/dataPrefix.
- Tests: `node tests/unit.mjs`, `node tests/{weight,voice,auth}.test.mjs`; browser: `tests/{class,voice-e2e,weight-ui,weight,e2e}.mjs` (need playwright-core).

## Meal prep
Batch-cook recipes for Breakfast, Lunch, Dinner and Snacks (`prep.js`) with storage/food-safety notes, store tips for Lidl/Aldi/Asda/Any, and "Build my week", which fills the shopping list. Voice: "Hey Reta, what should I prep?"

## Classes (v3)
Five full-length follow-along classes in `classes.js`. Each one is exactly 30:00: a 5:00 warm-up, 20:00 of main blocks (45–90s each, with 15s transitions and water breaks), and a 5:00 cool-down. Unit tests assert that each script sums to 1800s.

| Class | Lead | Music | Live tracking |
|---|---|---|---|
| Boxing | male | 120 bpm | Punches per side (straights and hooks), guard check |
| Dance | female | 124 bpm, 8-count | Move score, stay-in-rhythm meter, step direction |
| Latin Dance Cardio (Zumba-style) | female | 100–130 bpm by section | As Dance. Not affiliated with Zumba® |
| Yoga | female | Ambient pads | Pose matching (chair, warrior II, tree); the hold timer only counts while you're in the pose and still |
| Pilates | male | Ambient pads | Reps for bridges, leg lifts, clams and bird dog; plank hold |

- Music is generated live with WebAudio (`music.js`), so it is royalty-free. The same patterns are synthesised offline for the MP4 renders.
- Calories are approximate: MET × 3.5 × kg / 200 per minute, using the latest weigh-in (75 kg if none).
- Class history is saved per account.
- **Clips:** `media/classes/<class>/<slug>(-hd).mp4|.jpg` plus `media/classes/manifest.json`. They are streamed, never precached by the service worker. Missing clips fall back to the poster, then to a similar trainer clip.
- **Trainer override:** the trainer picker can override the class lead when `media/classes/<class>/<m|f>/<slug>.mp4` exists.
- **Watch full class:** put public Google Drive file IDs in `classes-drive.json` (`{"boxing":"<id>", ...}`). The button stays hidden while an ID is empty.
- **Full-class MP4s:** `node tools/render-class.mjs <class|all> /workspace/class-renders`.
- **Voice:** "Hey Reta, start boxing / dance / Latin / yoga / Pilates", "pause", "skip", "louder", "quieter".
- **Test hook:** add `?speed=90` to fast-forward a class.
