# GLP1 Life — Google Play readiness

Checked 8 November 2026. This is preparation only. Nothing in this branch has been uploaded, submitted, or published to Google Play, and the pending redesign is not on https://glp1life.co.uk/.

The package name already used by the shell and by `.well-known/assetlinks.json` is `com.glp1life.app`. Publishing that name makes it permanent. Confirm it before the first Play upload.

## What a Play build is

`android-build/build.sh` generates a Capacitor 8 project, then deletes the work directory. The WebView loads `APP_ORIGIN`, which defaults to `https://glp1life.co.uk/`. A bundle built from this branch still shows the live site until that origin serves the reviewed redesign, or until `APP_ORIGIN` is pointed at a host that does.

```bash
# Unsigned app bundle for a later, owner-run upload. No keystore is created.
PLAY=1 APP_ORIGIN=https://example-staging.invalid/ ./android-build/build.sh
```

Use a real staging origin only when one exists. Do not point a tester build at production if testers would sign in with live member accounts.

`PLAY=1` sets `compileSdkVersion` and `targetSdkVersion` to 36, runs `bundleRelease`, and does not add `REQUEST_INSTALL_PACKAGES`, broad photo/library storage, the microphone, or exact alarms. Health Connect stays read-only for steps. The Play plugin opens cast settings and does not download an APK. The script stops if a `.jks` or `.keystore` appears in the generated project. Do not commit a key, and do not invent an upload key in this repository. The first Play upload has to be signed with an upload key the account owner creates and keeps outside git. Google holds the app signing key.

The default command, without `PLAY=1`, is still the unsigned sideload APK with the GitHub installer. That artifact is not the Play listing build.

This environment has Java 21 and does not have the Android SDK, so no bundle was produced here. After the SDK is installed (`compileSdk` 36 and matching build-tools), the command above prints the `.aab` path. It is unsigned and must not be uploaded as a production release. Internal app sharing can accept a test bundle later; that is still an upload and is not part of this change.

## Store listing draft

Use this only after the reviewed app is what the Play build opens. Limits below are from Play Console Help, [Best practices for your store listing](https://support.google.com/googleplay/android-developer/answer/13393723).

**App name (9 of 30 characters):** GLP1 Life

**Short description (70 of 80):** Log injections, meals, water and steps, and follow short home classes.

**Full description:**

GLP1 Life is a UK home app for people who want a single place to keep everyday GLP-1 notes and light activity.

You can log an injection exactly as you type it, including the site and any effects you choose to write down. The app does not suggest, calculate, or supply a dose, and it does not sell medication.

You can record weight in kilograms, stones and pounds, or pounds, log water against a 3 litre goal, and enter steps yourself. In the Android app you can also read today’s step total from Health Connect. GLP1 Life does not write to Health Connect and does not read other Health Connect types.

Fitness Studio lists three published follow-along classes: a seated class, a 15-minute indoor walk, and a 15-minute full-body class. Coach Ava is labelled in the app as an AI-generated instructor. Warm-up and cool-down are categories with no classes in them yet.

Food tools cover a meal diary, a photo or typed meal check, meals added by hand with protein, recipes, Aldi and Lidl offers, and typical Asda prices. A meal check is an estimate. It is not a diet prescription.

You can also open certificates, the GLP1 Life Course, the member community, and a list of personal trainers. Trainer messages go out through WhatsApp, and the app does not take a payment for them.

GLP1 Life is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. Talk to your GP or prescriber about medical decisions.

Membership payments are not on. Nothing in the app charges a card. Google Play purchases stay off. A complimentary code, if an admin has created one for your account, is not a purchase.

Do not add prices, “free”, rankings, or a claim that a person is a licensed instructor. Aldi and Lidl offers are the live shop feeds. Asda figures in the app are labelled typical prices, not a live Asda feed.

**Graphics still to make outside this repo:** a 512×512 Play icon taken from the existing launcher art, a feature graphic, and phone screenshots. Screenshots for the listing must be captured from the build that will ship, with a visible demo label, and must not use a live member account. Screenshots in this pull request are fixtures for review. They are not the Play Console set, and they show the redesign that is still off the live site.

**Not chosen here:** category, tags, content rating questionnaire, countries, ads declaration, news declaration, government-app declaration, and whether the app is a medical device. The health-policy text for an app that is not a regulated device is the disclaimer already in the description. Selecting “medical device” would need regulatory proof this repo does not have. Do not select it unless the owner has that proof.

## Data the app actually moves

Declarations below are a draft for the owner to check. Unknowns are marked. Do not paste them into Play Console until those points are confirmed. Play holds the developer responsible for the Data safety form: [Provide information for Google Play's Data safety section](https://support.google.com/googleplay/android-developer/answer/10787469). The form is required for closed, open, and production tracks. An app that stays only on internal testing is exempt.

| Data | Where it goes | What this repo shows | Unknown — do not guess |
| --- | --- | --- | --- |
| Email and password | Supabase Auth (`paxukvgdavcolzkvcapo.supabase.co`) | Sign-up and sign-in from Settings → Cloud backup. The client uses the publishable anon key. | Password-hashing and auth-log retention are Supabase project settings, not in this repo. |
| Name | Phone, and Supabase on cloud sign-up | Optional profile name. | |
| User id | Supabase | Account id used for storage paths and row ownership. | |
| Weight, injection log, workouts, meal plans, check-ins, settings, daily steps | Phone first. Cloud backup copies them to Supabase when signed in. | Injection text is stored as typed. Daily steps can be included in the check-in backup. | The region is described as both “EU” and “London” in the privacy draft. Confirm one region before the form. |
| Health Connect steps | Read on the phone, then the same daily backup | `READ_STEPS` only, today’s total. Other health permissions are removed from the manifest. | Whether a backed-up step count is later included in any trainer share. The share RPC is not in this repo. The client offers sharing of weight, workouts, meal plans, and the injection log, after consent. |
| Meal photos | Private Supabase bucket `food-photos`, then the `food-photo` edge function | The function downloads the user’s own object and sends the bytes to `generativelanguage.googleapis.com`. The Gemini key stays in the function secret. Typed meal text can be sent with or without a photo. Daily cap defaults to 20. | The privacy page says a paid Gemini plan so Google does not train on the photo. This repository does not set or prove that account setting. Retention for abuse monitoring is not visible here. Do not tick a “not used for training” box until the Google account is checked. |
| Community text and photos | Supabase, public bucket `community` | Other signed-in members can see them. | Whether account deletion removes those objects. `delete_my_account` is called by the app and its SQL is not in this repo. |
| Certificate images | Private Supabase bucket `certificates` | Deleted by the client as part of cloud-account delete, before the RPC. | |
| Trainer directory | Supabase `trainers`, then WhatsApp if the member taps Message | The app opens `wa.me` with a draft. It does not send the message itself. | WhatsApp’s own data handling after the member sends. |
| Class video | Bunny embed for the three published classes. YouTube embed code exists. | The player is an iframe. Bunny or YouTube can set their own cookies. | Cookie and diagnostics details from those providers. |
| Shop prices | Aldi and Lidl pages and local price files | The app requests public shop data. Member profile fields are not added to those requests in the client. | Retailer logs of the device IP. |
| Camera preview for form check | Stays on the phone | `getUserMedia` is called with `audio: false`. The privacy page says the video is not uploaded. | |
| Microphone | Not in the `PLAY=1` manifest | Instructor voice is off unless a local feature flag is set. | Do not declare microphone collection for the Play build unless the uploaded bundle’s manifest still contains `RECORD_AUDIO`. |
| Payments | Not collected | Stripe checkout returns disabled and refuses a live secret. Google Play purchases stay inactive. The Play screen has no checkout link. A client receipt does not grant access. | If a permitted programme is later enrolled, the programme's transaction reports become new Data safety items. |
| Advertising id, analytics SDK | Not found in app code | No ads SDK in the app source. | GitHub Pages, Supabase, and the WebView may still log IP addresses. Say so only after the owner checks those dashboards. |
| Crash logs | Not found as a shipped SDK | | Play’s own Android vitals exist after install. That is separate from an in-app crash SDK. |

**Encryption:** traffic to the site, Supabase, and Gemini uses HTTPS. “Encrypted at rest” is a Supabase account claim this repo cannot prove. Leave that box until the project setting is confirmed.

**Account deletion:** the app has Settings → Cloud backup → delete. The confirmation keeps data that exists only on the phone. The draft privacy page now has a `#delete-account` section with a support email so a person who uninstalled the app can ask without reinstalling. That matches the shape of [Understanding Google Play’s app account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111), but it is not ready to submit: the server function’s exact deletions are unknown, community posts may remain, and phone-only data is kept on purpose. Play requires associated account data to be deleted, with any retention (security, fraud, legal) written into the policy. The owner has to confirm the RPC and then say what is kept.

The privacy page is still labelled a private testing draft dated 20 October 2026. Play wants a public, non-geofenced, non-PDF, stable URL, linked in the app and in Play Console ([User Data](https://support.google.com/googleplay/android-developer/answer/10144311)). `https://glp1life.co.uk/privacy.html` is the intended URL. Do not treat the draft as the final policy.

## Health declaration

The app is in scope of [Health Content and Services](https://support.google.com/googleplay/android-developer/answer/16679511) because it logs injections, weight, and steps, and it reads Health Connect. Complete the Health apps declaration in Play Console. [Android Health Permissions](https://support.google.com/googleplay/android-developer/answer/12991134) require the step access to match a feature the listing describes, a privacy policy that covers it, and no broader health permissions.

The shell requests `android.permission.health.READ_STEPS` only, removes the other Health Connect types the plugin would merge, and adds the permission-rationale activity alias Play expects for Health Connect. The privacy policy URL string is `${APP_ORIGIN}privacy.html`. Confirm that URL in the merged manifest after a real build.

The app does not sell prescription drugs and does not offer a dose calculator. Keep it that way. Do not add peptide or supplier links.

## Account

Mitchell created a new **personal** Google Play developer account on 8 November 2026. This is not an organisation account. Verification status is not known.

The closed-test rule for personal accounts created after 13 November 2023 therefore applies: [App testing requirements for new personal developer accounts](https://support.google.com/googleplay/android-developer/answer/14151465).

- Production and pre-registration stay off until a **closed** test has at least 12 testers opted in continuously for the preceding 14 days. The owner then applies for production and answers the test, app, and readiness questions. Review is usually seven days or less and can ask for more testing.
- Internal testing does not meet that requirement. Open testing is available only after production access.
- A tester who drops out before 14 continuous days does not count.

Identity verification, a public developer email, a phone number, and Android device verification are separate requirements for a new personal account. Whether this account has finished them is unknown.

- [Verify your developer identity information](https://support.google.com/googleplay/android-developer/answer/10841920)
- [Device verification requirements for new developer accounts](https://support.google.com/googleplay/android-developer/answer/14316361)
- [Get started with Play Console](https://support.google.com/googleplay/android-developer/answer/6112435)

Closed and production tracks need the Data safety form, a privacy policy, the health declaration, content rating, and a signed app bundle. Internal testing can start before app setup is finished and, while the app is only on that track, does not need the Data safety form. This change does not create any track.

Provide Play reviewers with a working demo login when the app is submitted. Do not send a live member password.

## Payments: Stripe is the preference, Play purchases stay off

On 8 November 2026 the owner said all payments will go via Stripe. This branch does not add a Play Billing plugin, does not start a Play purchase, and does not enrol in a billing programme. Stripe checkout also stays off, and a live Stripe key is refused. No charge was created.

### Verified from the official pages read on 8 November 2026

[Payments](https://support.google.com/googleplay/android-developer/answer/9858738) says a Play-distributed app that takes payment for digital features, and it names fitness subscriptions as an example, must use Google Play's billing system unless section 3, 8, or 9 applies. Section 4 forbids leading users inside the app to another payment method. That includes links, webviews, advertisements, and sign-up flows.

[Understanding Google Play's payments policy](https://support.google.com/googleplay/android-developer/answer/10281818) says email and other channels **outside** the app may describe other ways to pay. Inside the app, that steering is not allowed unless an enrolled programme applies. The same page says a consumption-only app does not sell digital access inside the app, and a person can sign in and use something already paid for elsewhere. It also says a consumption-only app may mention a website purchase **without a direct link**. Play Billing is described as unavailable only in listed countries, and the United Kingdom is not described that way.

[Understanding user choice billing](https://support.google.com/googleplay/android-developer/answer/13821247) names the United Kingdom. For the UK, the published category is a non-gaming mobile or tablet app. The programme adds another billing system **alongside** Google Play Billing. The page states a 10% service fee on the first US$1 million of annual earnings and on recurring transactions when the user pays with the alternative system. Other transactions are referred to a separate fee article. Enrolment is in Play Console, with programme terms and the alternative billing APIs. The same page says a standalone alternative billing system, without also offering Play Billing, is an option for the European Economic Area. Its API table lists "alternative billing only" for the EEA, not the United Kingdom.

[Enrolling in the billing choice programme](https://support.google.com/googleplay/android-developer/answer/17161464) lists the United Kingdom with an availability date of 30 June 2026. It says users must be offered Google Play Billing alongside either in-app alternative billing or external web links. Where that programme's in-app alternative fee table applies, the published rates are 10% for auto-renewing subscriptions, 10% on the first US$1 million, 20% for other transactions from new installs, and 25% for other transactions from existing installs. Authorised transactions are reported within 24 hours through the billing choice APIs. Enrolment on that page is Settings > Billing choice, accept the terms, integrate the APIs, opt in each app, and provide management URLs. The table retrieved on 8 November 2026 did not fill the United Kingdom cells under "Alternative billing" and "External web links".

[Learn about Google Play and alternative billing systems](https://support.google.com/googleplay/answer/11174377) tells users in the United Kingdom that they have a choice of billing systems. It says an alternative system without that choice is described for EEA users.

None of those pages says a UK app may use Stripe as the only in-app payment method. User choice and the billing choice programme both keep Google Play Billing in the choice. Alternative billing without that choice is the EEA programme, not the UK one.

### Unknown for this account

- Whether Play Console will offer this new personal account the United Kingdom under user choice, external web links, or alternative billing only. The published pages do not put the UK in the alternative-billing-only list.
- Whether enrolment can start before identity, phone, and device verification are complete.
- Whether this app would be accepted into the non-gaming user-choice category. The published category fits a non-gaming mobile app. Acceptance is a Console decision.
- The Apps Experience fee reduction, with enrolment from 1 September 2026 and UK users from 30 September 2026, is a fee programme. It does not remove the Play Billing choice. Whether this app qualifies is unknown.
- Stripe's own processing fees are not a Google Play fee.

### What stays in this build

The Play install remains consumption-only. It does not sell a membership, it does not link to Stripe, and it does not use the consumption-only sentence that mentions a website purchase. Complimentary codes are grants, not card charges. Website Stripe, outside the Play app, is the owner's stated payment method and is not connected to a live charge here. Turning on Play Billing, or adding an in-app Stripe link, waits until the owner has enrolled in a programme Console actually offers and has accepted that programme's requirement to show Play Billing next to Stripe.

## Release checklist

Owner actions before any upload:

1. The account is a new personal account created on 8 November 2026. Finish identity, email, phone, and Android device verification, then run the closed test of 12 testers for 14 continuous days before applying for production. Verification status is still unknown.
2. Confirm `com.glp1life.app` is the package name to keep forever.
3. Create the app in Play Console. Do not upload a bundle yet.
4. Create an upload key outside this repo (RSA 2048-bit or stronger). Let Google generate the app signing key on the first release ([Use Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)). New apps are enrolled in Play App Signing. Register every Google-held signing certificate fingerprint, including quantum-ready hybrid keys if Console shows them, in Supabase, Google, and `.well-known/assetlinks.json`. The fingerprint already in that file has not been matched to a Play signing key.
5. Decide the host the WebView loads. Do not ship this redesign by pointing Play at today’s production site.
6. Finish the privacy policy: one cloud region, Gemini retention and training terms from the actual Google account, what `delete_my_account` removes, community photos, and any records kept after deletion.
7. Complete, but do not submit until the policy matches, Data safety, Health apps, content rating, ads (none found in app code), and target audience. The app is not aimed at children.
8. Install Android SDK 36 and run `PLAY=1 ./android-build/build.sh`. Inspect the merged manifest for `targetSdkVersion` 36, `READ_STEPS` only, and no `REQUEST_INSTALL_PACKAGES` or `READ_MEDIA_IMAGES`. [Photo and video permissions](https://support.google.com/googleplay/android-developer/answer/9888170) need a declaration if `READ_MEDIA_IMAGES` is still present. Also check native libraries for [16 KB page size](https://developer.android.com/guide/practices/page-sizes).
9. Sign the bundle with the upload key on a machine the owner controls. Replace the asset-links fingerprint only after Play shows the real signing certificates.
10. Put demo screenshots, the listing text above, and a demo account in the draft listing. Do not use live member data.
11. Run that closed test only after the owner chooses to upload. Internal testing can come first and does not replace the 12-tester closed test.
12. Leave Google Play purchases off. Do not add an in-app Stripe link unless the owner enrols in a programme Console shows for the United Kingdom and accepts that programme's requirement to offer Play Billing beside Stripe. Website Stripe stays outside the Play app, and it is not live in this branch.

## Official pages

- Target API level, updated 2026-10-28 UTC. From 31 August 2026, new apps and updates must target Android 16 (API 36). The extension date published there was 1 November 2026. https://developer.android.com/google/play/requirements/target-sdk
- Android App Bundles have been required for new apps since August 2021. https://support.google.com/googleplay/android-developer/answer/9844279
- App bundle format. https://developer.android.com/guide/app-bundle
- Play App Signing. https://support.google.com/googleplay/android-developer/answer/9842756
- Sign your app. https://developer.android.com/studio/publish/app-signing
- Create and set up your app, including the package-name warning. https://support.google.com/googleplay/android-developer/answer/9859152
- Closed testing for new personal accounts. https://support.google.com/googleplay/android-developer/answer/14151465
- Internal app sharing (still an upload; not done here). https://support.google.com/googleplay/android-developer/answer/9844679
- Data safety. https://support.google.com/googleplay/android-developer/answer/10787469
- User Data, privacy policy, and account deletion. https://support.google.com/googleplay/android-developer/answer/10144311
- Account deletion details. https://support.google.com/googleplay/android-developer/answer/13327111
- Health Content and Services. https://support.google.com/googleplay/android-developer/answer/16679511
- Health permissions. https://support.google.com/googleplay/android-developer/answer/12991134
- Sensitive permissions, including photos. https://support.google.com/googleplay/android-developer/answer/9888170
- Store listing metadata. https://support.google.com/googleplay/android-developer/answer/13393723
- Play Billing overview, updated 2026-10-23 UTC. https://developer.android.com/google/play/billing
- Play Billing security, updated 2026-10-20 UTC. https://developer.android.com/google/play/billing/security
- Payments policy. https://support.google.com/googleplay/android-developer/answer/9858738
- Payments FAQ, including consumption-only apps and off-app email. https://support.google.com/googleplay/android-developer/answer/10281818
- User choice billing, including the UK and the EEA-only standalone option. https://support.google.com/googleplay/android-developer/answer/13821247
- Billing choice programme, fees, and 24-hour reporting. https://support.google.com/googleplay/android-developer/answer/17161464
- Alternative billing enrolment screen, where the country list depends on the option selected. https://support.google.com/googleplay/android-developer/answer/14245100
- Consumer explanation of UK choice versus EEA standalone billing. https://support.google.com/googleplay/answer/11174377
- New personal account identity verification. https://support.google.com/googleplay/android-developer/answer/10841920
- Android device verification for new personal accounts. https://support.google.com/googleplay/android-developer/answer/14316361
