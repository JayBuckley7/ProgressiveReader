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
authentication decorator without test bypasses, and CORS headers on the exact
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

- 20 current-backend OCR, transport and bookmark checks passed.
- 14 OCR/transport checks passed against the serving backend source with only
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

## Recovery

Keep the pre-release revision available. An OCR issue should be repaired using
the new image as the base so the OCR endpoint stays readable. OCR sidecars are
immutable and separate from existing book data. Do not deploy the normal full
backend image or perform a SQLite/Drive storage rollback as a shortcut; follow
the migration runbook and reconcile records before that separate cutover.
