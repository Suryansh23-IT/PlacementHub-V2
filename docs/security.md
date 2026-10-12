# Security Policy and Design

PlacementHub-V2 is functionally complete through M0–M11 and deployed for the 2027 placement cycle. This document combines vulnerability-reporting guidance with current production boundaries and preserved security checkpoint evidence.

## Supported versions

| Version / Branch | Support |
| --- | --- |
| `main` | Current finalized application |
| `m11-production` | Production delivery branch |
| Other development branches | Best effort |
| Older archived branches | Historical reference; not maintained for public deployment |

The 2026 archive remains protected and local-only; its preservation does not imply an actively supported public runtime.

## Reporting a vulnerability

Report vulnerabilities privately to the project maintainer. Do not publish sensitive details in a public GitHub Issue. Include a clear description, reproduction steps, the affected feature/route, expected versus actual behavior, sanitized screenshots/logs if useful, and a suggested fix if available.

Never include passwords, JWTs, secret keys, database credentials or private Student data in public reports. Allow reasonable time for investigation and remediation before public disclosure. Good-faith security reports are appreciated.

## Current production boundaries

- **2027 only:** Vercel hosts the React frontend, Render hosts the Express backend, and MongoDB Atlas stores application data in the exact database `placementhub-v2-demo-2027`. Startup rejects another database identity. Public cycle/session/API normalization resolves stale 2026 selections to 2027 without deleting archived local state.
- **Private storage:** Supabase Storage uses the private `placementhub-2027` bucket. PDFs, Community images and avatars are delivered through authenticated backend routes after existing role/ownership/domain authorization. No public/signed storage URLs or provider/object-key details are returned in API DTOs. Production rejects legacy local references and never falls back to local disk; local development retains filesystem compatibility.
- **Upload and replacement safety:** Existing field names, size limits, MIME/extension/signature checks and workflow authorization remain. Replacements save the verified new reference before removing the old file; failed database saves clean only the newly stored file. Old-file cleanup failures do not undo committed state. Placement proofs remain append-only. Image delivery retains `nosniff` and private/no-store behavior.
- **AI separation:** Production enforces `AI_ENABLED=false` and displays Coming Soon. Domain/shared-service/provider guards prevent disabled inference independently of UI. Local 2027 AI uses Ollama (`qwen3.5:4b`) behind the backend and remains advisory only; deterministic eligibility and placement decisions stay authoritative. Production has no Ollama or Gemini inference dependency.
- **Archive protection:** 2026 uses a separate local backend/database. Production routes do not expose it; current-cycle workflows and migration tools do not authorize archived-data modification.

M11-F3 production database startup logs only connection-attempt/success markers and allowlisted failure categories, never provider messages, credentials or cluster hosts. A 15-second total connection deadline covers pre-selection DNS stalls; five-second driver selection/connect limits fail earlier where possible. Startup exits on failure before opening HTTP, while local connection behavior remains unchanged.

M11-F3 configures Express proxy trust to exactly one hop in production for Render's reverse proxy. Development/test retain `trust proxy=false`; authentication rate limits use the socket IP locally and the nearest forwarded client IP in production, ignoring additional forwarded addresses. Keep the production service behind Render's proxy and verify per-client authentication limits during deployment smoke testing.

See [M11-A environment boundaries](m11a-foundation.md), [M11-E storage readiness](m11e-cloud-readiness.md) and the [current README](../README.md). These checkpoint documents retain their original phase context.

## Security areas and secrets

Security-sensitive areas include authentication/JWT sessions; Student, Company and Placement Admin role/ownership checks; private uploads; recruitment/placement records; verification/approval; AI context privacy; and placement-cycle isolation.

Never commit real secrets or private Student data. This includes `JWT_SECRET`, `ADMIN_BOOTSTRAP_SECRET`, MongoDB credentials, `SUPABASE_SECRET_KEY`, access tokens and other API keys. Store actual values only in gitignored local environment files or backend hosting secret settings; tracked examples contain placeholders. Backend credentials must never appear in `VITE_*` variables or frontend bundles. Use fictional demo accounts and sample documents for presentation.

## Authentication and request safeguards

- Hash passwords with bcrypt; never store plaintext passwords.
- Issue short-lived JWT access tokens after registration/login, verify them on every protected request, and load the current active user before authorization. Do not trust a role embedded in an old token without checking the database.
- Allow ordinary registration only for student and company roles. Bootstrap one Placement Admin through the configured `ADMIN_BOOTSTRAP_SECRET`; never commit, return, or store that secret.
- Rate-limit registration and login using configured request-window and maximum-attempt values; return a standard `429 RATE_LIMITED` response when the limit is reached.
- Keep JWT secrets, MongoDB connection credentials and Supabase secret keys in backend environment variables. No Gemini dependency is required.
- Authenticate protected routes, authorize roles, and verify ownership of jobs, profiles, applications, posts, and recruitment records.
- Permit only Placement Admins to maintain the institution profile, review student verification, approve companies/jobs, and read placement dashboard aggregates. Enforce verified-student checks in eligibility and application services.
- Validate requests with Zod and enforce model-level constraints with Mongoose.
- Validate resume file type, MIME type, and size before storage.
- Use CORS with the configured frontend URL and rate-limit sensitive authentication and AI routes.
- Return safe error messages; do not expose stacks, passwords, tokens, or private personal data.
- Do not commit `.env` files or real student data. Use demo accounts and sample resumes for presentation.

## Historical checkpoint evidence

The following notes preserve the scope and integrity evidence of M9/M10. References to local directories or unchanged file categories describe those checkpoints; M11 subsequently migrated persistent file flows to the shared local/private-Supabase abstraction above. Local AI safeguards remain applicable when explicitly enabled, while production inference remains disabled.

## M10-A AI isolation

Archived/unknown runtimes import no AI router/service/provider/cache through startup and expose no AI routes. Exact 2027 guards also protect factories/access. Nested allowlists exclude identity/private/social/academic/decision fields; bounded professional prose is untrusted, with basic contact/link redaction. Provider has no DB/files/tools; Ollama remains behind the backend; redirects/retries/raw error logs are prohibited. Zod/evidence checks, per-user rate limits, timeout/byte/token/concurrency bounds, coalescing and cooldown isolate failures. Cache stores hashes/validated output/expiry only. Student controllers recheck active ownership/drive visibility on cache hits using read-only projections, never legacy upsert GET helpers. The M10-A foundation introduced no AI database writes, indexes, migrations or seeds; later M10-D adds the guarded latest Admin insight persistence described below.

M10-B permits only Student own-profile professional advice and approved/published drive matches. No supplied actor/profile/query/score is accepted. Domain schemas reject unknown evidence, extra score/eligibility fields and unsupported role suggestions. Deterministic weights never use academics, gender, avatar, social/personality, private contact or Community activity; official eligibility still uses its existing rules outside AI. Resume availability feeds only the objective score. Worker-bounded PDF parsing forwards sanitized allowlisted professional text to local Ollama; contact headers/personal sections/URLs/paths/names are excluded. See ai.md for extraction limits and prose-redaction limitations. Arbitrary prose claims remain a limitation of language generation and do not confer eligibility or alter placement decisions.

Contextual Ask accepts only a trimmed 1–500-character question (no history/control characters/extra fields). Basic contact/link redaction and untrusted DATA_JSON treatment apply; prompts instruct refusal of unrelated/private/social requests, and provider remains tool/DB-free. One bounded structured plain-text answer uses known evidence IDs; frontend escapes text, aborts superseded work and hides results on cycle change. Fresh authorization/context is required even for question cache hits. Questions and conversation histories have no database storage. Semantic prompt-injection resistance and factual prose are not guaranteed by schema validation; advice cannot change score, eligibility or recruitment state.

## M9B Community safety

Publisher-role authorization (Placement Admin/Company) runs before social multipart handling, with service-layer checks. Editing additionally checks ownership before multipart parsing and again in the service. Company may edit/delete only its own Company content; Admin edits Admin content and may delete any supported Community content. Students cannot create/edit publisher posts or Articles; authorized likes and comments remain available. JWT identity supplies content/comment authors; request author/role fields are not trusted. Only the exact current 2027 database enables social routes. Social images use a separate configurable directory, random UUID filenames, MIME allowlist, matching file signatures, memory/file limits, path containment, protected reads, and nosniff responses. Client filenames/paths are never used for storage. Failed creates/replacements remove newly stored files; replacement/deletion clean old Feed images. Existing resume and company PDF storage is not modified.

## M9B-A profile privacy and read safety

Social identity and Student professional showcase use separate explicit DTO allowlists, including nested arrays. Every new profile route inherits authentication and the 2027 database guard. Main Profile additionally requires Company/Admin in both routing and service. Existing recruitment document access remains scoped to its original workflows; the showcase never grants document access. New GETs query existing records only and never call legacy timestamped profile/settings upsert helpers. Missing optional values remain display fallbacks. Live targeted before/after SHA-256 snapshots cover users, studentprofiles, companies, and institutionprofiles. Earlier unrelated collection-hash differences are not retroactively resolved by this block.


## M9B-A2 write isolation

Social Profile edits authorize against the current authenticated owner and current target role, never client userId/role. Only the dedicated SocialProfile collection is written. Public contact is explicit opt-in data; authentication/private placement data is absent from response allowlists. Avatars use the existing social signature/type/size/path helpers in a dedicated profile-avatars subdirectory, with profile-specific multipart field limits, protected reads, and replacement/removal/failure cleanup. Feed/resume/company-document storage is unchanged. Current-cycle guards precede all profile processing. Targeted live Social/Main GETs preserved hashes of all five source/social collections; a separate live Social PATCH preserved all four source collections. Broader browser-session hashes changed Student/Company/institution source collections, whose legacy GET helpers still perform timestamped upserts; those unrelated helpers are not rewritten here.

## M9B-C domain isolation

Community notification routes inherit authentication and the exact 2027 guard before reads/writes. Domain scopes are enforced server-side, not chosen by the client; wrong-domain or foreign-recipient mark-read returns 404. Placement dashboard unread counts exclude legacy/new Community records. Company broadcast audience is server-restricted to active Students; sender/role are authenticated. Creation-only broadcast is OFF by default; enabled edits return 422. Feed image existence is checked before storage and at model validation; removal without replacement is rejected, Article images remain rejected, and single-file multipart limits remain enforced. Failed broadcasts roll back new content/image/deliveries. Archived 2026 is not migrated or modified.

## Archived Institution integrity fix

The Institution GET helper previously used a timestamped upsert. It now uses findOne, with unsaved defaults for a missing record; only explicit PATCH may upsert. All existing shared branches/identity/explorer/analytics/report paths inherit this fix. Live archived before/after reads prove only updatedAt changed before the fix and no fields change afterwards. Original pre-change audit artifacts contain hashes, not the document/timestamp: no historical value is guessed or baseline redefined. Only controlled reproduction timestamp changes were restored from their exact saved snapshot.

For final M9 closure the user accepted the known historical updatedAt-only deviation. The committed post-fix baseline explicitly supersedes the old Institution hash; the original hash is preserved as provenance and is not represented as restored. Baseline capture uses raw read-only queries and never writes archived documents.

## M10-C Company AI boundaries

Active approved Company + owned approved/published drive + existing application gate every candidate/context/result/job request, including cache and slow completion. Foreign drive/candidate/job returns no context. Only allowlisted professional fields and safely extracted professional PDF sections enter inference. Names identify group summaries; no branch/gender/photo/social/private-contact ranking. Eligibility criteria are excluded from Company semantic prompts. Bounded batch/job/context/output/timeout/rate limits contain work; no database query generation, hiring decisions or automatic cohort inference. Model prose remains advisory; schema/reference checks cannot prove every semantic claim. Exact 2027 runtime guard also protects Company endpoints and caches.

## M10-D Admin AI boundaries

Admin route role middleware and active-role service checks run before facts/results, again on cache/slow completion and before persistence. The exact 2027 guard precedes Admin model registration; archived/unknown runtimes never import/mount/init it. Whole-cycle context is an explicit aggregate allowlist, excluding individual identity, contacts, academics, social/personality/Community data. Branch is used only for aggregate institutional performance. Supplemental selectors are fixed server code, not LLM/user-generated Mongo. No tools, command execution, recruitment/outcome writes or message-history storage exist. Safe JSON schemas constrain known fact references and bounded strings/arrays; validation rejects unknown refs, unsupported numbers and database commands. These checks are not complete semantic proof; recommendations remain advisory. Failed refresh leaves the durable successful insight intact.


Post-M10-D runtime recovery is authenticated placement_admin-only and exact-2027-only. Status contains operational counters/category/provider only. The strict empty reset action has an independent three/minute rate limit and no record-delete/write capability. Epoch fencing prevents cancelled provider output entering refreshed assessments; prior successful results remain intact. Archived routes/provider/runtime initialization remain absent.
