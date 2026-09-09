# CBZ series implementation and verification

## Behavior

Web and Android group assigned CBZ chapters into one series tile. The series page shows a cover, ordered chapters, read status, device/Drive availability, and Continue reading. Chapters remain individual files with their existing IDs and OCR sidecars. Series assignment is independent of folders. Users can rename a series, select its cover, edit chapter metadata, reorder chapters, and remove an assignment without deleting the file. Chapter deletion remains explicit.

Source downloads carry their source/manga reference. Android can open that reference in an already installed and enabled source. Web has no source browser. Imported ComicInfo.xml supplies series, edition, volume, and number; filenames are not guessed. Manual assignments take precedence over subsequent metadata discovery.

## Persistence

The additive authenticated `/api/comic-library` endpoints use a dedicated versioned Drive operation collection. Series, chapter assignments, and reading progress are separate records. Operations have immutable IDs and base revisions; competing edits remain available for explicit resolution. Book ownership is checked before accepting file references. `X-Comic-Account` must match the authenticated identity.

Both clients persist pending changes per account and reuse operation IDs on retries. Device-only chapter references are linked to their Drive IDs after file upload. This does not replace legacy vocabulary/settings collections or move existing CBZ/OCR files.

## Verification on September 9, 2026

- Backend: 59 tests passed across comic library, Drive records, migration, OCR, transport, architecture boundaries, and access control. Includes retry deduplication, conflicts, ownership, and recoverable OCR transport timeout without automatic retry.
- Web: 15 focused tests passed across comic library, archive parsing, CBZ progress restoration, and existing vertical-writing behavior. Final Vite production build passed with existing chunk-size warnings.
- Android: 72 JVM tests passed; debug APK, instrumentation APK, and lint tasks succeeded. Updated APKs installed with `adb install -r`, preserving application data.
- Physical phone: five UI tests passed after unlocking: series continuation/rename/read-state and source browse/download/reader/search/filter regression checks. Seven non-UI device checks passed in the earlier run. Four UI checks in that earlier locked-device run failed because no Compose hierarchy was available; the unlocked run supersedes those failures.
- Actual phone library inspected afterward: existing downloaded books remain visible. The series sync status shows an unconfirmed cloud request because the serving backend has not received the new endpoint.
- In-app browser: generated fixture exercised one-tile grouping, chapter order 2/2.5/10, Continue selection, read-state updates, offline rename, concurrent rename conflict, explicit resolution, and collapsed chapter actions. The fixture uses real UI components with synthetic storage/transport and makes no real Drive requests.

Local evidence is under `.tmp`: `comic-series-web-final-tests.log`, `comic-series-web-final-build.log`, `comic-series-final-android.log`, `comic-series-phone-tests.log`, `comic-series-phone-ui-tests.log`, and `source-phone-update/series-final.*`. The final 59-test backend result was captured in tool output. The reusable browser fixture is `/series-verification.html` on the development server.

## Outstanding release checks

At initial verification, this work had not been committed, pushed, or deployed. The web/backend snapshot is now being committed for a direct main push; this does not establish deployment. The phone still targets the serving production backend; real Android-to-web Drive synchronization has not been verified against the new endpoint. Deploy and smoke-test a candidate backend before promoting matching web/client changes. Verify real-account upload, cross-device progress, offline reconnect, and conflict resolution before calling the cloud rollout complete.

The full frontend application typecheck still fails on existing errors outside these changes, including AppDeps Promise return mismatches, missing AddBookModal OCR state, settings libraryDensity, and older reader/test types. Focused changed-file checks reported no series/CBZ errors. The root references-only TypeScript configuration does not check application sources; use `tsc -p tsconfig.app.json`.

Extended offline edits from multiple browser tabs sharing the same localStorage outbox have not been validated. Browser fixture verification is not proof of live authenticated Drive transport. No production migration or rollback was performed.
