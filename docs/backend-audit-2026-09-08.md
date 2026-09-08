# Backend audit — 2026-09-08

## Scope and conclusion

Reviewed current local backend routes, authentication, SQLAlchemy repositories, provider adapters, composition root, Dockerfile, and deployment script. Ran the existing backend suite and isolated exploit reproductions with synthetic SQLite data and stub providers. No production probing, real provider calls in the reproductions, or backend code changes. Deployed revision and infrastructure overrides have not been verified.

Keep the modular Flask backend. Its domain/service/adapter boundaries are useful, but authorization, durable storage, workload execution, and configuration ownership need repair before further feature work. These are operational and security defects, not merely style concerns.

## Findings, ordered by priority

### 1. P1: Anonymous callers can read and change other users' vocabulary

`backend/app/domains/vocabulary/routes.py` uses `optional_auth` for GET/POST vocabulary and PATCH mastered. `adapters/sqlalchemy_repository.py:57` only filters by owner when `user_id` is truthy. At line 87 the ownership rejection similarly runs only for an authenticated caller. Consequently, anonymous GET returns every user's vocabulary (including context and book IDs), and anonymous PATCH updates any selected row. An invalid token also degrades to anonymous through the optional-auth middleware.

Confirmed through actual blueprints, controllers, services and SQLAlchemy with TESTING=False: anonymous GET returned synthetic Alice and Bob rows; anonymous PATCH successfully changed Alice's mastered state. Authentication provider was stubbed to return no identity; no live records were accessed. The repository delete method has the same conditional ownership flaw, but no exposed delete route was found; do not describe deletion as an HTTP exploit.

Fix: require identity at routes and service/repository boundaries, make ownership part of every query, and define any guest collection separately. Add anonymous and cross-user regression tests with production auth decorators active.

### 2. P1: Anonymous callers can read private bookmark notes

`backend/app/domains/books/routes.py` permits anonymous bookmark requests. `adapters/sqlalchemy_repository.py:17` omits user filtering when identity is absent. Knowing a book ID is sufficient to retrieve all stored bookmarks for it, including notes. Confirmed with a synthetic private bookmark via anonymous HTTP GET. Vocabulary leakage can also reveal book IDs.

Fix: the same mandatory ownership policy as vocabulary. Guest reading state should remain device-local or have a separate guest identity, never mean an unrestricted query.

### 3. P1: Public endpoints can spend server-funded AI credentials

`backend/app/domains/translation/routes.py:21,50` permits anonymous use and resolves the server key regardless of identity. Grammar and mix follow the same pattern. OCR routes also use optional auth with a server-configured Vision/Gemini provider. Translation accepts a client-selected model, with no application model allowlist or per-user spending policy. No rate limiter/quota enforcement was found in the application; the global request body limit is 50 MB, not a spending limit.

Confirmed anonymous translation reaches the provider using a synthetic server key, returning HTTP 200. The provider was stubbed; no paid API calls were made. OCR/grammar/mix exposure is established by code tracing, not paid end-to-end execution. Actual external exposure depends on the deployed revision and any gateway controls; the checked-in deploy allows unauthenticated ingress.

Fix: centralize authorization for server-funded usage, enforce per-user budgets and request/model limits, and distinguish supplied-user-key calls from server-funded calls explicitly.

### 4. P1: User data defaults to local SQLite despite multi-instance deployment

`backend/app/bootstrap/db.py:11` defaults to instance-local `app.db`; `backend/config.py` does not load a database URI from environment. `ci/07-deploy.sh` permits 40 instances and does not mount a durable database volume. Vocabulary and bookmarks therefore have no shared persistence in the checked-in default deployment. Requests served by different instances can see different records, and container replacement does not provide an application-level recovery path. The OCR cache has the same locality, though cache loss is less severe than user-data loss.

The app accepts a custom config class, so an independently modified deployment could behave differently. No live configuration was inspected. Startup uses `db.create_all()` rather than versioned migrations, leaving existing schema upgrades unmanaged.

Fix: explicitly configure shared durable SQL storage, migrations, and backup/recovery. Fail startup in production when user data would use an unintended local database. Keep cache persistence policy separate from user-data durability.

### 5. P1: Serving configuration serializes slow work while accepting 80 concurrent requests

`Dockerfile:63` starts one synchronous Gunicorn worker with a 300-second timeout. `ci/07-deploy.sh:35` sets concurrency 80. Translation streaming and PDF OCR run in that request worker; a single long request delays unrelated API requests on that instance. JPDB `review_card` calls `requests.post` without an explicit timeout (`adapters/jpdb_http.py:180`). Clerk timeout wrappers create uncancelled daemon threads (`utils/timeout.py`), so timeout returns do not bound outstanding downstream work.

Fix: align container concurrency with actual worker capacity, give provider calls explicit deadlines, and move whole-document OCR into bounded background jobs with status/results. Design streaming capacity deliberately. Avoid blindly multiplying workers while each loads large models or datasets.

### 6. P2: Admin key mutations are process-local and revert on worker replacement

`backend/app/adapters/memory_key_pool.py` stores mutations only in a Python list. `container.py` reconstructs the list from configured secrets at startup. A removed key can remain active on other instances and reappear when a worker restarts; added keys vanish. Gunicorn already recycles workers after roughly 500 requests. The configured fallback key is separate from the removable pool.

Fix: give credentials one durable source of truth with a defined refresh/revocation mechanism. Return masked identifiers to the UI rather than listing full key material. Do not imply that removing a key from this UI revokes it at the provider.

### 7. P2: Kanji administration targets a source file absent from the final image

`backend/app/settings.py:150` resolves the default dataset under `frontend/src/data/jlpt/kanjiapi_full.json`. The final Docker stage copies backend code and built frontend assets, not that source path. Unless KANJI_DATA_PATH and a dataset are separately supplied, admin search/update cannot find the file. Even when present, updates rewrite the whole JSON in place without atomic replacement or shared persistence, and do not update the dictionary already compiled into frontend assets.

Fix: package read-only reference data explicitly and persist editable JLPT overrides separately. Define how the frontend receives those overrides.

### 8. P2: Deployment mutates secrets before staging and promotes after its readiness timeout

`ci/07-deploy.sh:15` updates the existing service with `--clear-secrets` before the subsequent no-traffic deployment. This defeats the script's stated intent to stage all changes without affecting the existing service configuration. At lines 76–81 it explicitly proceeds to traffic promotion after its own readiness check times out. Platform readiness checks may still reject/hold a bad revision, but the script's application validation is not a gate.

Fix: configure the candidate revision in one deployment operation, validate that specific revision, then promote only on successful checks. Avoid a preliminary service-wide secret-clearing update.

### 9. P2: Green route tests bypass authentication and authorization

`backend/app/utils/clerk_auth.py:52,76,94` automatically supplies a test user and skips real checks whenever TESTING=True, including admin checks. Existing route tests commonly enable that flag. This explains why the suite does not establish that anonymous/cross-user requests are rejected. Provider unit tests help but do not cover enforcement across real routes and repositories.

Fix: inject fake identity providers in tests while executing the real decorators, and assert anonymous, wrong-owner, non-admin, and authorized behavior. Retain the architecture import-boundary tests; they are useful but address a different failure class.

## Additional cleanup

- Auth/settings routes exist but `bootstrap/wiring.py` does not register their blueprint. Confirmed by inspecting the registered URL map. The current frontend settings adapter uses Google Drive JSON, so this is stale API surface rather than proof that current settings saving is broken. Remove or intentionally support it.
- CORS allows all origins but omits PATCH, used for mastered updates. Cross-origin direct API clients can fail preflight; same-origin production/proxied development requests avoid that problem.
- Drive download requests use `stream=True` but then materialize `response.content`, so large downloads are buffered in worker memory.
- OCR cache insert uses a read-then-insert pattern against a unique key; concurrent identical requests can race when concurrency is increased. Use an upsert/conflict-recovery path.
- Health reports key presence rather than database/provider readiness. Separate lightweight liveness from useful readiness checks.

## Validation

- Existing suite: **77 passed, 5 skipped**. Initial run had one Windows temporary-directory permission error; rerunning with a dedicated workspace basetemp passed.
- Command from backend: `..\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --basetemp=../.tmp/backend-audit-pytest-20260908`.
- Suite output: `.tmp/backend-audit-tests.log`.
- Offline reproduction script: `.tmp/backend_audit_repro.py`; five assertions confirmed anonymous vocabulary read, anonymous vocabulary mutation, bookmark disclosure, server-key translation selection, and omitted auth/settings registration.
- No production exploitation or deployment verification. No inference that the checked-out code is necessarily the deployed revision.

## Recommended sequence

1. Patch ownership enforcement and server-funded endpoint access, with meaningful security regressions.
2. Establish durable user-data and credential storage and migrations.
3. Correct worker/concurrency settings and provider deadlines; isolate long OCR jobs.
4. Repair deployment gates and dataset packaging; retire stale API paths.

This needs backend hardening and focused architectural changes within the existing modular monolith, not a framework rewrite or a microservice split.
