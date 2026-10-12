# M11-E cloud readiness

M11-E E1–E5 are complete: storage integration/hardening, inventory/migration tooling, readiness documentation and the successful disposable private-storage check. M11-F can begin after approval. Real file transfer, Atlas contact and public deployment require separate approval. No existing data or files are migrated by installing these tools.

## Environment and delivery

Use Node **24.x**; backend package engines and `engine-strict=true` enforce the supported npm runtime. Local development keeps `STORAGE_PROVIDER=local`, existing upload roots and existing 2027 data; legacy metadata remains readable locally. Ollama remains a local capability. Production rejects local references and never falls back to ephemeral disk.

Production settings are documented in `backend/.env.production.example`: `NODE_ENV=production`, `AI_ENABLED=false`, `STORAGE_PROVIDER=supabase`, HTTPS project-origin `SUPABASE_URL`, backend-only `SUPABASE_SECRET_KEY`, exact `SUPABASE_STORAGE_BUCKET=placementhub-2027`, Atlas `MONGO_URI` with exact database `placementhub-v2-demo-2027`, and `CLIENT_URL=https://your-frontend.example.com` until the Vercel origin is selected in M11-F. Use a strong backend JWT secret. No real credentials belong in tracked files or `VITE_*` variables.

The Supabase bucket must remain private; the adapter checks privacy before each operation. No public or signed URLs are returned. Existing authenticated backend routes authorize each document/image read before storage access. DTOs exclude provider/key/path details. Existing MIME/signature, size limits and image `nosniff`/private-no-store headers remain. Production AI remains Coming Soon.

## Read-only inventory

Run from `backend/`, with the existing ignored `.env` and `.env.cycle-2027` files:

```powershell
node scripts/m11e-files.js --dry-run
```

Dry-run is also the default without flags. It permits only localhost MongoDB and the exact 2027 database. It uses native collection projections through an independent connection, without application models, index creation, seeds, resets, AI or any Supabase call. It compares projected file metadata fingerprints before/after the scan and reports `databaseReferencesUnchanged`. It reports per-category local/cloud/missing/unsupported/excluded counts, local bytes, unverified recorded cloud bytes, opaque issue identifiers and intended key prefixes. Exit 2 means inventory findings or concurrent metadata changes need review; exit 1 means a safe configuration/connection failure.

Categories: resume, class10, class12, college-result, participation-letter, company-recruitment-information, drive-job-description, recruitment-process-instructions, phase-instruction, placement-proof, feed-image and profile-avatar. Each prefix is `2027/<category>/`; stable UUID-shaped keys derive from collection/record/field identity and SHA-256 content. Original names and absolute paths are not printed.

The E5 local inventory found 107 readable references totaling 6,270,672 bytes, no missing/unsupported/cloud references, no confirmed 2027 orphans, and 97 unattributed unreferenced files in shared directories. Before/after projected metadata fingerprints matched. These figures are a checkpoint observation; rerun dry-run before any future transfer.

Only references in the six current 2027 collections are migration candidates. Articles, external logos, exports, fixture references and archived paths are excluded. M9/reset-owned files are eligible only when actually referenced by current records. Filesystem census checks the configured PDF/social roots without following symlinks or entering 2026/historical directories. Unreferenced files in explicitly 2027 locations are reported as orphans, never uploaded/deleted. Unreferenced files in shared directories are reported as unattributed because their cycle cannot safely be inferred. Already-cloud references are structurally checked without remote reads in dry-run; their existence/integrity is not claimed verified.

## Future migration, retry and rollback

Do not run apply yet. After an authorized Atlas data copy, configure the ignored `backend/.env.m11e-migration` from its example, including a separate `MIGRATION_TARGET_MONGO_URI`. Apply accepts only an Atlas SRV target with the exact 2027 identity. The local development database is never the apply target. Review missing/unsupported/excluded findings and preserve a backup before transfer.

After separate approval, the command will be:

```powershell
node scripts/m11e-files.js --env-file=.env.m11e-migration --apply --confirm=UPLOAD_AND_UPDATE_2027_CLOUD_REFERENCES
```

Pause file edits during migration. The tool validates bounded local content, hashes it, probes a deterministic cloud key, uploads without overwrite only when absent, downloads it and checks exact size plus SHA-256, then conditionally replaces the original Mongo metadata with an additional `updatedAt` comparison. Concurrent application edits/array rearrangements are not overwritten. Other workflow fields/timestamps are not changed. Local source files are never removed; the tool performs no seed/reset, deletes or data-copy operations.

Failures leave database references unchanged. Verified objects from failed DB updates stay available for retry; matching content is reused, so a crash between upload and DB update does not create another object. A conflicting object is never overwritten and requires operator review. Existing cloud references are skipped. There is no automatic cloud cleanup or rollback command. Rollback uses the retained sources and an operator-reviewed database backup; local metadata cannot be served by the production runtime, so keep public file delivery paused until references are restored/repaired. Report objects left after failures before any separately authorized cleanup.

## Disposable Supabase check: explicit approval required

Copy `backend/.env.m11e-sanity.example` to the ignored `backend/.env.m11e-sanity`. Set the actual project URL and backend secret there using a local editor, keeping the other listed settings. Do not change the normal local cycle files. Its local Mongo URI is required only for configuration identity; this command imports no database connector and never connects to MongoDB.

First validate configuration without network access, from `backend/`:

```powershell
node scripts/m11e-storage-sanity.js --check-config
```

It must print `Storage configuration valid. No network calls made.` Then confirm configuration to the agent. After confirmation and approval for the live call, the next command is:

```powershell
node scripts/m11e-storage-sanity.js --confirm=DISPOSABLE_PRIVATE_BUCKET_CHECK
```

The existing cloud adapter uploads one tiny PDF under `2027/m11-e-sanity/`, reads/verifies its bytes, deletes that same UUID object and rechecks bucket privacy. It never accesses PlacementHub records or source assets. Cleanup is attempted even after a failed upload/read; a timeout or cleanup failure is reported safely and requires checking that dedicated prefix before retrying. Automated tests stub every cloud call. Do not run this live command before confirmation.

## Live sanity result

The operator reported the successful live disposable check on 2026-10-12:

```json
{"verified":true,"deleted":true,"privateBucket":true,"bytes":62}
```

The temporary object's contents were verified, deletion succeeded and the bucket remained private. This records only the reported result; no project URL, credentials, environment contents or object key are recorded. No existing PlacementHub files were migrated, and no Atlas connection, deployment, 2026 change or live Ollama inference was performed for E5 finalization.

## Remaining M11-F work

Authorize and verify the actual Atlas data copy and existing file migration; resolve inventory findings. Configure Render/Vercel hosts, backend secrets, CORS/frontend URL, Node 24 runtime and public API URL. Keep the bucket private and production AI disabled. Deploy only the 2027 runtime, then perform separately approved deployment smoke checks. The 2026 archive remains preserved locally. No hosting configuration or deployment is performed in E5.
