# Android device repairs, September 8, 2026

This follows the baseline source audit in `android-audit-2026-09-08.md`. Work was implemented on `Jay-android-device-repairs` and incorporated into local `main`; no production deployment or app-store publication has been performed.

## Changes

- Assign the legacy local profile only after an explicit choice. Jay selected the currently signed-in account. That account retains the original files; guests and other accounts receive separate storage keyed by stable identity. Settings, API keys, books, progress, grammar and JPDB caches share the same profile boundary. Expired tokens retain the account's offline profile. Changing identity recreates services and clears its ViewModels; stale requests cannot obtain another account's credentials.
- Repair dark-mode book text and JPDB word colors, including old cached chapters and inline book colors. Both themes have tested word-color contrast. System-bar icons follow the chosen theme.
- Combine Vocabulary and Grammar under Stats. Vocabulary presents knowledge statistics, JPDB deck browsing and the separate saved-word collection. Remove the vocabulary flashcard review controls. Grammar retains local known/learning tracking and reader support.
- Preserve failed and incomplete Drive/JPDB reads as errors. Failed reads cannot authorize replacement JSON files or an empty vocabulary snapshot. Settings update the existing cloud file instead of deleting it first. Uncertain JSON mutations are not automatically retried.
- Persist grammar changes, including removals, until the exact revision is acknowledged. A confirmed missing grammar file can be created; failed reads cannot. Merge pending edits into a fresh cloud read and preserve unrelated patterns/examples. Show sync failures and an explicit retry. Pause grammar AI without sign-in, connectivity and a user key; remove the naive-match fallback and surface explanation failures.
- Sanitize active EPUB attributes and URLs, including translated/cached bodies. Rebuild interrupted extraction from the source archive using a fingerprinted completion marker and temporary promotion directory.
- Report bookmark persistence failures and label bookmarks as device-local. Catch malformed/password-protected PDF opening failures and close partial resources.

## Preservation and evidence

- Paired Pixel 10 Pro Fold over ADB with explicit permission. Installed each update using `adb install -r`; never uninstalled or cleared the app.
- Before-repair archive: `.tmp/android-device/before-repairs.tar`, 49,032,704 bytes. It contains private app data and credentials and must not be committed or shared.
- `.tmp/android-device/data-preservation-check.json` verifies all 11 original book files have unchanged bytes and the legacy profile claim matches the current session's subject. No credentials were printed by that check.
- 42 JVM tests pass, including failed Drive/JPDB reads, missing grammar file creation, zero HTTP requests for disabled grammar AI, pending removals, late acknowledgements, profile partitioning, sanitizer fixtures, extraction recovery and color contrast.
- Debug lint has zero errors. The existing 17 warnings and six hints remain, including dependency updates, KTX/style suggestions and three `TrustAllX509TrustManager` findings in the Bouncy Castle dependency. Those dependency findings are not evidence that the app's HTTP client disables TLS verification. Debug and unsigned release APK builds pass. Logs: `.tmp/android-device/final-validation.log`.
- Phone-side tests cover real DataStore account/key separation and pending-removal recovery, library actions/status and shell navigation. Initial cover-status assertions queried the merged semantics tree; screenshots showed the overlays were displayed correctly. Assertions now inspect the actual child nodes in the unmerged tree.
- All nine phone-side tests pass in `.tmp/android-device/instrument-complete.log`. The corrupt-PDF test caught a loading-state ordering problem, which was corrected: an open error now takes precedence over the missing renderer spinner.
- Final physical checks opened the preserved Japanese EPUB, verified readable default and JPDB-colored text in dark mode, and swiped forward then back to the original chapter. No `AndroidRuntime` errors were recorded for that app process. Screenshots: `.tmp/android-device/final-dark-reader.png`, `final-reader-next.png`, and `stats-overview.png`.

## Remaining audit work and limits

- Bookmarks still do not synchronize to the backend. They are explicitly device-local. Within-chapter reading locators also remain separate work.
- Existing `grammar.json`, settings and metadata use whole-file updates. Fresh-read merging and local pending edits improve recovery, but do not provide cross-device atomic conflict control. Simultaneous writers can still race; this is not an operation-log migration of those collections.
- Internal EPUB cross-file/footnote navigation still needs routing through the reader controller. The sanitizer regression checks are not a claim of a complete WebView security audit.
- Real Google account switching and revoked-Drive recovery were not exercised against a second live account. Account isolation and failure handling were checked with isolated fixtures; existing books were also verified on the actual phone after session expiry.
- Android CI, release signing/publication and production promotion remain separate work. Do not downgrade this phone to an older build that mixes account storage. Preserve the private backup for recovery.
