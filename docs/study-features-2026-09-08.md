# Study feature completion, 2026-09-08

Implemented and verified locally. This work extends the existing web features and preserves the earlier backend/security changes. No commit, push, migration or production deployment was performed.

## Test runner

- Saves answers, skipped questions, section position, retry queues, audio positions and completion state on this device, scoped to the account, test and mode.
- Reopens an active test after refresh. Returning to the catalog keeps its attempt available when the same test and mode are opened again.
- Fingerprints test content and validates recovered answers. An incompatible or corrupt attempt is preserved until explicitly discarded; loading a changed test cannot overwrite it.
- Uses an absolute deadline when the test specifies a total duration. Time away from the page counts, and expiry submits unanswered questions as skipped. Files without a total duration explicitly run untimed with elapsed time shown.
- Requires valid answer indices for every question before a scored run. Missing listening audio is flagged in the preview, and audio download failures show an error.
- Keeps coached practice separate from exam history. Completed exam results use stable attempt IDs to prevent duplicate entries on reload, and exam mistakes can be opened as a separate practice run.
- Reports practice recall accuracy while answering and labels exam scores as practice scores, not official JLPT scaled scores.
- Loads local test cards independently of Drive discovery. Repeated authentication notifications no longer restart catalog discovery indefinitely.
- Persists dashboard/history locally without the previous debounce window and surfaces cloud read/write and device-storage failures.

## Vocabulary

- Reader vocabulary, JPDB decks and manual words retain separate collections and progress meanings.
- Vocabulary is a progress dashboard. Reader totals show tracked, mastered and saved-but-not-mastered words; manual vocabulary keeps its own counts, browsing and status controls.
- Flashcard sessions and their scheduling code were removed after product clarification. Reviews belong in Anki or JPDB. No Anki sync integration is implied.
- JPDB deck selection precedes its review status. Due-word details are collapsed by default, and an unchecked queue is distinguished from a successfully checked empty queue.
- JPDB due cards are explicitly a queue preview with a Review in JPDB link. JPDB selected-deck and due caches now support account scoping, and stale due requests cannot replace the newly selected deck's results.
- Reader-word browsing loads the current Drive collection directly, clears on disconnection, reports failures and offers refresh. Duplicate auth notifications are ignored rather than triggering recursive reloads.
- Draft deletion uses inline confirmation that works in the embedded browser.

## Grammar

- Search patterns/meanings and filter by learning, known or not started.
- Grammar is a progress dashboard with reading support: known and learning pattern counts, per-level progress, catalog meanings, reader highlighting, and book examples/explanations. Its flashcard runner was also removed.
- Personal-key AI generation remains an optional book-example enhancement. No-key configurations do not invoke the disabled server-funded route from the grammar worker.
- Removed unconditional “Generating teaching…” messaging. Explanation generation has an explicit action, running/error states and retry control; generation is no longer implied merely because an explanation is absent.
- Cancelling a miner pauses the job instead of immediately requeuing it. Interrupted jobs reopen paused. Sequential queued work continues when a completed job releases the worker.
- Grammar device state is scoped to the signed-in account. Legacy unscoped device progress remains in its guest namespace; it is not adopted automatically by the next account. Existing account Drive progress still loads.
- Initial Drive reads gate cloud writes. Failed/corrupt reads do not become an empty grammar collection. Saves are serialized locally, failures are visible, and manual retry is available.
- Existing `grammar.json` format is retained, including the older array format. Existing Drive history/grammar collections have not been migrated to immutable operation files.

## Initial overhaul evidence (before the dashboard clarification)

- Final frontend suite: **113 passed, 1 failed** across 51 files. The remaining pre-existing failure is `src/test/smoke/AdminPage.test.tsx`, involving its HTTP mock/unauthorized state. The affected study tests pass.
- The previous due-cards test now uses explicit vocabulary-port fixtures. It checks deck selection, separate due/detail lookup calls, displayed words and the JPDB review destination, avoiding the existing happy-dom/MSW response-stream fixture issue. This is not a live JPDB test.
- New coverage includes account/collection isolation, session recovery, missed-only retries, review dates, inline confirmations, exam expiry and result deduplication, changed-content preservation, strict answer indices, AI-free grammar recall, and blocked writes during a failed initial grammar read.
- Production Vite build passed. Existing large-chunk warnings remain.
- The diagnostic TypeScript run using the prior temporary kanji-data shim reported no errors in the changed study feature paths. The ordinary project typecheck is still not clean; its oversized dataset and existing unrelated type errors remain. This diagnostic run is not a replacement for a passing full typecheck.
- Diff whitespace check passed.

In-app browser checks on `127.0.0.1:5173`:

1. Grammar loaded the user's existing **306 known patterns**. A one-card recall session worked without an AI key and reopened after refresh with the answer hidden.
2. The catalog displayed local and Drive tests after the auth-event loading fix. Opened the real N2 July 2025 test, answered a practice question, refreshed and recovered the same question, selected answer and correctness feedback. No exam result was created. The one-question practice checkpoint remains locally recoverable.
3. Manual vocabulary accepted a temporary device draft and offered it in recall practice. The draft was subsequently discarded through the repaired inline confirmation; zero pending drafts and zero manual words were observed afterward.
4. The existing **1330 mastered reader words** remained visible. No reader mastery values were changed by recall practice.

Logs: `.tmp/study-all-tests.log`, `.tmp/study-final-targeted.log`, `.tmp/study-build.log`, `.tmp/study-types.log` (ignored local artifacts).

## Dashboard clarification

The user confirmed that vocabulary should show statistics and leave reviews to Anki/JPDB, while grammar should keep known/learning tracking and reading support. Both pages no longer mount a recall runner, and the unused shared runner and its scheduling tests were removed. Existing saved words, grammar progress and the separate JLPT test runner are preserved. Earlier device-only recall storage is left unused; it is not converted into mastery statistics.

Verification after this correction: **11 affected tests passed across 7 files**, including known/learning persistence, grammar reader highlighting, Drive read safety, vocabulary filters and JPDB queue loading. The Vite production build passed with the existing chunk-size warnings. The full suite was not rerun for this correction; the earlier AdminPage fixture failure remains documented above.

The in-app browser showed **1330 mastered reader words** and **306 known grammar patterns**, with no recall controls on either page. Grammar search still exposed the pattern meaning and known/learning/example controls. These checks did not change the user's progress or invoke AI. Logs: `.tmp/stats-focused-tests.log`, `.tmp/stats-build.log`.

## Boundaries

Navigation follow-up: vocabulary and grammar now live under `/stats`, with Vocabulary and Grammar views. The header has one Stats entry on desktop and mobile. `/vocabulary` redirects to `/stats`; `/grammar` redirects to `/stats?view=grammar`. The selected view is URL-backed and survives reload. Reader and JLPT shortcuts point to the new destinations. The global migration banner was removed at the user's request; storage enforcement is unchanged.

This follow-up passed 8 affected tests across 6 files and a production build. Browser verification confirmed the legacy grammar redirect, a single Stats header, switching views, 306 known grammar patterns and 1330 mastered reader words. Logs: `.tmp/combined-stats-tests.log`, `.tmp/combined-stats-build.log`.

Server-funded AI/OCR remain disabled. Manual vocabulary/bookmark cloud saves remain behind the migration gate from the backend repair; device drafts remain usable. No real provider-funded calls, JPDB review submissions, production migration or Android changes were performed for this web feature work.

The catalog's lesson coverage and every listening file have not been independently validated. Browser checks cover representative flows, supported by automated regression tests; they do not establish every test's answer-key correctness or concurrent multi-device edits to legacy Drive grammar/history files. Those existing whole-file collections still need separate reconciliation work if concurrent editing is required.
