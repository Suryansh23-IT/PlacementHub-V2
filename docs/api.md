# API Conventions

M11-A keeps authenticated 2027 objective AI endpoints when semantic AI is disabled. Student/Company objective responses include ai.status=unavailable, ai.reason=disabled; Ask/group and authorized batch POST return disabled without inference/jobs. Admin exact facts remain; runtime GET/reset return DISABLED. Existing auth/ownership/validation/quota behavior remains. See [full disabled contract](m11a-foundation.md).

## M10-A AI foundation

Only exact database placementhub-v2-demo-2027 registers GET /api/v1/ai/status. Active authenticated Student/Company/Placement Admin required; authenticated-user AI limit returns standard 429 RATE_LIMITED. Success data: { enabled, configured, provider, model, status }, where status is disabled/configured/unavailable. Configured reports selected-provider settings, not live connectivity. No key, endpoint, prompt or cache details are exposed. Ollama is the only provider; no API key or external fallback. Offline Ollama does not prevent backend startup. Archived/unknown runtimes return 404 because no AI routes are mounted. Student endpoints are documented below; Company/Admin features await approval. See ai.md.

## Base URL

All endpoints use `/api/v1`.

## Response format

Successful responses:

```json
{ "success": true, "message": "Job created successfully.", "data": {} }
```

Error responses:

```json
{ "success": false, "message": "You are not authorized.", "errorCode": "FORBIDDEN" }
```

## Status codes

Use 200 for successful reads/updates, 201 for creation, 400 for malformed requests, 401 for unauthenticated users, 403 for unauthorized users, 404 for missing resources, 409 for duplicates or invalid state conflicts, 422 for validation failures, and 500 for unexpected failures.

## Endpoint groups

| Group | Examples |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Student | `GET/PATCH /students/me`, `GET /students/me/identity-context`, `POST /students/me/resume` |
| Company | `GET/PATCH /companies/me`, `POST /companies/me/jobs` |
| Admin | `GET/PATCH /admin/institution`, `GET /admin/students`, `PATCH /admin/students/:id/verification`, `PATCH /admin/companies/:id/approval`, `PATCH /admin/jobs/:id/approval`, `GET /admin/dashboard` |
| Jobs | `GET /jobs`, `GET /jobs/:id`, `GET /jobs/:id/eligibility` |
| Applications | `POST /applications`, `GET /applications/me`, `PATCH /applications/:id/status` |
| Recruitment | `POST /applications/:id/rounds`, `PATCH /rounds/:id` |
| Reports | `GET /reports/placements/export` |

Routes must authenticate, authorize the role, validate input, and check resource ownership before calling the service.

For a published Placement Drive, Placement Admins may manage application intake with `PATCH /admin/placement-drives/:id/application-window/deadline`, `PATCH /admin/placement-drives/:id/application-window/close`, and `PATCH /admin/placement-drives/:id/application-window/reopen`. Deadline and reopen requests use `{ applicationDeadline? }`; an extension must be later than the current deadline and every supplied deadline must be in the future. These endpoints do not modify existing Applications or the Drive lifecycle status.

Placement Admin lifecycle controls are `PATCH /admin/placement-drives/:id/lifecycle/postpone`, `PATCH /admin/placement-drives/:id/lifecycle/close`, and `PATCH /admin/placement-drives/:id/lifecycle/cancel`, each with `{ reason }`. Postpone and close accept only a published Drive; cancel accepts a published or postponed Drive. Close uses the existing terminal `completed` lifecycle status, freezes recruitment activity, and retains Applications, history, and reports. Repeating the same action is idempotent. Active applicants receive one contextual notification, while Applications and recruitment history remain unchanged.

Notification history is read-only: `GET /admin/notifications` and `GET /companies/me/notifications` return received items for the authenticated account, while `/admin/notifications/sent` and `/companies/me/notifications/sent` return one grouped item per notification send action, with recipient and read totals. Student notification routes remain received-only.

M7C Company execution endpoints are nested under `/companies/me/placement-drives/:id/recruitment`: phase setup/PDF, phase recipient preview, `GET /candidates/export?phase=N` or `?selectedOnly=true`, and `POST /companies/me/notifications/phase-candidates`. The notification request includes a UUID request ID for retry-safe batching. Students can read only `/students/me/applications/:id/current-phase` and its current-phase PDF download; neither accepts a Company phase number.

M7D adds `GET /students/me/applications/:id/journey`. It returns only the authenticated Student's application, safe phase-history events, the approved blueprint, and execution details for the Student's current active phase. It never exposes future-phase execution resources, raw storage paths, other candidates, or internal notes.

M7E adds `POST /students/me/applications/:id/placement-report` and a PDF-only `POST /students/me/applications/:id/placement-proof`. Both require the Student's own provisionally selected Application. Placement Admins use `GET /admin/placement-outcomes`, `PATCH /:id/confirm`, and `PATCH /:id/decision` for pending, confirmed, rejected, and revoked outcome records. Proof downloads remain role/record-owner scoped.

## Authentication and RBAC

Company-owned profile responses from `GET/PATCH /companies/me`, Participation Letter upload, and `POST /companies/me/approval/resubmit` include `isProfileComplete`, calculated by the existing Company completion service. The Company UI uses this saved-profile result for completion and approval controls.

Company profiles begin `pending`; complete pending profiles are already reviewable. The initial Submit for Approval action saves the current details through `PATCH /companies/me`. There is no separate draft or initial-submit transition. Rejected companies save corrections and explicitly call `POST /companies/me/approval/resubmit` to return to `pending` and clear previous review metadata.

`POST /auth/register` creates student or company accounts and returns a JWT access token plus safe user data. `POST /auth/login` does the same after credential verification. `GET /auth/me` requires a valid bearer token and returns the current active user. Password hashes are never returned.

The `placement_admin` role is not available through ordinary registration. It can create one initial Placement Admin account only when the configured `ADMIN_BOOTSTRAP_SECRET` is supplied; the secret is never returned or stored. Authentication loads the current user from the database for each protected request, so inactive accounts and changed roles cannot continue using a previously issued token.

Registration and login use the configured authentication rate limit and return `429 RATE_LIMITED` after too many attempts.

## Placement Admin responsibilities

Recruiter policy management: `GET/PUT /admin/recruiter-policy` lists versions or creates a version/changes its active flag. `GET /admin/recruiter-policy/companies/:id` returns the current active-policy agreement summary for a Company user. These routes require Placement Admin access; no Admin acceptance/override endpoint exists.

Approved Companies use `GET /companies/me/policy` and `POST /companies/me/policy/accept`. Acceptance requires `{ policyId, policyVersion, agreed: true }` matching the currently active policy. Pending/rejected Companies receive 403; duplicates or stale policy references receive 409. No active policy returns null policy/acceptance on GET and 404 on acceptance. Acceptance does not modify Company approval or completion.

The dedicated Company review page uses the existing `GET /admin/companies` data and `PATCH /admin/companies/:id/approval` decision endpoint. `GET /admin/companies/:id/participation-letter/download` allows only authenticated Placement Admins to retrieve a company's existing letter through the shared document service. The ID identifies the Company user and is validated before lookup.

Only a Placement Admin may read or update the singleton institution profile, list students for review, change a student verification status, approve companies/jobs, and read the placement dashboard. An Admin can review only `pending -> verified` or `pending -> rejected`; it records the reviewer and optional rejection reason. A rejected Student who has corrected the required academic details and resume may explicitly call `POST /students/me/verification/resubmit`, which changes `rejected -> pending` and clears the previous reviewer, review time, and rejection reason. Verified profiles are final for this workflow.

Student profile responses expose the student's own verification status. Placement eligibility and application services must reject non-verified students with a consistent `403` response and a clear verification-status message. Browsing jobs, editing a profile, and managing resume metadata remain available to pending/rejected students.

`GET /admin/dashboard` returns deterministic aggregates: total students, verified students, approved companies, published jobs/drives, total applications, distinct placed students, placement rate, package statistics when placement records contain package values, and a date-descending recent placement/recruitment activity list. Placement rate is `distinct placed students / verified students * 100`; it is `0` when there are no verified students. Package statistics use PlacementRecord package values only. No AI output is used.

## M9B Community API (2027 only)

All `/social` endpoints require authentication and the current 2027 database. Archived routes return 404 before processing uploads. Under `/api/v1`:

| Method/path | Access / behavior |
| --- | --- |
| GET `/social/posts` | All roles. `contentType=feed|article`, `search` (up to 200 chars), `sort=newest|oldest`, `page` >=1, `limit` 1–25. Defaults feed/newest/page1/limit10. Returns records/page/limit/totalRecords/totalPages. |
| POST `/social/posts` | Admin/Company, 201. JSON or multipart. |
| GET `/social/posts/:postId` | All roles; detail, counts, likedByMe and capabilities. |
| PATCH `/social/posts/:postId` | Admin content or own Company content; full content body, preserving immutable type. |
| DELETE `/social/posts/:postId` | Admin moderation or own Company content; children, notifications, and image cleanup. |
| GET `/social/posts/:postId/image` | All roles, protected image bytes; no public storage URL. |
| POST / DELETE `/social/posts/:postId/like` | All roles; idempotent like/unlike. |
| GET / POST `/social/posts/:postId/comments` | All roles; ascending comments / create with content 1–1,200. |
| DELETE `/social/comments/:commentId` | Comment owner or Admin. |

Feed body: `{ contentType: "feed", content }`, with exactly one mandatory multipart `image` on CREATE. PATCH keeps the existing image or supplies one replacement; removing it without replacement returns 422. Article: `{ contentType: "article", title, content }`, no image. Upload one JPEG/PNG/WebP, default maximum 5 MB. A replacement can accompany an explicit removal intent, but Feed always retains exactly one image. Unknown author/role fields cannot override server identity. Student content mutations and foreign Company mutations return 403; invalid input/images return 422. Search is escaped literal case-insensitive text; Article searches title and body. Ordering uses createdAt plus ID as a stable tie breaker.

## M9B-A: Social and Student professional profiles

The profile block adds pure-read endpoints under the existing 2027-only social router:
- `GET /social/profiles/:userId`: all authenticated roles may view safe role-specific identity.
- `GET /social/profiles/:userId/main-profile`: Company/Placement Admin only; target must be a Student. Students receive 403, including direct URL/API attempts. Existing own-profile editing remains unchanged.

GET requests do not create records; explicit social edits use the separate SocialProfile collection. Read queries use `findOne().select().lean()` without ensure/upsert helpers. Responses explicitly allowlist nested professional evidence and safe HTTP(S) links; no contact, resume/documents, academics, verification, applications, outcomes, auth data, or administrative metadata is returned. Missing source identity detail uses transient display fallbacks, not writes. Missing Main Profile data returns 404.

StudentProfile adds optional `professionalHeadline` (160 characters), `about` (2,000), and `softSkills` (20 entries of 60). They are edited through small additions to the existing editor, do not change verification-critical fields, and require no data migration/population. Skills remain as stored; no inferred soft-skill classification is performed.

Community authors/comments expose safe `userId` alongside existing identity, linking to `/community/profiles/:userId`. The professional showcase is `/community/profiles/:userId/main-profile`. Distinct local SVG Student/Company fallbacks and existing AIT ApexMark avoid external image services. Optional protected avatars use the same shared avatar component. Social summaries remain small; full evidence appears only on the authorized showcase.

Company publishing and separate Community notifications/broadcasts are enabled as documented below. New profile endpoints are unavailable against archived databases, before querying profile data.


## M9B-B Company publishing

Existing `/social/posts` create routes permit Placement Admin and Company. Company PATCH/DELETE requires both Company authorRole and its own authorUserId. Admin PATCH is limited to Admin-authored content; Admin DELETE moderates Admin/Company content. Unauthorized mutations return 403, including image changes. Feed image removal without replacement returns 422. Ownership is checked before multipart parsing. Identity fields in request bodies never replace the authenticated author. Lists/details/images/engagement accept Admin and Company content, keeping existing type/search/sort/pagination behavior. Responses include independent `canEdit`, `canDelete`, and `canModerate` capabilities, plus the existing safe author Social Profile identifier. Student writes remain forbidden and archived-cycle routes remain unavailable.


## M9B-A2 Social Profile editing

`GET /social/profiles/:userId` overlays saved social presentation on safe source defaults, with canEdit/hasAvatar/avatarVersion capabilities. `PATCH /social/profiles/:userId` saves only SocialProfile: authenticated owner or Placement Admin, role-specific strict Zod fields, JSON or single-image multipart. Authorization runs before image parsing and again in the service. Invalid/spoof/private/wrong-role fields return 422; foreign owners return 403. `GET /social/profiles/:userId/avatar` is an authenticated 2027-only protected image response with nosniff and no stored path exposure. Student/Company may replace/remove their social image; Official identity keeps the existing AIT mark. Main Profile APIs remain unchanged.

Student fields: headline, bio, hobbies, interests, softSkills, personalityType, achievementHighlights, clubs, extracurriculars, volunteering, languages, currentlyLearning, lookingToExplore, and links (linkedin/github/portfolio/codingProfile). Company fields: headline/bio, companyName/industry/location/website, hiringDomains, representativeName/designation/publicEmail/publicPhone/representativeNote. Official profile: headline/bio and explicit public representative contact only. No login email/phone is automatically copied into public contact. Limits include 160-character headline, 1200-character bio, 12 tags of 100 characters, six 240-character highlights, explicit MBTI enum or empty, and safe HTTP(S) URLs.

## M9B-C Community notifications

`GET /social/notifications` uses existing notification paging/state/search conventions. `PATCH /social/notifications/:id/read` and `PATCH /social/notifications/read-all` are recipient- and Community-scoped. All require authentication and the exact 2027 database. Existing Placement list/read/count endpoints exclude Community records; Community endpoints exclude Placement. Legacy community_comment type/category is recognized without migrating existing data.

On CREATE only, Feed/Article input may include `notifyCommunity: true` and `audience: students|companies|everyone`; OFF by default. Admin accepts all audiences; Company accepts Students only. Authenticated identity supplies sender. Only active accounts receive broadcasts, excluding sender. Edits reject an enabled broadcast and never resend. Another user's comment notifies the content author; self-comments and likes do not. Community payloads use `domain: community`, `postId` and existing `view_community_post` context. Post deletion also cleans its broadcasts.

Old text-only Feed QA records remain readable without migration; saving one requires adding an image. Article forms/API remain text-only. Social Profile avatar removal remains independently supported.

## Institution read safety

GET /admin/institution and shared Institution reads use findOne only. Missing configuration uses schema defaults in memory without a persisted ID/timestamps. Explicit PATCH creates or updates the singleton with validation; branches, Student identity/explorer, and analytics/report reads share the pure helper in both cycles.

## M10-B Student Intelligence (2027 only)

All paths have /api/v1 prefix; active Student authentication, AI rate limiting and exact 2027 runtime apply. Other roles receive 403; archived/unknown runtimes have no AI routes.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | /ai/students/me/career | Own saved professional readiness calculation; no inference call. |
| POST | /ai/students/me/career/explanation | Empty JSON body; bounded, validated optional career advice. |
| GET | /ai/students/me/drives/:driveId/match | Professional match for an approved/published drive; no inference call. |
| POST | /ai/students/me/drives/:driveId/match/explanation | Empty JSON body; bounded, validated optional match explanation. |

Responses follow the existing envelope with data: { deterministic, ai, basis }. Career deterministic includes score, breakdown, strengths, improvementAreas, suitableRoles, nextLearningSteps, profileSuggestions and scoringVersion. Match includes nullable score, label, skill coverage/evidence and scoringVersion; insufficient requirements includes reason. ai.status is not_requested, available (analysis/cached) or unavailable (sanitized reason/message). No eligibility or application fields are changed. Invalid IDs/input return 422, inaccessible/unpublished drives 404, user limit 429. Provider failures return deterministic evidence with unavailable AI. No client-supplied profile, identity, score or context is accepted; these endpoints perform no database writes.

Contextual Ask: POST /ai/students/me/career/ask and POST /ai/students/me/drives/:driveId/match/ask accept only { question: string } (trimmed, 1–500 characters, no control characters). Response data: { ai }; available analysis: { answer: string (1–2400), evidenceIds: known IDs (max 10) }. Fresh trusted context and current scores are loaded per request; client history/context is rejected. Same authentication, own-profile/drive visibility, rate limiting, isolation and unavailable contract apply. No question echo or conversation record is returned/stored; UI owns a single latest slot independently of permanent analysis.

Career deterministic.breakdown includes eight rows with key, label, maximum, raw points, earnedPoints and advice. earnedPoints is backend-rounded for display, with sum equal to deterministic.score; raw points/weights and existing overall rounding remain unchanged. All zero/partial dimensions are returned and displayed. No frontend scoring calculation is required.
# M10-B independent AI assessment

2027-only authenticated Student POST /api/v1/ai/students/me/career/assessment and /api/v1/ai/students/me/drives/:driveId/match/assessment accept strict empty JSON. Explicitly generate/refresh independent Ollama rubric scores. Response data: unchanged deterministic, ai status/reason, assessment (nullable score/sections/summary/analyzedAt/stale/resumeStatus), resumeStatus and basis. No combined scoring object or decision mutation. Sections contain bounded ratings, validated evidence references and backend earnedPoints/maximum. Failure retains the previous successful assessment. GET returns objective facts/latest assessment without PDF parsing or inference. Ask remains strict { question }, latest-only; current safe extracted resume and richer role/company facts are read independently. No arbitrary document/context/actor/score input.

## M10-C Company Intelligence (exact 2027 runtime only)

All routes below are under authenticated Company-only /api/v1/ai/companies. Owned approved/published drive plus actual candidate application is required. No client-supplied professional context, file path or score is accepted.

| Method | Suffix | Contract |
| --- | --- | --- |
| GET | /limits | Provider-aware batch and retrieval caps. |
| POST | /overview | Strict candidates: [{driveId, studentId}], maximum 100; latest results without inference. |
| GET | /drives/:driveId/candidates/:studentId | Instant objective/latest assessment, stale flag; no inference. |
| POST | /drives/:driveId/candidates/:studentId/assessment | Empty JSON, explicit Generate/Refresh, independent fit; old success retained on failure. |
| POST | /drives/:driveId/candidates/:studentId/ask | Strict bounded question only; latest independent answer. |
| POST | /drives/:driveId/batches | Unique studentIds, bounded provider cap; scoped job/progress. |
| GET | /drives/:driveId/batches/:jobId | Authorized progress and per-candidate completed results. |
| POST | /drives/:driveId/group/ask | Bounded question, deterministic retrieval and small compact shortlist; cited candidate IDs. |

Existing Company Candidate Explorer adds instant objectiveMatch only on 2027 and supports objective_match sorting before pagination. All legacy search/filter/group/decision workflows remain separate. AI is advisory and does not mutate eligibility, applications, recruitment phases or placement decisions.

## M10-D Admin Placement Intelligence (exact 2027 only)

Active Placement Admin authentication and AI-specific rate limiting apply under /api/v1/ai/admin. GET /insights accepts no filters and returns scope, trusted summary, nullable assessment {insight, analyzedAt, stale, provider, model} and not_requested status. No generation/write on GET. POST /insights accepts strict empty JSON and explicitly generates/refreshes; previous persisted insight remains on provider/validation/storage failure. POST /ask accepts only the existing bounded {question}; no history/context/query/identity. It returns {ai}, with source trusted_facts for bounded exact operations or local_ai for qualitative reasoning. Exact operations remain available offline. Unrecognized questions cannot execute DB commands or request raw records.

Insight schema: bounded summary, evidenceRefs and up to two {text,evidenceRefs} highlights/concerns/recommendations. Answer schema: bounded answer/evidenceRefs. References are constrained to supplied facts both in generation schema and backend validation; unsupported numeric claims and prohibited command content are rejected. No Admin score. Persistence contains only the latest validated insight, timestamp, fingerprint and provider/model/contract metadata, never questions/raw facts/prompts/history.


## Admin AI runtime recovery (exact 2027 only)

GET /api/v1/ai/admin/runtime requires active placement_admin authentication and no query parameters. Returns status IDLE/BUSY, category career/drive/candidate/group/admin or null, runningMs, queued candidate count, lastRecoveryAt, provider and model. No task IDs, identities, prompts or context.

POST /api/v1/ai/admin/runtime/reset requires the same role and strict empty JSON. Aborts active inference, cancels pending batches/coalescing and clears shared runtime occupancy/cooldown. Returns IDLE operational state and a recovery message. Successful analyses/caches and database records are preserved. Reset is separately limited to three requests/minute per Admin; status reads thirty/minute. Student/Company access is forbidden and archived/unknown runtimes return 404. Cancelled generations return the existing unavailable response with reason cancelled, and cannot populate a newer result.
