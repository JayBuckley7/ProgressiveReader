# Web and shared OCR release

This release publishes the current web UI, CBZ reading, Android-uploaded Drive
book discovery, local browser OCR, and authenticated OCR sidecar synchronization.
Android source browsing remains in the Android app.

## Release boundary

Production was serving revision `progressive-reader-00119-sh9`, based on
`217e783d907e0e513141867b566a425c772ee251`. The normal current Dockerfile would
also activate the later saved-record persistence migration, which has not been
reconciled against recoverable production data. That cutover is not part of this
web release.

`ci/prepare_web_release.py` creates an allowlisted build context under `.tmp`.
It builds the web assets with production public configuration from Secret
Manager and overlays the OCR route, its dependencies, CBZ bookmark schema,
authentication decorator without test bypasses, CORS headers, and raw gzip
dictionary delivery on the exact
serving image digest. The original container wiring and existing repositories
remain in place. The shared operation-storage module is an OCR dependency;
copying it does not select it as the book/vocabulary repository.

Base image:
`us-central1-docker.pkg.dev/floofgg/progressive-reader/progressive-reader@sha256:6f92326eb0b4706f013854216051c8fade52cbe1e62373da10a601d88f4fa486`

The full backend ownership, funded-AI, and persistence overhaul in `28d7fe5e`
is still a separate rollout. This image is not evidence that that rollout or
its production migration gates have completed. Existing server SQLite storage
remains ephemeral; this release does not improve its durability. OCR sidecars
and library files use each authenticated user's Google Drive.

## Checks before promotion

- 22 current-backend OCR, transport, bookmark and dictionary checks passed.
- 16 OCR/transport/dictionary checks passed against the serving backend source with only
  the release overlay. Container wiring matched the baseline after normalizing
  archive line endings.
- 45 web tests passed across CBZ archive/rendering, OCR cache/sync, Drive
  discovery, reader navigation, PDF overlay and progress.
- Production Vite build runs in Cloud Build. Existing full-project TypeScript
  alias/test-type failures remain separate; the affected OCR TypeScript check
  passed during implementation.
- Stage a uniquely named revision with no traffic, retain secret mounts and
  service identity, and set concurrency to 1 for the synchronous worker.
- Check the candidate's `/health`, `/drive/health`, HTML, assets, OCR worker,
  anonymous/invalid OCR authentication and CORS before promotion. The serving
  backend has no `/ready` endpoint; do not mistake its SPA fallback for readiness.
- Verify authenticated library/CBZ/OCR behavior on `progressivereader.net`
  after promotion. Clerk production origin restrictions apply to candidate URLs.

The first candidate exposed Werkzeug's automatic `Content-Encoding: gzip` on
dictionary files. Kuromoji decompresses the downloaded bytes itself, so browser
HTTP decoding would break word selection. Explicit `application/gzip` delivery
prevents the extra decoding. A Flask regression test covers the actual response
bytes and headers with the production `static_url_path=""` configuration, and
the release check downloads a real dictionary file. A dedicated runtime route
takes precedence over Flask's root static-file handler.

## Recovery

Keep the pre-release revision available. An OCR issue should be repaired using
the new image as the base so the OCR endpoint stays readable. OCR sidecars are
immutable and separate from existing book data. Do not deploy the normal full
backend image or perform a SQLite/Drive storage rollback as a shortcut; follow
the migration runbook and reconcile records before that separate cutover.

## Production verification

Promoted `progressive-reader-webocr-260909c` to 100% traffic on 2026-09-09
at 05:02 UTC. Ready, ConfigurationsReady and RoutesReady were all true.
Secret mounts, runtime environment and service identity were preserved;
concurrency is 1. The earlier candidate revisions received no live traffic.

Final image digest:
`sha256:b5a315957836a2b7e6a0e659a211ee3e141d0ead4839e271da9d4b8acd235910`

Cloud Build IDs: `e088367e-6c3b-4685-a476-6cf8dd2cee7f` (web/assets),
`362f43b6-615c-4036-b684-3f2077bb5499` (final runtime correction).
Production and candidate serve the same `/assets/index-Na1taN07.js`, SHA-256
`03ed10754d7fc27e7f30122d411553f0ab690db36f3b96a5575ab5f1525c55b8`.
Both passed health, Drive configuration, OCR worker/WASM/dictionary, anonymous
and invalid-token rejection, and CORS checks.

Browser verification used the canonical production domain after Google sign-in:
both Android-uploaded CBZs appeared in My Books; the Japanese chapter opened at
page 2 of 15; enabling OCR reported "OCR saved to Drive"; clicking a recognized
word opened the reader's dictionary popup. After a full reload, enabling OCR
reported "OCR loaded from Drive". Production request logs confirmed PUT 200
followed by GET 200. No JPDB study-state changes were made. Recognition quality
on this manga page remains poor with automatic browser OCR, as already observed
locally; deployment does not improve recognition accuracy.
