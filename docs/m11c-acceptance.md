# M11-C defect closure and local acceptance

Date: 2026-10-11. Branch: `m11-production`. Starting/unchanged HEAD: `de46bf5d212441f917beff6681b000a78fb21188`. Changes await checkpoint approval; no commit, push, deployment or M11-D work.

## Scope and evidence

The authoritative scope is the 19 defects in `artifacts/m11b/2026-10-11/defect-inventory.md`. The final report supplies the preserved application state and the coverage matrix supplies prior acceptance evidence. Existing unaffected M9/M10 and M11-B workflows were accepted without another broad browser sweep or live Ollama generation. No AI inference implementation was changed.

Current targeted observations, screenshots, console snapshots, test logs and read-only database audits are in `artifacts/m11c/2026-10-11/`. Artifacts and local runners are ignored by Git; this document preserves the closure summary for the checkpoint.

## Closure matrix

All IDs retain the `M11B-` prefix. All 19 are **FIXED + VERIFIED**; none are deferred. Original totals: HIGH 4, MEDIUM 11, LOW 3, POLISH 1, BLOCKER 0.

Paths below are repository-relative. Each row states the root cause, smallest fix, changed implementation files and targeted verification.

| ID | Severity | Root cause and fix | Implementation files | Verification |
| --- | --- | --- | --- | --- |
| 001 | HIGH | Controlled career-interest input changed from an array to text, then rendered `.join()`. Normalize server arrays once to form text and parse only on save. | `frontend/src/pages/StudentProfilePage.jsx` | Real Alpha typing/save/refresh without blank screen; focused mounted-component test asserts saved parsed list. |
| 002 | HIGH | Verification comparison included generated embedded IDs removed by Zod. Compare allowlisted semester, skill-group and project business values instead. Real evidence edits still require review. | `backend/src/modules/students/student.service.js` | Actual Mongoose/Zod round-trip preserves review metadata; changed project evidence returns pending. Alpha presentation/interests save stays verified after refresh; test text restored. |
| 003 | MEDIUM | Every missing placement record generated a provisional selection label. Derive that fallback only for provisional selections. | `backend/src/modules/recruitment/recruitment-workspace.service.js` | Service tests cover nonselected statuses and provisional label; live rejected/withdrawn rows show actual statuses without the misleading label. |
| 004 | POLISH | Desktop header disabled contained overflow without permitting wrapping. Add desktop wrapping to the existing navigation container. | `frontend/src/layouts/AppLayout.jsx` | Browser 1280×900: document/client width both 1265px; every navigation item within bounds. Policy menu also within bounds. 390×844 retains contained navigation; screenshots saved. |
| 005 | MEDIUM | Bulk selection included exited statuses that cannot advance. Restrict bulk/checkbox selection to active statuses; retain individual rejected/absent Restore controls. | `frontend/src/pages/CompanyPlacementDriveApplicantsPage.jsx` | Mounted component selects only active candidates; live rejected/withdrawn checkboxes disabled and Select allowed actions selects none. Confirmed candidates remain protected. |
| 006 | MEDIUM | Move-back options omitted screening and payload construction dropped numeric zero. Add Phase 0 and preserve `targetPhase: 0`. | `frontend/src/pages/CompanyPlacementDriveApplicantsPage.jsx` | Actual mounted dialog selects Phase 0 and submits numeric zero through the service; existing backend transition tests verify valid backward movement/permissions. No live confirmed/exited journey was reopened merely to test this. |
| 007 | MEDIUM | Unplaced-eligible filtering matched only an exact display stage, excluding unconfirmed offers. Use college eligibility minus confirmed placements for that filter and branch totals. | `backend/src/modules/students/student.service.js` | Focused pending-offer fixture remains in unplaced-eligible rows and grouping, retaining its confirmation-pending display state. Live dashboard/Explorer/report reconcile at 58 after confirmation. Generic Unplaced stage semantics preserved. |
| 008 | MEDIUM | Report input changes retained a preview from another report; missing drive triggered validation. Bind previews to their input key, skip prerequisite-less requests and clear old errors from input events. | `frontend/src/pages/AdminReportsPage.jsx` | Live switch from valid preview to Complete Drive without a drive shows Choose a drive with no old metrics/export. Mounted test asserts no request until a drive is chosen and no stale preview during switching. |
| 009 | MEDIUM | To handler wrote `dateFrom`. Write `dateTo`. | `frontend/src/components/analytics/AdminCommandCenter.jsx` | Mounted real date input changes only `dateTo` in analytics request while preserving From. Native browser editing likewise preserves From; automation cannot reliably complete native date segments, so exact entered-date payload is proved by the interaction test. |
| 010 | MEDIUM | Local midnight serialized as UTC shifted calendar boundaries. Use shared local calendar formatting for presets and off-campus default date. | `frontend/src/utils/calendar-date.js`, `frontend/src/components/analytics/AdminCommandCenter.jsx`, `frontend/src/pages/AdminPlacementOutcomesPage.jsx` | Positive-offset timezone, leap/year boundaries tested. Live This month resolves Oct 1–31; off-campus form defaults Oct 11 without creating a record. |
| 011 | MEDIUM | Successful Admin send refreshed inbox but not sent-history query. Refresh sent history and return to page 1 after each existing send path. | `frontend/src/pages/AdminNotificationsPage.jsx` | One real Admin-to-Company notice immediately appears in Sent without reload; interaction test verifies refreshed paged history. |
| 012 | MEDIUM | Empty history returned before rendering filters. Retain search/filter/recovery controls and show an empty result with 0–0 pagination. | `frontend/src/pages/AdminNotificationsPage.jsx` | Live nonexistent search has empty message, search and Clear filters; component test verifies recovery controls remain. |
| 013 | HIGH | Blank or stale phase was included for non-phase targets and rejected by Zod. Send phase only for a populated phase target. | `frontend/src/pages/CompanyNotificationsPage.jsx` | Real Selected preview without choosing phase returns exactly Alpha/Beta. Component test also switches phase→selected and asserts phase omitted. |
| 014 | HIGH | Notification schema audience enum omitted the already validated Company target values. Add those exact values; recipient authorization contract unchanged. | `backend/src/modules/notifications/notification.model.js` | Actual Mongoose validation accepts all five existing targets and rejects unknown values. Real Selected send creates exactly two recipient notices, reports success, appears in history and reaches Alpha's inbox. |
| 015 | MEDIUM | My Drives reused the screening-only applicant list. Use existing analytics all-phase applicant counts. | `frontend/src/pages/DashboardPage.jsx` | Real Company pipeline and My Drives both show six applicants, two confirmed and zero pending; existing Company analytics/dashboard regression passes. |
| 016 | LOW | Detail navigation lacked actual post type and defaulted to Feed. Track the loaded detail type keyed by post ID and pass it to navigation. | `frontend/src/pages/CommunityPage.jsx` | Native Read Article link, direct detail and refresh retain Articles selected; no Community record was changed. |
| 017 | LOW | Admin outcome lookup did not populate company name. Populate the existing company reference. | `backend/src/modules/placements/placement-record.service.js` | Live confirmed on-campus rows show M11B Acceptance Labs and Nexora; off-campus employer remains FutureVision. HTTP test asserts populated company field. |
| 018 | LOW | Confirmed-offers link opened the default pending tab. Add validated state query and use it for tab navigation. | `frontend/src/components/analytics/AdminCommandCenter.jsx`, `frontend/src/pages/AdminPlacementOutcomesPage.jsx` | Live confirmed query opens four confirmed outcomes and survives refresh; tab clicks update URL. Invalid state defaults safely to pending. |
| 019 | MEDIUM | Student dashboard eligibility omitted the existing confirmed-placement lock dependency. Use the same placement record model and lock flag as authoritative eligibility. | `backend/src/modules/dashboard/dashboard.service.js` | Dependency/zero-eligible regression passes; real confirmed Alpha shows zero eligible drives, Placement Center shows confirmed outcome and other drives blocked. Actual Apply route tests continue blocking confirmed placements, including internship. |

## Automated checks

- Backend: **429/429 passed**, including production-disabled AI, objective scoring, eligibility, role authorization, analytics, reports, recruitment and notification tests. An old outcome-list mock was updated for the new company population and then passed. A sandbox-only loopback denial was rerun with permission; it is not a product failure.
- Frontend: **111/111 passed**. The final report error-clearing refinement additionally passed all **6/6** targeted mounted interaction tests.
- Backend syntax: passed. AI syntax: **52/52 files passed**. No live LLM generation or model benchmark.
- Frontend lint: passed, with six pre-existing warnings; no new warning retained.
- Public production build: passed with public mode, AI disabled and configurable `/api/v1` test placeholder. Existing bundle-size warning remains; deployment URLs were not introduced.
- `git diff --check`: passed.

Backend test selection excludes six existing live-database fixture/integration scripts: `historical-live-reconciliation`, `m7g-integrated-story`, `m7-perfection-five-phase`, `master-m6-tcs-story`, `placement-drive-lifecycle`, and `tcs-smoke-fixture-cleanup`. Those were not executed because they mutate fixture databases; existing M11-B evidence covers the live end-to-end flow. The exact safe selection is saved in `backend-files.json`.

## Final targeted sanity and preserved data

Student, Company and Admin login/session/navigation were exercised while traversing the changed paths. Student profile verification, Placement Center restrictions, dashboard counts and delivered notifications passed. Company candidate states/actions, six-applicant totals, selected preview/send and two confirmed outcomes passed. Admin reports, empty/sent-history states, confirmed outcomes, header and placement counts passed. Targeted console snapshots contain no warnings/errors. Unaffected file storage, uploads, professional/social permissions and AI generations reuse existing M11-B/M9/M10 evidence.

Read-only audit: **62 eligible, 4 placed, 58 unplaced, 0 pending**. Alpha/Beta remain verified and officially confirmed. Fresh drive: **2 placement_confirmed, 3 rejected, 1 withdrawn**. All 2027 applications and placement records match their before hashes; original two placement records also match M11-B backup BSON exactly. Every 2026 collection count/hash matches the before snapshot. No reset/reseed or file mutation occurred.

Intentional local test writes: Alpha profile text was edited, saved and restored through normal UI; generated IDs/timestamps may change but verification and business values are preserved. One Admin-to-Company notice and two Company-to-Student notices were added. Normal profile/Company reads may update existing timestamps. No placement/recruitment record was changed.

M11-A sanity: local 2027/2026 configuration and AI interfaces remain available; the archive was not switched into or mutated. A temporary local public build preview exposes only 2027, renders Admin AI Coming Soon and retains deterministic analytics. Current frontend tests verify stale 2026 state/API/auth normalization and all four Coming Soon areas; backend production tests verify no provider construction/inference and retained objective APIs. The temporary preview was stopped after testing. `/api/v1` remains an environment-supplied pre-deployment placeholder.

## Beginner-friendly review steps

1. Log in as a verified Student. Edit career interests and presentation text; save and refresh. Verification should stay verified. Restore review text afterward.
2. For a placed Student, compare dashboard zero eligible drives with Placement Center's confirmed outcome and other-drive restriction.
3. Open the fresh Company's drive. Compare six applicants with My Drives; rejected/withdrawn/confirmed candidates must not enter active bulk advance. Do not alter the final test outcomes.
4. Preview Selected notification recipients: Alpha/Beta should appear without selecting a phase. Sending creates real notices; use this only if another review notice is intended.
5. As Admin, switch Reports from a valid preview to Complete Drive without a drive. Expect a prerequisite message. Compare Unplaced Eligible with dashboard/Explorer: 58.
6. Check To preserves From; This month uses local calendar boundaries. Follow Confirmed offers to the four confirmed records with actual company names.
7. Search Sent history for nonexistent text; Clear filters must remain available. A newly sent notice should refresh Sent immediately.
8. Open an Article from Community; Articles remains active on detail and refresh. Inspect Admin header at 1280px and 390px.

## Verdict

LOCAL PRODUCT ACCEPTANCE PASS

M11-C COMPLETE — READY FOR M11-D

This closes the recorded local acceptance defects. User approval is still required before a Git checkpoint or starting the next milestone.
