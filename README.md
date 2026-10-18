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
Five full-length follow-along classes, defined entirely by data in `library.json` (the engine is `classes.js`). Each one is exactly 30:00: a 5:00 warm-up, 20:00 of main blocks (45–90s each, with 15s transitions and water breaks), and a 5:00 cool-down. Unit tests assert that each script sums to 1800s.

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
- **Watch full class:** set `drive_file_id` on the class in `library.json` (a public Google Drive file). It opens `https://drive.google.com/file/d/<id>/preview` in a full-screen-capable player. The button stays hidden while the ID is empty.
- **Corrective chips:** a move's `fix` text is shown as an amber chip and spoken. It is used for takes where the clip's form isn't perfect.
- **Full-class MP4s:** `node tools/render-class.mjs <class|all> /workspace/class-renders`.
- **Voice:** "Hey Reta, start boxing / dance / Latin / yoga / Pilates", "pause", "skip", "louder", "quieter".
- **Test hook:** add `?speed=90` to fast-forward a class.

### Online class library (`library.json`)
The app fetches `library.json?v=<timestamp>` (no-store) on every launch and whenever you come back to the Classes tab. The service worker never caches it. The last good copy is kept on the phone for offline use. Classes added in the last 14 days, or not yet seen on this account, get a **New** badge. The tab has category chips and search (title, category, trainer, tags and move names).

**Adding a class needs no code change:**
1. Add an entry to `classes` in `library.json`. Fields: `id`, `title`, `category`, `tags`, `trainer` (`m`/`f`), `duration`, `intensity`, `poster`, `blurb`, `music` (`{style: boxing|dance|latin|ambient, bpm}`), `met`, `track` (`punch|rhythm|hold|reps`), `voice` (spoken aliases), `drive_file_id`, `added` (YYYY-MM-DD) and `script`.
2. `script` is `{transition: 15, waterEvery: 4, warm: [...], main: [...], cool: [...]}`. Each move is `{name, dur, slug, how, cues, counts?, bpm?, pose?, rep?, fix?}`. Warm-up and cool-down should each total 300s. Main blocks should be 45–90s, with the 15s transitions and water breaks inserted automatically to reach 1200s.
3. Put the media in `media/classes/<id>/<slug>.mp4` (optionally `-hd.mp4` and `.jpg`) and list it in `media/classes/manifest.json`. Any missing clip falls back to the poster or a similar trainer clip.
4. Run `node tests/classes.test.mjs`, which checks timings and required fields, then push. Phones pick up the class the next time the app is opened.

**App updates:** when a new service worker version is ready, the app shows "Update available, tap to refresh".

### Instructor voice
Settings → *Instructor voice*: **Recorded (realistic)**, the default, or **Phone voice**. In recorded mode, each spoken line is looked up in `media/voice/voice-manifest.json`, first by phrase ID and then by exact text, in the current trainer's voice. It plays `media/voice/<m|f>/<id>.mp3`. The music ducks while the instructor speaks. Lines queue and are throttled like before, and the next move's lines are preloaded. Anything without a recording uses the phone's speech synthesis: lines with your name, numbers above 20, or everything if the voice files are missing. Class launch never waits on the voice files.

`voice-catalogue.json` lists every recordable line with a stable ID. Regenerate it with `node tools/voice-catalogue.mjs` after editing `library.json`. Example IDs:
- `class.<id>.welcome`
- `class.<id>.<move-slug>.intro|next|water_next|cool_intro`
- `cue.<slug>`
- `layer.<slug>`
- `pose.*`, `plank.*`, `common.*`
- `count.1`–`count.20`

Manifest entries are `{id, text, file, trainer, tags}`, given as an array, as `{lines: [...]}`, or as an id-keyed object. The voice pack shipped with the app (Kokoro TTS, Apache-2.0) uses its own IDs, such as `boxing.intro` and `boxing.warm01.intro`. These are matched by exact text, plus per-class alternates (`<class>.intro`, `<class>.water`, `<class>.cool`). Dance and Latin "Layer it up" lines aren't recorded yet, so they use the phone voice.
