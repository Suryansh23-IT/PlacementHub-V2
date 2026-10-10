# M10-D Admin Placement Intelligence checkpoint

Branch: `demo-2027-m9`; starting checkpoint: M10-C `b893e80`. No M11 or Gemini integration. No seed/reset. Student/Company AI behavior remains intact.

## Architecture and trusted facts

- Admin context/controller/service/schema/intents and guarded persistence live in the existing backend AI domain. AdminCommandCenter embeds a compact feature and shared latest-only Ask with optional Admin wording.
- Reused M8 `getAdminAnalyticsDashboard`: cohort/eligible placement rates, confirmed outcomes, packages, branch/company performance, recruitment counts, monthly activity and current application funnel. No duplicate placement-rate/package calculation.
- Exported existing unchanged reporting `driveCounts` and `phaseSummary` for actual drive outcomes and phase-history exit/advance counts. Phase snapshots are not treated as sequential drop-off; different drives' phases are not equivalent.
- Supplemental fixed projected reads aggregate verified profiles, branch application participation, structured applicant skills and drive skill demand. No cohort PDF extraction, Student names/IDs, contacts, social/personality/gender data or GPA enters the model context. Branch is used for institutional aggregates only.
- Model context is compact: up to twenty branches, eight Companies, ten drives, six skill/demand rows and six timeline periods. Coverage and metric limitations are supplied. Full trusted facts drive exact intents and canonical stale fingerprints.
- Only backend selectors read MongoDB. User/model text cannot construct or execute a query. The provider receives facts and a bounded question, with no tools or DB/model handles.

## Permanent insights and Ask

No Admin AI score. Manual Generate/Refresh returns a short summary, highlights, concerns and recommendations with known fact references. Zod bounds fields/arrays; generation schema constrains references. Backend rejects unknown refs, unsupported numeric claims and DB-command content. These checks supplement grounding but do not prove every semantic statement; local-model advice must be reviewed.

Only latest successful whole-2027 insight persists in `adminaiinsights`: structured insight, analyzedAt, SHA-256 facts/provider/contract fingerprint and provider/model/version metadata. No prompts/raw facts/questions/conversation history. The model is registered only after the exact 2027 runtime guard. GET/reload/login/restart never generate or overwrite. Failed refresh/storage failure retains prior success. Relevant changes mark it stale; refresh is explicit. All domains share the existing one-generation gate and 180-second local timeout, with no external fallback.

Bounded exact intents directly answer branch placement-rate rankings, Company confirmed-record rankings, drive application/conversion comparisons, recorded phase exits, unplaced eligible counts and professional skill tags. Ties, denominators and small cohorts are disclosed. Exact answers remain available offline. Other questions use bounded aggregate context for qualitative reasoning. Latest Q2 replaces Q1/A1; no message database.

## Live evidence

- Real whole-2027 analytics: 60 students, 60 eligible/verified, two placed eligible, 58 unplaced eligible; institution rate 3.3%, IT rate 20%.
- Lowest branch answer disclosed ten tied zero-rate branches and showed five. Company answer identified Nexora's one confirmed Company record, explicitly not unique hired count. Drive answer showed Backend Engineer's 100% confirmed-offer/application conversion with one-applicant/small-cohort caution. Funnel answer correctly said no recorded phase exits support a reliable drop-off.
- Real insight Generate and Refresh succeeded, with old result visible while refreshing and timestamp replacement. Successful provider calls observed approximately 100 and 121 seconds. Initial invalid evidence was rejected without a write; guidance/reference constraints were tightened.
- Page reload and 2027 backend restart read persisted insight without inference. A controlled title change to an existing unused drive marked the retained insight stale; original title was restored exactly and stale became false. No student verification, eligibility or recruitment changes.
- Normal logout/login preserved the final insight and identical analyzed timestamp without a model call. Final real qualitative Ask recommended focusing on active Cloud Engineering and Backend Engineer drives to convert applicants into confirmed offers; it took approximately 74 seconds. Q2 replacement was verified against exact factual answers while the permanent insight stayed visible.
- An earlier qualitative answer asserted stalled progress from snapshots. A targeted unsupported-timing guard and conditional recommendation guidance were added, regression passed, and the final live answer no longer made that claim. Model interpretation remains advisory rather than a verified causal finding.
- Ollama offline Refresh retained previous saved insight/timestamp; qualitative Ask showed clear unavailable/cooldown. Deterministic analytics and exact questions remained usable. Local Ollama was restored with one active generation; verified orphaned workers from previous local tests were removed to reclaim RAM.

## Checks

- Full current backend regression: 419/419. Separate archived reconciliation: 1/1.
- AI: 87/87 (included in backend count), with 17 Admin tests.
- Frontend: 98/98, with seven Admin tests.
- AI syntax/static: 48/48. Backend syntax check passed. Frontend lint/build passed; six pre-existing warnings and approximately 792 KB bundle advisory remain.
- Read-only 2026 integrity: all twenty collection counts/hashes match the accepted baseline. Archived/unknown apps reject all Admin AI routes and do not import/register AI models/providers/caches.

## Manual demo

1. Start local Ollama qwen3.5:4b, 2027 backend and frontend. Sign in as Placement Admin and open Dashboard analytics.
2. Scroll to Placement AI Insights. Generate explicitly if absent, otherwise Refresh. Observe retained previous result/loading, timestamp and evidence references.
3. Ask a lowest-rate/Company/conversion/funnel question, then a qualitative focus question. Only the latest pair remains; exact facts answer quickly.
4. Reload or log out/in: saved insight remains and no automatic inference runs. Normal dashboard filters operate independently of whole-cycle AI scope.

## Files and limitations

New backend: `admin-ai.context.js`, `admin-ai.controller.js`, `admin-ai.intents.js`, `admin-ai.model.js`, `admin-ai.schemas.js`, `admin-ai.service.js`, `test/admin-ai.test.js`. Updated AI routing/test/static commands, archived isolation test and report helper exports.

New frontend: `features/ai/AdminIntelligence.jsx`, `services/admin-ai.service.js`, `test/admin-ai.test.js`. Updated AdminCommandCenter and shared Ask optional wording/source indicator; Student/Company defaults remain unchanged.

Updated documentation: README, roadmap, AI, API, architecture, decisions, security, testing and this checkpoint. Environment secrets and ignored validation helpers are not committed.

Local CPU inference remains slow and variable; invalid schema/evidence is safely rejected. Reference/numeric checks do not establish full semantic proof. Insight wording can summarize only part of the supplied cohort and should not replace authoritative tables/exact answers. Existing Company metrics count offer records, not unique hires; small active cohorts and absent completed drives limit comparisons. Fixed keyword intents are intentionally bounded; unmatched questions may require a slow model answer or report insufficient information. Only the latest Admin insight is durable, with no historical versioning; Student/Company persistence architecture is unchanged. M11 and cloud-provider integration require separate approval.
