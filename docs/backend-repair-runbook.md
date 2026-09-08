# Backend repair: release and recovery runbook

Local implementation, 2026-09-08. No production records have been exported or imported, and no revision has been deployed by this task. Production source coverage and staging verification remain required. Keep the current Flask architecture.

## Behavior and compatibility

- `/api/vocabulary` and `/api/bookmarks` retain their successful response shapes, string vocabulary IDs, and numeric bookmark IDs. Authentication is required at routes, services, and repositories. Invalid credentials return 401; an absent or another owner's vocabulary record returns 404.
- Backend manual vocabulary and bookmarks use distinct version-1 Drive operation collections. Existing books, settings, library metadata, reader `vocab.json`, and JPDB data are not merged or replaced.
- Google credentials come from the authenticated Clerk identity. Request payloads cannot select another owner or supply a Drive access token.
- Optional `Idempotency-Key` supports safe replay of the same request. Reusing a key for different data returns 409. Creates without a key are supported but must not be automatically retried after an uncertain outcome.
- Operation IDs and record IDs are deterministic for keyed creates. Operations are immutable; materialization deduplicates identical retries and orders mastered updates by Drive creation time, then file ID. Conflicts fail visibly rather than selecting an arbitrary legacy record.
- Every Drive read authenticates and paginates discovery. An identity-scoped content cache is capped at 128 operations / 8 MiB, invalidated on identity changes, and used only after current Drive metadata succeeds. Corrupt or failed reads never authorize replacing a collection with empty data.
- Web guest saves stay in the guest's device namespace. Signed-in local drafts and pending operations stay attached to their originating account. Sync is explicit; signing in does not adopt guest records. A banner and save notifications distinguish device saves from confirmed cloud saves. Discarding drafts affects only that account's pending device operations.
- Authenticated user-key translation, grammar, and mix calls continue without server-key fallback. Server-funded calls and backend OCR return `SERVER_AI_DISABLED` before a provider is invoked. Funded AI and background OCR remain deferred; no shared operational store was introduced.
- Runtime key mutation and dictionary editing return `DEPLOYMENT_MANAGED`. Admin status is masked; kanji search remains available against packaged reference data.

## Release sequence

The workspace contains the full local implementation, not independently deployed releases. Review and stage each gate before proceeding. Do not deploy this entire workspace as an unreviewed production cutover.

1. **Security gate:** real decorators with injected identity providers; anonymous, invalid-session and cross-user tests; valid-owner API contracts; disabled-provider calls make zero requests. Retain this enforcement in every subsequent revision and rollback.
2. **Persistence gate:** use synthetic staging accounts with connected Drive. Test simultaneous independent creates from two clients, duplicate same-key requests, competing mastered updates, lost responses, revoked credentials, reconnect and account switching. Verify actual Drive files and materialized field values. Local fake-transport tests are not proof of live Drive behavior.
3. **Migration gate:** inventory every recoverable source, pause legacy writes, export, reconcile, import and compare. Keep unresolved owners gated and recovery exports retained. Reading remains available.
4. **Runtime gate:** build the image, confirm packaged kanji data, validate provider deadlines and streamed downloads, and run candidate-specific readiness and authenticated smoke tests. Concurrency remains 1 for the current synchronous worker. Measure before increasing it.

## Migration state configuration

`RECORDS_MIGRATION_MANIFEST` is an absolute path to a deployment-managed, protected JSON manifest. It contains Clerk owner identifiers and must not be served as a static asset. Supply it as a mounted deployment secret or another read-only packaged configuration file outside the frontend.

```json
{
  "schemaVersion": 1,
  "readyOwners": ["verified-clerk-user-id"],
  "pendingOwners": ["unresolved-clerk-user-id"],
  "allowNewUsers": false
}
```

`RECORDS_WRITES_PAUSED=true` rejects backend manual vocabulary and bookmark writes with `SAVES_PAUSED`; it does not block reading verified Drive records. Absence of a valid manifest, or an unresolved account, returns `MIGRATION_REQUIRED`. The local checkout deliberately has no ready manifest; new cloud saves are gated and the web app offers explicit local drafts.

Keep `allowNewUsers` false until source coverage has been reviewed. It is not an automatic legacy-account detector. Enabling it allows any authenticated owner not listed as pending to use new Drive collections, so every known unresolved owner must be represented first. Ownerless records remain quarantined independently; never infer their owner from who next signs in.

`/ready` requires auth/provider configuration, valid manifest structure, and the packaged dictionary. It is a configuration check, not proof of OAuth access or migrated data for each user. Per-user migration verification and staging smoke tests are separate gates. A missing manifest intentionally makes readiness fail.

## Inventory and export before retiring anything

Record the deployed revision, traffic allocation, image digest, instance/source identifiers, database locations and backup timestamps. Do not assume one Cloud Run instance's ephemeral SQLite file contains all records. Do not retire a recoverable instance before its records are captured. Record inaccessible or already-lost sources explicitly; never claim complete migration without evidence.

Pause writes on the version actually serving legacy saves before taking the final exports. Deploying a pause flag only to a no-traffic candidate does not pause the old service. If the serving legacy version lacks the pause mechanism, first release a compatible pause/security patch or enforce a narrowly scoped write maintenance gate at the serving boundary. Do not route traffic to an insecure old version during this step.

Use the recovery CLI from `backend/` with the configured Python environment. Paths below are examples to replace with operator-controlled archive paths:

```text
python migrate_records.py export --database /recovery/source-a/app.db --source revision-instance-a --output /recovery/source-a-export.json
python migrate_records.py export --database /recovery/source-b/app.db --source revision-instance-b --output /recovery/source-b-export.json
python migrate_records.py reconcile --exports /recovery/source-a-export.json /recovery/source-b-export.json --output /recovery/reconciliation.json
```

Export uses SQLite's read-only connection and backup API, including committed WAL content, and emits source identifiers, counts and canonical record checksums. Preserve the original database and WAL/backup artifacts too. The tool refuses to overwrite report files. Set restrictive filesystem ACLs before running it, particularly on Windows where Unix file modes alone do not enforce access control. Exports contain private vocabulary, contexts and bookmark notes; do not commit them or put them in public build artifacts.

Reconciliation preserves identical records, quarantines missing owners and conflicting records, and blocks affected known owners. Review all quarantine entries and source counts. Never edit an owner's identity or choose a conflicting payload merely to make reconciliation pass. Retain unavailable-account exports in the protected recovery archive until Drive reconnects.

## Import and reconcile

Provide `CLERK_SECRET_KEY` through the operator's secret environment. The CLI resolves each owner's Google credentials via Clerk; it does not accept owner tokens from exported record data.

```text
python migrate_records.py import --plan /recovery/reconciliation.json --output /recovery/dry-run.json
python migrate_records.py import --plan /recovery/reconciliation.json --output /recovery/applied-state.json --apply
```

The first command only reads. A dry run is not a cutover approval. Apply preflights each owner's existing Drive records, uses deterministic migration operation IDs, rereads Drive and compares every imported field before marking that owner ready. Different target data produces a pending/conflict state. Unavailable accounts remain pending. Rerun with a new report filename after reconnecting; identical operations are safe to replay.

Review the resulting ready/pending manifest against the complete source inventory, counts, checksums and quarantine report. Preserve all reports. Configure the verified manifest, then resume saves only for reconciled owners. Perform a new save, read and mastered update through each affected client before promotion. Explicitly check old numeric bookmark IDs and string vocabulary IDs.

## Deployment and rollback

The deployment script creates a uniquely named no-traffic revision with concurrency 1, retains existing secret mappings, checks that exact candidate's readiness and unauthenticated-route rejection, and promotes only after those checks pass. Candidate tag mismatches fail closed. Do not run the production pipeline until the broader staging and migration gates above have been reviewed; its smoke checks do not replace them.

After the first new Drive write, rollback must target a secured Drive-reading revision. Keep the same verified migration configuration and operation collections. Never switch back to a stale SQLite repository to restore service. If needed, pause saves while investigating and keep device drafts available. Rehearse rollback after a synthetic post-migration write and verify that the new record and mastered state survive.

Retain source exports, manifests and operation files until recovery has been tested. Server keys remain deployment-managed, and funded AI/OCR remain disabled through rollback. Do not clear serving secrets while staging a candidate.

## Error contract

| Code | Meaning and client behavior |
| --- | --- |
| `AUTH_REQUIRED` | Sign in again; do not show cloud-save success. |
| `DRIVE_NOT_CONNECTED`, `DRIVE_ACCESS_REQUIRED` | Connect/reconnect Drive; retain account-specific drafts. |
| `MIGRATION_REQUIRED` | Account awaits reconciliation; preserve device drafts. |
| `SAVES_PAUSED` | Temporary migration pause; reading remains available. |
| `DRIVE_UNAVAILABLE`, `SAVE_UNCONFIRMED` | Outcome unavailable/uncertain; replay only with the same operation ID. |
| `RECORDS_UNREADABLE`, `RECORDS_CORRUPT` | Recovery needed; do not treat as an empty cloud collection. |
| `IDEMPOTENCY_CONFLICT`, `RECORD_ID_CONFLICT` | Stop automatic sync; preserve evidence and resolve the conflicting operation. |
| `SERVER_AI_DISABLED` | Explain unavailable functionality; do not invoke a funded provider. |
| `DEPLOYMENT_MANAGED` | Runtime mutation unavailable; configuration requires deployment. |

See `backend-repair-verification-2026-09-08.md` for local evidence and remaining checks.
