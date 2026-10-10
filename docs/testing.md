# Testing Strategy

## Automated checks

Run frontend lint/build checks and backend test/lint checks once tooling exists. Add focused automated tests for registration, duplicate-email prevention, password hashing, login failure/inactive-account behavior, JWT verification, protected-route rejection, role authorization, student-verification transitions and enforcement, eligibility, duplicate-application prevention, ownership checks, recruitment transitions, deterministic dashboard aggregates, and AI-response validation.

## API checks

Use a REST client or Postman collection to test valid input, invalid input, unauthenticated requests, wrong-role requests, ownership violations, Placement Admin-only institution/verification/dashboard endpoints, and non-verified student rejection for each completed API group.

## Manual browser checks

For every milestone, test loading, empty, success, error, and unauthorized states. Verify the full golden placement workflow during final QA using seeded demo accounts.

## Definition of done

A milestone is complete when code is inspected, checks pass, the relevant API works, the frontend flow works, invalid/unauthorized behavior is tested, documentation is current, and the user has manually tested it.


## Final M9B-D closure

- Backend full suite: **329/329 passed**, including social content/media/RBAC, Social/Main Profile privacy and pure reads, notification separation/broadcasts, auth and existing placement regressions. Run from backend: `node --env-file=.env.cycle-2026 --test`. The live historical reconciliation test must target the existing archived 2026 database; other integration fixtures use isolated test databases. A default 2027 environment fails that historical manifest oracle by configuration, not by product behavior. No live seed/reset is required or performed.
- Frontend full suite: **68/68 passed** via `npm test`, including placement-cycle, Community behavior/navigation and profile/editor tests.
- Backend static check, frontend lint/build, and repository diff check passed. Six pre-existing lint warnings and the existing large-bundle advisory remain.

Browser smoke passed on current 2027: Student Dashboard, existing Profile editor, Placement Center, an existing confirmed application's Journey, and Community; Company Dashboard, Drives, Candidate Explorer and Community; Admin Dashboard, Students, Companies, Reports and Community. Social author links, Company Main Profile access and Student denial remain working. Admin Main Profile access is covered by prior live checks and the full permission suite. Feed/Article tabs, text-only Article rendering, search, Oldest ordering and Load More (10 to 12 unique entries) passed. At 390px the Feed image fit inside its card and the page had no horizontal overflow. Community inbox detail links and Placement inbox separation were checked independently.

Mandatory Feed image, retained/replaced image and forbidden removal, Article image rejection, Company ownership, Student publishing denial, Admin moderation, role-specific profile permissions, comment/self/like notification behavior, broadcast audiences/default-OFF/create-only behavior, and archived rejection pass the automated suites. Prior block browser checks also verified valid uploads, own edits and controlled broadcasts without altering canonical placement fields.

Integrity checks compare archived 2026 collection hashes, canonical 2027 Student/Company values and source manifest, placement collections, protected document hashes and social references. The original archived comparison detected only institutionprofiles drift. Controlled GET reproduction proved the legacy helper changed only updatedAt; the helper is now pure read and repeated live GETs preserve its hash. All other archived collection hashes match the original baseline. The user accepted this historical metadata-only deviation for closure: the original timestamp cannot be recovered and was never guessed. The read-only [post-fix baseline](integrity/m9-2026-post-fix-baseline.json) explicitly supersedes only the old Institution hash, retains its provenance, and records a semantic hash excluding updatedAt. Baseline recording performs no archived writes.

The independent 2027 audit passed: no canonical/source changes, orphan social images/likes/comments, duplicate likes/broadcast deliveries or Article images. New Social/Main Profile GETs and social saves preserve source documents. Legacy Student/Company placement GET timestamp behavior is recorded separately; the Institution helper was fixed without changing those unrelated helpers.

Two legacy QA alerts still reference excluded Student-authored test posts. These are retained and reported rather than deleting historical QA records. Repeated comments can legitimately produce similar messages and are not classified as duplicate deliveries solely by actor/post. Local screenshots, hashes and QA runners are ignored evidence, not shipped database snapshots.

### Manual review

1. In 2027, check Feed | Articles | Profile | Notifications. Admin/Company can publish one-image Feed and text-only Articles; Students have no composer. Company mutations must be limited to its own content; Admin removal moderates content/comments.
2. Search and switch Newest/Oldest; Load More must append without duplicates and retain items on error. Inspect the compact stream at mobile width.
3. Open an author Social Profile. Company/Admin may open a Student Main Profile; Student may not. Social edits must leave the placement professional profile unchanged.
4. Comment as another user and follow the author's Community alert to detail. Self-comments/likes must not notify. Community read actions/counts and placement inboxes must remain separate. Create broadcasts only intentionally with allowed audiences.
5. Archived 2026 must hide/reject Community and retain historical placement behavior. Do not seed/reset to run these checks.

## Targeted Institution integrity investigation

The old helper was reproduced through three authenticated archived Institution GETs: only updatedAt changed, from 2026-10-09T11:46:21.574Z to 2026-10-09T11:49:34.199Z across the requests. The controlled reproduction was undone using the exact pre-GET document and conditional current-hash check. These timestamps do not establish the original older baseline value. Available older artifacts contain hashes only; the old timestamp/hash is not reconstructed. The user subsequently accepted the metadata-only deviation and authorized the explicit superseding post-fix baseline and M9 checkpoint.

Institution GET now uses findOne with in-memory defaults; explicit PATCH retains validated singleton creation/update. New regression checks cover five repeated HTTP GETs with write-forbidden model methods and unchanged document/hash, plus missing-record defaults without insertion. Targeted Institution/affected callers passed 51/51, read-only historical reconciliation passed 1/1, and frontend cycle checks passed 2/2. The original archived hash comparison still fails only for institutionprofiles. Three fresh-process and three running archived API GETs produced no field differences and identical before/after hashes. No full regression, seed/reset, or guessed restoration was performed.

## Accepted M9 closure baseline

Semantic 2026 integrity is accepted with the documented legacy updatedAt-only deviation; exact equality to the older Institution hash is not claimed. The original local baseline remains preserved. The committed post-fix baseline contains only collection counts/hashes and explains its supersession. No 2026 data was changed during this closure. Minimal final checks rerun the Institution/API regression and placement-cycle tests, static parsing and diff validation; the prior full backend/frontend suites and browser regression remain valid. M10 is not started.

Final closure checks: Institution/API 10/10 and frontend cycle 2/2 passed; backend static checks and git diff --check passed. A subsequent read-only comparison matches all 20 collections in the accepted post-fix baseline. Prior full regression remains backend 329/329 and frontend 68/68, with the targeted post-helper-fix checks recorded above.

## M10-B final local validation

Current architecture and manual operation: see ai.md. Automated provider tests mock Ollama; PDF tests use synthetic real PDFs. Coverage includes exact cycle isolation, private/social exclusions, objective dimension sums, independent rubric bounds/reference rejection, explicit generation/refresh, stale revisions, retained successful assessments on failure, cache authorization/expiry/coalescing and latest-only Ask replacement. Eligibility/Apply tests remain separate.

Live current-2027 resume extraction: extracted 2886 professional characters; no contact/gender/hobby/MBTI pattern found in the safe excerpt. No OCR or full layout/ATS claim. Initial resume-rich Career request timed out at the older 120-second deadline. Redundant objective data was removed from the independent semantic prompt; bounded CPU deadline increased to 180 seconds. Final live measurements/checks are recorded after verification.

Manual review: start Ollama and current backend/frontend; open Dashboard, confirm instant objective dimensions sum, click Generate, wait for separate AI score/timestamp. Refresh must retain old result while disabled/loading. Reload must not generate. Ask two different questions and verify only latest You/AI Coach pair. Repeat on Drive; inspect company/role preparation advice and unchanged eligibility/Apply. Relevant professional/resume changes should show stale/Refresh; unavailable refresh keeps previous AI result and objective score. Archived cycle has no AI UI/routes. No seed/reset.

Prior synthetic qwen3.5:4b benchmark: 4 cases repeated twice, 8/8 structured grounded results, 8–21 seconds, approximately 3.36 GB model allocation and no VRAM. Company/Admin fixtures were synthetic only; no product endpoints.

Final automated checks: current backend regression 387/387 with test concurrency 2, plus the read-only historical reconciliation 1/1 against the archived environment; focused AI 55/55 and frontend 82/82. Unbounded full test parallelism competed with live CPU inference and once exceeded the PDF worker deadline; bounded test concurrency passed without changing production limits. The historical oracle must use 2026 config rather than the default current DB. Backend static/AI syntax 33/33, frontend lint/build and diff checks passed; six pre-existing lint warnings, bundle-size advisory and two existing exceljs/uuid moderate audit advisories remain.

Real Career: objective 95 with exact dimension sum; independent AI 69 using genuine profile/resume work, Generate 145.7 seconds and Refresh 82 seconds. Two real Ask replies replaced one another; timestamp survived reload without inference. Real Drive: objective 19/Low with eligible Apply unchanged; independent AI 60 with documented Node.js projects and the not-documented Java/SQL gap, generation 96 seconds. Two role/company questions received real answers with latest-only replacement. A wording normalization covers unsupported absence phrases such as "you do not yet possess" in prose only; identifiers and rubric values are not rewritten.

Live stale validation temporarily changed only the current student's target role, showed the prior assessment with a refresh warning, then restored the exact value and unchanged verification/review metadata. Genuine Ollama shutdown produced a non-blocking unavailable error, retained the old AI score/timestamp and objective match, and left Apply enabled. Ollama was restored. No seed/reset or archived writes occurred; read-only integrity matches all 20 accepted archived collection hashes. Runtime-local assessment records intentionally disappear on backend restart; a development watcher restart must not be confused with page reload or failed refresh.

Recovered Drive Refresh passed in 118 seconds after restarting the model: old result remained visible while generating, timestamp changed on success, and reload retained that timestamp without fresh inference. The final timeout is bounded at 180 seconds with one generation and no retries; richer Ask responses can be slower than the earlier synthetic 8–21-second benchmark.

## M10-C Company candidate review checks

Focused tests cover approved owned published-drive/application authorization; objective reads without inference; professional/resume allowlists and extraction reuse; independent rubric/schema/reference rejection; refresh retention and stale fingerprints; cache authorization; small-batch limits, serial coalescing, scoped jobs and cached reuse; bounded group retrieval, no matching evidence and 2026 isolation. Frontend covers manual independent scores, refresh retention/duplicate blocking, remount, latest-answer replacement, archived hiding, Explorer actions/filter preservation and batch progress. List Analyze starts one scoped job; completed View AI result opens the existing detail without inference.

Manual test: sign into an approved 2027 Company with actual applicants; select 2–4 candidates on one published owned drive and Analyze Selected. Verify instant objectives, serial progress and individual results as they finish. Open View AI result and check profile/resume-grounded rubric/timestamp; Ask Q1 then Q2, retaining only Q2. Refresh retains old success, changed relevant evidence marks stale, and provider failure preserves objective/previous result. Group Ask must disclose the small retrieved candidate set. No recruitment status/eligibility changes. Switch to 2026: no Company AI UI or routes.

The user specifically authorized approving one existing pending 2027 drive and adding 2–4 normal eligible applications for live checks. CodeHarbor Cloud Engineering Intern was approved/published through Admin endpoints; Kunal Mishra, Sneha Joshi and Aditya Pradhan applied through the normal Student API. No seed/reset or verification/eligibility override. Read-only archived integrity check: 20/20 collection hashes match the accepted M9 baseline.

Live diagnosis: an initial candidate response exceeded two 200-character rubric-reason limits and another failed evidence validation; objective/Company UI stayed usable. Concise field limits and clear drive-role-versus-student-aspiration prompts yielded a successful 2/2 candidate batch. A subsequent group comparison mentioned resume CPI; Company-only resume education/grade filtering and forbidden group-output tests were added before final validation. No validation limits were bypassed to accept those failed replies.
# M10-D Admin validation

Mocked provider tests cover Admin-only active authorization, 2027 model/runtime isolation, allowlisted aggregate loader, M8/report metric reuse, bounded contexts, direct fact intents, schema/reference/numeric/command rejection, independent Ask requests/no history writes, durable latest-result adapter recreation, manual/coalesced generation, stale detection, refresh replacement/failure/storage retention and shared inference limits. Frontend tests cover no automatic inference, Generate/Refresh, retained prior success, stale warning, remount, latest-only Ask, Admin unavailable wording and archived hidden UI. Full current backend regression: 419/419; AI suite includes 17 Admin tests. Frontend: 98/98, including seven Admin tests. AI static targets: 48. Historical reconciliation and 20-collection hash checks are read-only.

Real 2027 Admin validation uses existing 60-student data, 60 eligible/verified, two confirmed eligible placements, 58 unplaced eligible, IT at 20% and institution rate 3.3% displayed. Exact answers disclose ten lowest-rate tied branches (five shown), Nexora's one confirmed Company record, Backend Engineer's one-applicant 100% confirmed conversion with small-cohort caution, and insufficient recorded exits for a reliable funnel drop-off. An existing unused drive title was temporarily changed to verify stale state, then restored exactly; no recruitment/eligibility/student record mutation, seed or reset. Offline Ollama refresh retained prior insight/timestamp and analytics; exact facts remained available and qualitative Ask showed unavailable. Ollama was restored and orphaned workers from prior local tests were cleaned up. Successful local insight calls observed approximately 100–121 seconds; an initial invalid-evidence response was rejected, not saved. Latest-result persistence is checked via page reload, normal logout/login and 2027 backend restart. See m10d-checkpoint.md for final evidence and limitations.


## Post-M10-D AI runtime recovery

Focused mocked recovery tests cover IDLE/BUSY, AbortSignal cancellation, coalesced waiters, pending Company batch cancellation, immediate fresh generation, retained successful Career/Drive/Candidate/Admin results, ignored late responses, normal timeout and independent timeout/grace watchdog. HTTP tests cover Admin authentication, Student/Company denial, strict bodies and independent reset quota. Frontend tests cover confirmation/Cancel, Busy duration/queue labels, reset success and failed-reset retention. Real 2027 browser validation cancelled a running qualitative Ollama Ask, returned to Ready, retained the saved Admin timestamp, and received a fresh genuine model reply after recovery. No seed/reset or 2026 writes; archive hash verification remains read-only.

Final recovery patch checks: backend 428/428, AI subset 96/96, frontend 100/100, AI syntax 50/50, backend syntax, frontend lint/build and whitespace diff checks passed. Six pre-existing frontend lint warnings and the existing bundle-size advisory remain. Archived integrity: 20/20 collection count/hash pairs match the accepted M9 baseline. Final 2027 backend reload reads the existing 7:15:19 PM Admin insight without inference.
