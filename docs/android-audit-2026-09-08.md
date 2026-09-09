# Android audit, 2026-09-08

Audited the local Android/KMP source at `3048fb93a796939d01f693cc0fee64ec3a76c1e5`, including its compatibility with the backend security and persistence changes. This is a source and local-build audit, not a verification of an installed or published mobile release. No application code, account data, or production services were changed.

The existing Compose, ViewModel, use-case, and port structure is usable. A rewrite is unnecessary. The main problems are inconsistent account boundaries, destructive persistence failure paths, and feature screens that still own their own networking and storage. Android has not inherited the web application's Stats and recovery behavior.

## Findings

**1. P1: Account changes do not isolate local records or API keys.**

`App.android.kt:92-106,122-128` creates one settings store and book cache for the whole app; clearing the session only changes the JWT and auto-sign-in flag. `GrammarStore.kt:15` uses a single `grammar_state` store, `GrammarMiningStore.kt:39` uses a single mining directory, and `BookCache.kt:52-64` has no owner namespace. `AppSettingsStore.kt:14-30` also stores OpenAI and JPDB keys globally. On account B, grammar restoration unions B's Drive state with the device's existing state (`GrammarScreen.kt:170-191`), and autosave sends the union back to B. Settings loading only replaces non-null keys (`SettingsScreen.kt:344-354`), so a new account without a key can retain the previous account's key.

Trigger: use account A, save progress or a key, sign out, then sign in as B. Cached books and grammar state remain available; opening Grammar can copy A's or guest progress and mined passages into B's Drive. The app-wide `DriveJsonFileService` is also remembered across account changes (`App.android.kt:209-215`), while its Google access-token cache checks expiry without checking identity (`DriveJsonFileService.kt:132-141`).

Repair: introduce a stable authenticated user ID independently of rotating JWTs. Partition account data and credentials, preserve a separate guest namespace, recreate or invalidate credential caches on identity change, and reject stale asynchronous results. Guest records should move to an account only through an explicit import.

**2. P1: Failed Drive reads can create replacement collections or overwrite data from an empty base.**

`DriveJsonFileService.kt:68-95` maps discovery failures to an empty listing and malformed JSON to an empty object. `upsertJson`, at lines 100-126, then creates a new file or updates the existing file using that empty base. File selection subsequently prefers the most recently modified duplicate, hiding the original collection. This affects library metadata and other users of the shared JSON service.

Two isolated JVM probes reproduced the paths using only a local HTTP fixture: a 503 listing led to an upload of a new `metadata.json`; malformed downloaded JSON was returned as an apparently readable empty object. No real Drive requests were made.

Repair: return distinct missing, disconnected, unauthorized, temporarily unavailable, and corrupt results. Only a successful discovery proving absence can authorize creation. Never mutate after an unreadable base. Preserve collection formats and unrelated fields; coordinate competing updates rather than relying on a mutex belonging to one client instance.

**3. P1: Saving settings deletes the previous cloud copy before the replacement exists.**

`SettingsScreen.kt:434-457` calls `deleteFile(existingId)` before serializing and uploading the new settings. The backend adapter issues a Drive file DELETE (`backend/app/domains/drive/adapters/google_drive.py:169-181`). A failed upload or process interruption after deletion leaves the user without the previous cloud settings. A failed delete can instead leave duplicates.

Repair: update the existing file in place with failure reporting and concurrency protection. Preserve the last confirmed copy and unknown settings fields. Verify an interrupted save does not remove the previous settings.

**4. P1: Imported EPUB content can retain executable JavaScript attributes.**

`EpubRepository.kt:340-358` removes script-like elements but leaves event handlers and JavaScript URLs. `HtmlRenderer.android.kt:164` enables JavaScript and embeds the resulting body. An isolated probe confirmed that both an image `onerror` handler and a `javascript:` link survive the actual sanitizer. Blocking network loads does not remove locally executable attributes.

Impact established here: untrusted book content reaches a JavaScript-enabled reader with executable attributes intact. This can alter the displayed document or disrupt reading. Device execution and credential exfiltration were not demonstrated and are not claimed.

Repair: apply an attribute and URL allowlist to all untrusted HTML, including SVG/MathML cases, and constrain navigation to supported reader destinations. Keep the reader's own presentation logic separate from content scripts. Add malicious-content regression fixtures.

**5. P1: A failed vocabulary mastered update can crash the screen/app.**

`VocabularyScreen.kt:545-551` calls `service.toggleMastered` inside a Compose coroutine with no exception handling. The service now deliberately throws structured backend failures for unsuccessful responses. An expired session, revoked Drive access, migration restriction, or network exception escapes the UI callback instead of becoming a recoverable save state. Reading errors have a catch block; this write path does not.

Repair: handle structured errors in a ViewModel, keep the last confirmed row, display the recovery action, and allow a deliberate retry with the same operation ID when appropriate. Generate an operation ID once per logical write, not once per retry. Add a UI-level test where a loaded word's update returns 401, 409, or 503.

**6. P1: Failed JPDB refreshes can replace known vocabulary with an empty successful snapshot.**

`VocabularyService.kt:114-126` turns a failed deck-list response into an empty list; the deck vocabulary and lookup methods use the same failure pattern. `JpdbMirrorSync.kt:49-153` constructs a fresh successful snapshot from those results. `SettingsScreen.kt:839-855` persists it, can back it up to Drive, and reports that the mirror synced. A transient failure can therefore remove locally known vocabulary and change highlighting/mix results until the next successful rebuild. It does not delete the user's actual JPDB account vocabulary.

An isolated HTTP probe exercises the 503 deck-list case through the real service and mirror builder. The required repair is to propagate failed or incomplete pages, retain the last complete snapshot, and publish a new snapshot only after every required batch succeeds. A legitimately empty account must remain distinguishable from a failed refresh.

**7. P2: Grammar synchronization cannot start on a new account and loses offline removals.**

`GrammarScreen.kt:157-163` treats a missing `grammar.json` as a failed restore. Lines 196-207 require a successful restore before any save, so a new account cannot create its first grammar file. For an existing account, the set union at lines 170-175 reintroduces an item removed locally while offline if the old cloud copy still contains it. Autosave at lines 213-220 ignores both thrown failures and the returned success flag. A user sees local progress change without a reliable indication that it reached Drive.

Repair: distinguish a confirmed missing file from a failed read, retain account-owned pending changes including removals, and expose local/pending/synced/failed states. Restore once per identity and reconcile operations; do not reset the restore lifecycle on every JWT rotation.

**8. P2: Reader bookmarks are local-only and are shown as saved before persistence succeeds.**

`ReaderViewModel.kt:490-506` updates the displayed bookmark immediately and discards disk-save failures. `AndroidReaderPort.kt:102-105` delegates book state only to `BookCache`. The HTTP `BookmarksService` has no application caller: its presence and ID-deserialization tests do not mean the reader synchronizes bookmarks. The UI shows a saved count (`ReaderScreen.kt:1091`) without identifying local-only records. Bookmarks contain only a chapter index, and the persisted reader state has no within-chapter position (`ReaderModels.kt:24-38`).

Repair: preserve guest local bookmarking, surface local-save errors, explicitly label local status, and connect signed-in bookmarks through an account-owned repository with pending-operation recovery. Preserve existing local records during migration. Add an actual reader-to-repository test and a stable reading locator for within-chapter restoration.

**9. P2: Interrupted EPUB extraction is permanently mistaken for a complete extraction.**

`EpubRepository.kt:41-60` considers the existence of `META-INF/container.xml` sufficient proof that extraction finished. That file can be written before the OPF, chapters, and assets. After interruption, subsequent opens skip extraction; a missing OPF returns an empty book at lines 67-70. An isolated fixture reproduced this with a valid ZIP and a directory containing only the container file.

Repair: extract into a temporary directory, validate the package, and promote it only after completion. Use a completion marker tied to the source file fingerprint. An incomplete extraction should rebuild automatically.

**10. P2: Invalid or encrypted PDFs can throw during screen creation.**

`PdfReaderScreen.kt:96-112` opens the descriptor and constructs `PdfRenderer` directly in `DisposableEffect`, outside error handling. The later page-render error handling cannot catch failures during construction. File existence is the only gate. This is reachable with a malformed, unsupported encrypted, or incomplete cached PDF. The code path is confirmed; an Android runtime crash was not reproduced without a device.

Repair: open and validate the renderer through a lifecycle-aware loader, close partially acquired resources on failure, and show a recoverable open error. Exercise corrupt, encrypted, missing, and replaced PDF files on an emulator.

## Feature and release gaps

- **Stats parity is incomplete.** Android still has separate Vocabulary and Grammar destinations (`ShellChromeModel.kt:34-47`) and a Due screen with a live `Review: Good` action (`VocabularyScreen.kt:442-452,584-586`). That conflicts with the agreed stats-first direction and using Anki/JPDB for reviews. Combine the overview and browsing surfaces while retaining grammar learning/known tracking and reading support.
- **Disabled grammar AI is not represented properly.** The mining loop checks internet and cached books, but not authentication or an available user key (`GrammarScreen.kt:438-440`). Grammar errors become raw response strings (`GrammarApiService.kt:104-109`), and teaching errors are discarded (`GrammarScreen.kt:752-755`). Pause unavailable AI actions with a useful explanation and retain local highlighting/progress. Remove the old error-message-triggered naive-match fallback in `GrammarLibraryMiner.kt:359-388`; it should not manufacture validated examples.
- **Internal EPUB navigation bypasses reader state.** `HtmlRenderer.android.kt:176-180` permits non-HTTP, non-`pr` navigation; the screen callback only handles JPDB URLs (`ReaderScreen.kt:459-469`). Following an internal file link can move the WebView independently of chapter state, highlighting, translation, and bookmarks. Route internal links and fragments through the reader controller. Verify footnotes and next/previous behavior on-device.
- **Android is absent from repository CI.** The checked-in GitHub workflow builds the Docker image and does not run Gradle or publish Android artifacts. Add unit, lint, debug/release build, and emulator smoke gates before depending on backend changes from Android.
- **Tests do not yet cover the important failures.** The existing suite has 30 JVM tests, including only two backend-contract tests for ID decoding and error-message decoding. They do not cover account switching, Drive failures, actual bookmark synchronization, grammar sync, or save-error presentation. Two instrumented test files cover library/shell UI and were not run in this audit.
- **Release packaging still needs a distribution check.** The Android module declares versionCode 1/versionName 0.1.0 and has no explicit release signing setup. The generated release bundle contains no JAR signature entries. It has not been signed for distribution, uploaded, or verified as an update to an existing installation.

## Verification

- `android.ps1 verify`: succeeded, including debug APK assembly and debug lint. Lint reported 0 errors, 17 warnings, and 4 hints. Warnings include dependency update notices, KTX suggestions, and three trust-manager warnings inside the Bouncy Castle dependency. Those warnings alone do not prove the application's HTTP clients trust arbitrary certificates.
- The final JVM run executed all 30 existing tests plus five audit probes: 35 tests, 0 failures, 0 errors. All five observed-defect probes passed. The test task was forced to execute rather than relying on Gradle's up-to-date status.
- `:composeApp:bundleRelease :composeApp:lintRelease`: succeeded. Release lint also reported 0 errors, 17 warnings, and 4 hints. Debug APK: 36,372,223 bytes. Unsigned release AAB: 27,147,897 bytes. No installation or publication was performed.
- Isolated probes live in `.tmp/android-audit-src/AndroidAuditTest.kt`, added to the test source set only by `.tmp/android-audit.init.gradle`. They assert the observed defects, so passing probes confirm bugs, not correct product behavior. They are not added to the normal test suite.
- Logs: `.tmp/android-audit-verify.log`, `.tmp/android-audit-probes.log`, and `.tmp/android-audit-release.log`.
- `adb devices -l` returned no devices. Sign-in, account switching, WebView script execution, PDF rendering, gestures, rotation, process death, and real Google Drive sync remain unverified on Android hardware or an emulator. No production account or external provider was used by the probes.

## Recommended repair order

1. Close the security and data-loss paths: account/credential isolation, safe Drive reads and writes, settings replacement, EPUB sanitization, and failed vocabulary/JPDB updates. Add failure-injection tests for each.
2. Connect the actual Android reader and Stats workflows to account-owned repositories. Keep guest storage separate, preserve existing records, and show honest local/pending/synced/error states. Retain the backend's migration and disabled-AI enforcement.
3. Complete Stats parity and grammar reading support, repair extraction/PDF/navigation recovery, and verify end-to-end on an emulator plus the user's reading device.
4. Add Android CI and a repeatable signed-release process. Promote only after account switching, offline/reconnect, interrupted saves, and upgrade recovery pass.

Keep the existing architecture. Move the remaining network and persistence logic out of `VocabularyScreen`, `GrammarScreen`, and `SettingsScreen` into the same ViewModel/use-case/repository structure already used by the reader and library. Preserve separate books, bookmarks, manual vocabulary, reader vocabulary, settings, grammar, and JPDB collections.
