# Security Plan

- Hash passwords with bcrypt; never store plaintext passwords.
- Issue short-lived JWT access tokens after registration/login, verify them on every protected request, and load the current active user before authorization. Do not trust a role embedded in an old token without checking the database.
- Allow ordinary registration only for student and company roles. Bootstrap one Placement Admin through the configured `ADMIN_BOOTSTRAP_SECRET`; never commit, return, or store that secret.
- Rate-limit registration and login using configured request-window and maximum-attempt values; return a standard `429 RATE_LIMITED` response when the limit is reached.
- Keep JWT secrets, MongoDB URLs, storage credentials, and OpenAI keys in backend environment variables.
- Authenticate protected routes, authorize roles, and verify ownership of jobs, profiles, applications, posts, and recruitment records.
- Permit only Placement Admins to maintain the institution profile, review student verification, approve companies/jobs, and read placement dashboard aggregates. Enforce verified-student checks in eligibility and application services.
- Validate requests with Zod and enforce model-level constraints with Mongoose.
- Validate resume file type, MIME type, and size before storage.
- Use CORS with the configured frontend URL and rate-limit sensitive authentication and AI routes.
- Return safe error messages; do not expose stacks, passwords, tokens, or private personal data.
- Do not commit `.env` files or real student data. Use demo accounts and sample resumes for presentation.

## M9B Community safety

Publisher-role authorization (Placement Admin/Company) runs before social multipart handling, with service-layer checks. Editing additionally checks ownership before multipart parsing and again in the service. Company may edit/delete only its own Company content; Admin edits Admin content and may delete any supported Community content. Student content mutations are forbidden. JWT identity supplies content/comment authors; request author/role fields are not trusted. Only the exact current 2027 database enables social routes. Social images use a separate configurable directory, random UUID filenames, MIME allowlist, matching file signatures, memory/file limits, path containment, protected reads, and nosniff responses. Client filenames/paths are never used for storage. Failed creates/replacements remove newly stored files; replacement/deletion clean old Feed images. Existing resume and company PDF storage is not modified.

## M9B-A profile privacy and read safety

Social identity and Student professional showcase use separate explicit DTO allowlists, including nested arrays. Every new profile route inherits authentication and the 2027 database guard. Main Profile additionally requires Company/Admin in both routing and service. Existing recruitment document access remains scoped to its original workflows; the showcase never grants document access. New GETs query existing records only and never call legacy timestamped profile/settings upsert helpers. Missing optional values remain display fallbacks. Live targeted before/after SHA-256 snapshots cover users, studentprofiles, companies, and institutionprofiles. Earlier unrelated collection-hash differences are not retroactively resolved by this block.


## M9B-A2 write isolation

Social Profile edits authorize against the current authenticated owner and current target role, never client userId/role. Only the dedicated SocialProfile collection is written. Public contact is explicit opt-in data; authentication/private placement data is absent from response allowlists. Avatars use the existing social signature/type/size/path helpers in a dedicated profile-avatars subdirectory, with profile-specific multipart field limits, protected reads, and replacement/removal/failure cleanup. Feed/resume/company-document storage is unchanged. Current-cycle guards precede all profile processing. Targeted live Social/Main GETs preserved hashes of all five source/social collections; a separate live Social PATCH preserved all four source collections. Broader browser-session hashes changed Student/Company/institution source collections, whose legacy GET helpers still perform timestamped upserts; those unrelated helpers are not rewritten here.

## M9B-C domain isolation

Community notification routes inherit authentication and the exact 2027 guard before reads/writes. Domain scopes are enforced server-side, not chosen by the client; wrong-domain or foreign-recipient mark-read returns 404. Placement dashboard unread counts exclude legacy/new Community records. Company broadcast audience is server-restricted to active Students; sender/role are authenticated. Creation-only broadcast is OFF by default; enabled edits return 422. Feed image existence is checked before storage and at model validation; removal without replacement is rejected, Article images remain rejected, and single-file multipart limits remain enforced. Failed broadcasts roll back new content/image/deliveries. Archived 2026 is not migrated or modified.

## Archived Institution integrity fix

The Institution GET helper previously used a timestamped upsert. It now uses findOne, with unsaved defaults for a missing record; only explicit PATCH may upsert. All existing shared branches/identity/explorer/analytics/report paths inherit this fix. Live archived before/after reads prove only updatedAt changed before the fix and no fields change afterwards. Original pre-change audit artifacts contain hashes, not the document/timestamp: no historical value is guessed or baseline redefined. Only controlled reproduction timestamp changes were restored from their exact saved snapshot.

For final M9 closure the user accepted the known historical updatedAt-only deviation. The committed post-fix baseline explicitly supersedes the old Institution hash; the original hash is preserved as provenance and is not represented as restored. Baseline capture uses raw read-only queries and never writes archived documents.
