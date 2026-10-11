# Admin AI refresh reliability: final verification

## Scope and checkpoint

M11-D checkpoint: 4cbcc7620eacf2c59e3abd2d52d1637cc1c7b6aa, pushed to origin/m11-production. This targeted AI hotfix remains uncommitted pending approval. No M11-E or deployment.

## Root causes

The input analytics were current. Ollama sometimes cited summary/individual branch facts for aggregate numerical claims, or inferred branch-specific drive activity not established by the context. Evidence validation correctly rejected these outputs. An earlier correction permitted empty sections, producing updated counts without useful analysis; that result is superseded and is no longer accepted as success. Full context also increased local inference latency. Finally, the numeric validator parsed the valid compound quantity "fifty-eight" as "eight"; exact compound parsing now fixes this false rejection without allowing unsupported quantities.

## Files and smallest scoped changes

- backend/src/modules/ai/admin-ai.context.js: compact Generate overview; full Ask context preserved.
- backend/src/modules/ai/admin-ai.schemas.js: contract v9; trusted exact summary, exactly one validated observation in each section, supported references/numbers, compound English quantities and rejection of unsupported branch drive claims.
- backend/src/modules/ai/admin-ai.service.js: select compact Generate context only.
- backend/src/modules/ai/ai.service.js: Admin insight contract alone opts into one bounded correction on schema/evidence failure. Correction uses the same trusted cohort snapshot and summary-only evidence. Validate against the attempt context. Preserve one concurrency slot, total deadline, auth and reset cancellation; no retry on transport/quota/timeout; failed attempts never persist and previous success is retained.
- backend/test/admin-ai.test.js: focused retry, schema, evidence, compound quantities, persistence, cancellation, authorization and context tests.
- docs/ai.md and this report: final behavior and verification.

Student Career, Student Drive, Company Candidate and Admin Ask do not opt into this correction. Their relevant mocked tests pass; prior successful live evidence is retained without more slow generations. No deterministic analytics, eligibility or recruitment code changed.

## Real browser scenario and result

First verified populated insights against 62 eligible / 4 placed / 58 unplaced / 0 pending. After a full pre-scenario 2027 BSON backup, recorded exactly two user-authorized confirmed OFF_CAMPUS FULL_TIME placements through normal Admin UI:

| Student | Employer | Role |
| --- | --- | --- |
| Aarav Mehta (bm01@gmail.com) | Jindal Steel | Graduate Engineer |
| Adarsh Gupta (it06@gmail.com) | Jindal Steel | Graduate Engineer |

Optional salary/location were omitted. The previous insight became stale, as expected. A real Refresh AI Insights button operation then saved a populated fresh result at 2026-10-11T06:16:00.399Z:

> Based on the current PlacementHub data, 6 of 62 eligible students have confirmed placements; 56 remain unplaced and 0 confirmations are pending.

- Highlight: six students secured confirmed offers.
- Concern: fifty-six eligible students remain unplaced.
- Recommendation: support remaining students with targeted preparation and review of skill gaps; advisory, not a measured skills claim.

All three sections have validated summary evidence. Browser reload retains the same saved insight/timestamp; no stale warning or refresh error. Console warning/error log is empty. Read-only API GET returns HTTP 200 and stale=false; authoritative dashboard reads agree on 62 / 6 / 56 / 0. No additional generation was used for persistence verification.

## Checks and preservation

- Focused AI/backend suite: 115/115 passed (mocked inference).
- Focused Admin tests: 32/32 passed, including intentionally wrong evidence, unsupported branch activity, empty sections, quantities and citations.
- Previously completed mocked analytics/report/recruitment sanity: 23/23 passed; untouched business logic requires no repeat broad acceptance sweep.
- AI syntax: 52/52 files passed. git diff --check passed.
- BSON audit: all original four placement records unchanged, including Alpha/Beta; archived 2026 unchanged. Only placementrecords, normal notifications and adminaiinsights changed compared with the pre-scenario backup. Exactly two Jindal records added; six total confirmed records. No reset/reseed, application or recruitment mutation.

## Evidence and review

Evidence root: artifacts/admin-ai-refresh/2026-10-11/. Reproduction and sections-diagnostic.json document rejected output and successful bounded correction. ai-tests.log contains the final 115-test result. Earlier counts-only live-refresh/fresh-insight artifacts are superseded by the populated results.

Final scenario evidence: jindal-scenario/backup/, selected-students.json, data-audit.json, final-api-read.log, final-dashboard-read.log, current-four-populated.png and after-jindal-six-populated.png. Backup BSON is local verification evidence; no restore was performed.

Manual review: open local 2027 Admin Dashboard, read all three populated insight sections and the 6/62 summary, then reload. Another slow generation is unnecessary. Local LLM responses can still fail validation; one retry is bounded, previous success is preserved, and unsupported output is never saved. The hotfix is ready for review, not committed. M11-E has not started.
