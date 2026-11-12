# Fitness studio

This is not applied to production. Do not run `supabase/013_fitness_studio.sql` until the pull request is reviewed. The app keeps programmes, the planner, trophies and reminders on the phone. `?fitdemo=1` shows a sample timetable and sample totals. Those rows are not members and not a live class.

The published Coach Ava videos stay in `library-videos.json`. The new follow-along plans are in `fitness-library.json` (rebuild with `node tools/build-fitness-library.mjs`).

## Live video

The timetable and class chat work with no video. The player shows **Coming soon** until one of these is set. Do not invent the values.

| Name | Where it lives | What it is for |
|---|---|---|
| `BUNNY_STREAM_API_KEY` | Bunny dashboard, or a server secret. Never in the app or git. | Create a Bunny Stream live input. |
| `BUNNY_LIVE_LIBRARY_ID` | Public config, only after a live library exists. Set `window.__GLP1_BUNNY_LIVE_LIBRARY_ID` before the app loads. | Library id in the embed. The on-demand library used by Coach Ava classes is not a live library. |
| `VAPID_PUBLIC_KEY` | Server secret, then `window.__GLP1_VAPID_PUBLIC_KEY`. | Web push for Remind me. |
| `VAPID_PRIVATE_KEY` | Server secret only. | Signs web push. Never ship it in the app. |
| `VAPID_SUBJECT` | Server secret. | Contact for the push service, such as `mailto:support@glp1life.co.uk`. |

An admin can also paste an `https` HLS address ending in `.m3u8` on a class. `http` and any other address stay disabled.

Bunny live uses `https://iframe.mediadelivery.net/embed/<library id>/<stream id>`. Both parts have to be real. A stream id without a library id stays on Coming soon.

Remind me always saves on the phone. In the Android app it uses the Capacitor local notification already in the shell, 10 minutes before the UK start. In the browser it can notify only while the page is open, after permission. Web push does nothing until the VAPID public key exists.

Class chat refuses mixing, sourcing, doses and links, in the app and in `fitness_classify` in the migration. It does not give dosing advice.

## Health Connect

Steps stay read-only in the default Android build. `android-build/build.sh` keeps `READ_STEPS` and removes the other health permissions, including `WRITE_ACTIVE_CALORIES_BURNED` and `WRITE_EXERCISE`.

Writing is off unless both of these are true:

1. `localStorage['glp1life.features']` contains `"healthConnectWrite": true`.
2. The shell is rebuilt with `HEALTH_CONNECT_WRITE=1`. That keeps `WRITE_ACTIVE_CALORIES_BURNED` only.

`@capgo/capacitor-health` 8 can store a calorie sample with `saveSample`. It can read workouts with `queryWorkouts`. It does not insert a Health Connect exercise session. If a later plugin adds `saveWorkout`, the same flag uses that method. Do not turn the flag on until `privacy.html` says the app writes workouts, and the Play declaration matches.

On the web, Connected offers a manual minutes entry. The calorie line is an estimate (`MET × 3.5 × kg / 200` per minute), including when no weight is saved (75 kg).

## Music

The follow-along player does not start music and does not turn other audio down. A short beep (880 Hz, under 0.2 s, low gain) marks the next move. The phone's own music app can keep playing. The older class screen still ducks its own generated music under the instructor voice. That path is separate.

## Database

`supabase/013_fitness_studio.sql` is the next number after `008` on main. The open community branch uses `009`–`012`, so this file starts at `013`. It creates tables only if they are missing, enables row level security, and does not drop or delete anything. Admins schedule classes with `fitness_live_save`. Members read the timetable, post filtered chat, and save their own reminder. Activity rows are optional and are not written by the current app.
