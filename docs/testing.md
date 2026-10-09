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
