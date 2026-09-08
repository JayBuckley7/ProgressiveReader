# Combined repair PR verification

Includes the backend security/persistence repair, web reader/library/clipboard fixes, Stats consolidation, grammar reading support, JLPT attempt recovery and answer-key import fixes. Integrated main through `217e783d`, preserving its paginated reader, translation segments and precise bookmark locators.

## Merge integration

- Enforced authentication and disabled server-funded access on the newly added segment-translation route; owner-key and existing browser-key flows remain supported.
- Drive bookmark writes and migration exports retain the new precise reader locator. Added replay and migration coverage for these fields.
- EPUB links retain relative-path matching and delayed-surface binding while using the paginated reader's element/fragment navigation.
- Updated upstream route tests to inject authenticated identities and explicit personal keys through real decorators. Fixed the old Admin smoke fixture using an explicit admin port; no production authorization bypass.
- Increased the Stats lazy-loading assertion timeout to tolerate the full suite running concurrently.

## Checks

- Backend: 124 passed, 5 skipped.
- Frontend: 251 passed across 69 files. The earlier Admin smoke and due-card failures are resolved.
- Android: `android.ps1 test` succeeded, including backend response contracts; unchanged tasks were up to date.
- Frontend production build passed, with existing large-chunk warnings.
- Deployment scripts pass Bash syntax checks; running without `_DEPLOY` exits before invoking deployment commands.
- Full TypeScript validation is still not a release-green check: the large kanji dataset and existing project/test typing issues remain. A diagnostic run with a temporary dataset shim was used to catch merge-specific contract errors, not represented as a successful full typecheck.

Logs are ignored local artifacts under `.tmp/pr-*`.

## Production boundary

Push/merge builds an image but does not deploy. `cloudbuild.yaml` defaults `_DEPLOY=false`; the GitHub manual workflow exposes an opt-in deployment input. Existing Cloud Build triggers without an explicit opt-in also remain build-only. Production rollout requires the migration inventory, protected exports, per-owner reconciliation, and live staging gates in `backend-repair-runbook.md`. The PR does not claim those gates have passed or migrate production data.

Older audit/verification documents describe their point-in-time results; this document records the combined PR state. The global migration banner was removed at the user's request, while local-save notifications and backend migration enforcement remain.
