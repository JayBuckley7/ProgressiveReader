# Backend repair verification, 2026-09-08

## Local results

| Check | Result |
| --- | --- |
| Backend pytest suite | 104 passed, 5 skipped. Includes real authentication decorators, signed JWT expiry/tampering, ownership, disabled-provider zero-call checks, Drive multipart protocol/failure/pagination/cache behavior, immutable-operation replay and synthetic migration reconciliation/reruns. |
| Frontend Vitest suite | 99 passed, 2 failed. The two existing failures remain: `vocab.dueCards.test.tsx` and `smoke/AdminPage.test.tsx`. |
| New saved-record frontend tests | 5 passed: guest isolation, interrupted save and same-ID replay, account switching, device storage failure, visible failed-read state. |
| Frontend production build | Passed; existing chunk-size warnings remain. |
| Android JVM unit tests | `android.ps1 test` succeeded: 30 tests across 9 suites, zero failures/errors/skips. Includes numeric/string bookmark IDs and structured backend error contracts. |
| Deployment shell syntax | Both changed scripts checked with Git Bash syntax validation. No deployment executed. |
| Diff whitespace | Passed; Windows line-ending warnings remain. |

Test logs are in ignored `.tmp/repair-backend-tests.log`, `.tmp/repair-frontend-tests.log`, `.tmp/repair-frontend-build.log`, and `.tmp/repair-android-tests.log`. One repeat backend run initially hit sandbox permissions in the shared system pytest temp directory; rerunning with a fresh workspace temp directory produced the passing result above.

The standard TypeScript check remains unresolved: the large kanji JSON exhausts its configured heap. A diagnostic run with only that dataset replaced by a temporary type shim still reports existing project errors. It is not a passing full typecheck and is not a substitute for one.

## In-app browser evidence on localhost

- Existing signed-in library rendered, including the separate reader vocabulary collection (1330 words).
- Manual vocabulary showed a clear migration-required notice instead of silently presenting a successful cloud read.
- Created a temporary manual-vocabulary draft. The UI showed one pending local save and an explicit device-save notification.
- Marked the draft mastered. Both operations remained pending for the same record.
- Explicit sync returned the migration notice and retained the draft without duplicating it.
- Discarded the test drafts; observed zero pending operations and no temporary row afterward.
- Opened the sample EPUB; content, navigation and the table-of-contents drawer rendered.

No real Drive record collection was initialized or mutated in this browser check. The missing migration manifest intentionally prevents that. Library/reader data and legacy SQLite records were not migrated.

## Remaining release evidence

These are open gates, not claimed successes:

- Staging sign-in/sign-out, expired sessions, offline reading and account switching across real web and Android clients. Unit tests cover important boundaries but do not replace device/browser verification.
- Live Drive concurrent writes, revoked-access recovery, lost-response retries, fresh-instance reads and operation discovery under the deployed OAuth configuration.
- Production revision/source inventory and recovery coverage. No deployed revision, production database or backup was inspected during implementation.
- Actual access-controlled exports and per-user imports. Only synthetic migration exports and fake Drive storage were exercised.
- Migration pause on the serving legacy revision, reconciliation, unresolved-account recovery and rollback after new Drive writes.
- Container image build and candidate readiness/smoke tests, including real authenticated owner flows and kanji search.
- Live provider deadline and large streamed-download behavior. Disabled endpoints are tested to invoke zero providers; timeout transport behavior is locally tested/mocked.
- Resolution or explicit acceptance of the two pre-existing frontend test failures and the full typecheck limitation before production promotion.

The work is local and uncommitted, alongside existing frontend fixes. No production rollout, real migration, commit or push was performed. Follow `backend-repair-runbook.md` for staged release gates and the prohibition on rolling back to stale SQLite after new Drive writes.
