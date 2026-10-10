# M10-C Company Candidate Intelligence checkpoint

Validated on `demo-2027-m9`, preserving M10-B checkpoint `2a07085`. M10-D has not started. The user authorized commit/push after checks and live validation. No Gemini integration, automatic fallback, package installation, seed or reset occurred.

## Implemented behavior

- Candidate Explorer calculates Objective Match for every authorized application before filtering/sorting/pagination. Bulk professional-profile reads use the existing 60/15/25 matching weights with unavailable dimensions renormalized. No model call or PDF parsing is needed for this score. Name search and branch filters remain available; objective sorting is supported in the table and export.
- Analyze with AI on a list row starts explicit analysis. Analyze Selected with AI queues a small batch; completed rows offer View AI result, opening the existing candidate detail without another inference. Detail retains Generate/Refresh and latest-only Ask.
- Independent AI Candidate Fit uses a validated project/experience/work-evidence rubric with maxima 40/30/30. It includes strengths, not-documented gaps and interviewer focus. It is never combined with Objective Match and cannot alter eligibility, application status or recruitment decisions.
- Context includes allowlisted professional skills, projects, experience, credentials, career direction/presentation, extracted professional resume text, current role requirements and safe stored Company information. No private contacts, gender, avatar, personality, hobbies, Community activity or academic grading enters Company semantic ranking. Company-specific claims must come from supplied platform facts; general technical advice is allowed.
- M10-B backend PDF extraction is reused per resume revision. A Company-specific second filter removes education sections and academic identifiers/grades while leaving Student extraction unchanged. The bounded shared safe-text cache defaults to 100 entries and one-hour expiry. No OCR or raw resume/prompt persistence.
- Refresh retains the previous successful result through loading/failure, records a new timestamp on success and marks changed relevant context/resume fingerprints stale. GET/reload/remount performs no inference. Latest assessments are scoped bounded runtime memory, with 24-hour expiry; restart loses them.
- Explicit batches default to four candidates, with a local Ollama hard cap of five. Limits are configurable behind the generic provider boundary. Each candidate is processed independently through the shared one-generation gate; duplicate work and unchanged successful results are reused. Progress updates as items finish. Jobs are owner/drive scoped and bounded; polling has a separate rate limit.
- Group Ask first retrieves/ranks documented professional evidence, then passes only a small shortlist (default four, local cap five) with compact summaries, at most twelve evidence items and a 650-character resume excerpt per candidate. No matching documented evidence returns without inference. There is no automatic full-cohort LLM scan or conversation database.
- Every access checks active approved Company, owned approved/published drive and actual application. Authorization is rechecked on cache hits, completion and job polling. Inactive drive rows retain normal Explorer access but disable AI actions. Exact 2027 runtime guard is preserved.

## Live validation

At the user's request, one existing CodeHarbor drive was approved/published through the normal Admin workflow, and three already eligible/verified Students applied through the normal application endpoint. Kunal Mishra, Sneha Joshi and Aditya Pradhan remained Applied / Phase 0. No AI hiring action occurred.

- Explorer loaded the three applications with Objective Match in approximately 30 ms, without inference. Foreign-drive candidate access returned 404. Search/filter/sort and list-to-detail result actions were checked.
- Real Ollama individual analysis, successful Refresh, timestamp and retained old result during refresh passed. Sneha's final validated independent fit was 43%, with 18% Objective Match. Extracted professional PDF text was included.
- Individual Ask Q1 and Q2 returned real grounded replies; Q2 replaced Q1/A1 while permanent analysis stayed visible. Reload read the prior result without generating.
- Relevant profile-change stale warning passed; the temporary target-role change was restored exactly, preserving verification/review state.
- A live two-candidate batch completed 2/2 successfully after concise output instructions were tightened. A subsequent run rejected one unsupported-evidence response safely. This is a model-output limitation, not a successful assessment claim.
- Group backend comparison referenced the three retrieved candidates' documented work. ML search returned no documented evidence without invoking the model. An initial comparison revealed CPI from resume education; Company-only filtering and output rejection were added, and the repeat comparison passed without grades.
- Ollama was temporarily stopped for failure testing and restored. Refresh showed unavailable while retaining the prior 43% AI Fit, deterministic score and normal profile/recruitment actions. No permanent mock path was introduced.
- Observed provider durations: approximately 68 seconds for a group answer, 105 seconds for final successful refresh and 111 seconds for a full assessment. CPU contention and output size vary. One active generation and the existing 180-second bounded timeout remain.
- Archived 2026 integrity: all 20 collection counts/hashes matched the accepted baseline using read-only queries. No 2026 AI access or data writes.

## Automated checks

- Current backend regression: 402/402 passed; separate archived reconciliation: 1/1 passed.
- AI tests: 70/70 passed (included in backend regression), including 15 Company tests.
- Frontend: 91/91 passed, including nine Company tests.
- AI static checks: 41/41 passed; backend syntax checks passed.
- Frontend lint: zero errors, six existing warnings. Build passed; existing approximately 788 KB bundle advisory remains.
- Git whitespace/diff checks passed. Automated providers are mocked; resume fixtures are synthetic. A 30-applicant test verifies bulk objective scoring/pagination without extraction or inference.

## Manual demonstration

1. Start local Ollama `qwen3.5:4b`, 2027 backend and frontend; sign in as the approved Company.
2. Open Candidates, select the owned drive and sort by Objective Match. Analyze one row or select two to four applicants and Analyze Selected with AI.
3. Watch progress, then choose View AI result. Confirm separate scores, evidence, timestamp and manual Refresh. Previous success stays visible while refreshing.
4. Ask an individual question, then another: only the latest pair remains. Use group Ask for backend evidence or compare a small relevant set.
5. Missing or invalid model output should display a clear non-blocking state while objective scores and normal candidate actions remain usable.

## Changed files

Backend: `.env.example`, `package.json`, `scripts/check-ai-syntax.js`, `src/config/env.js`; AI routes/service, shared resume extraction and Student controller dependency injection; six new Company AI controller/service/schema/validation/resume/retrieval modules; Company analytics controller/service/validation; archived AI test and new Company AI test.

Frontend: existing Student assessment component optional heading prop, Company Candidate Explorer and applicant detail; new `CompanyIntelligence.jsx`, `useCompanyExplorerAi.js`, Company AI API service and Company tests.

Documentation: README, AI, API, architecture, decisions, roadmap, security, testing and this checkpoint report. No actual environment secrets or ignored live-test helpers are included in the checkpoint.

## Remaining limitations

Local CPU inference is slow and can produce invalid schema/evidence output, which is rejected rather than trusted. Reference validation cannot prove every natural-language claim; Company must verify advisory statements in an interview. Results/jobs/extracted safe evidence are bounded memory, not durable storage. Resume section filtering may omit useful content and is not a perfect arbitrary-prose PII classifier; scanned PDFs have no OCR. Generic provider abstraction remains available for a separately approved stronger provider; no external fallback is active. M10-D awaits separate approval.
