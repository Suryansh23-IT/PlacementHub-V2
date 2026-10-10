# M10-B local Student Intelligence

## Provider and isolation

Ollama is the only implemented M10 provider. Backend configuration: AI_ENABLED=true, AI_PROVIDER=ollama, OLLAMA_BASE_URL=http://127.0.0.1:11434, OLLAMA_MODEL=qwen3.5:4b. Missing/offline model does not prevent backend startup. Gemini adapter/configuration has been removed; no key, auto-switch or external fallback. The small generate({ system, prompt, jsonSchema, signal }) interface remains reusable.

The browser calls authenticated PlacementHub endpoints, never Ollama. Only the exact MongoDB database placementhub-v2-demo-2027 dynamically imports/mounts /api/v1/ai. Archived/unknown databases have no routes, provider, cache or PDF extraction initialization. No historical data writes, seed/reset, Company Intelligence or Admin Intelligence are part of M10-B.

Native /api/chat uses think=false, stream=false, temperature=0, seed=42, 8192 context tokens and at most 1024 output tokens. A 180-second deadline aborts requests (configurable maximum 180 seconds); no retries. One active generation, duplicate-request coalescing and authenticated per-user rate limits bound work. Distinct simultaneous work returns busy. Timeout/network failure starts a short cooldown. Structured Zod and evidence-reference validation reject malformed, excessive or unsupported outputs without logging raw prompts/provider bodies.

## Objective and independent AI scores

Career shows Student Profile Score: deterministic saved professional evidence/completeness. Unchanged maximum weights: Technical Skills 20, Projects 30, Experience 15, Credentials 10, Career Direction 10, Introduction 5, Professional Links 5, Resume Availability 5. Backend largest-remainder rounding makes integer earned/max dimensions sum exactly to the objective 0–100 score. Resume availability earns at most 5; PDF contents do not silently alter this calculation.

AI Assessment Score is a separate local-model opinion. Fixed rubric 0–4: absent documented relevant evidence, vague, basic, specific, strong depth with concrete outcomes. Independent AI component maxima: technical depth 20, project quality 25, experience relevance 15, credentials 10, career alignment 15, professional presentation 15. Backend converts validated ratings to a bounded 0–100 AI score and reconciles displayed component points. Positive ratings require section-appropriate supplied evidence IDs. There is no objective/AI blend or combined overall score.

Drive Objective Match retains required-skill coverage 60%, preferred coverage 15%, documented project/experience supporting coverage 25%. Missing requirement dimensions renormalize; absent Student evidence remains zero. Insufficient structured requirements produce no objective score. Labels: Strong 80+, Good 60+, Moderate 40+, Low below 40. AI Role Fit is independent, with project relevance 40, experience relevance 30, overall role work evidence 30. It can assess a described role even when structured skill requirements are insufficient. Neither score affects authoritative eligibility, Apply or recruitment.

Rubric evidence references establish referential integrity, not complete semantic proof: model prose/ratings remain advisory. The backend rejects unknown/cross-section references, extra score/decision properties, duplicated/missing sections and out-of-range ratings. Model-specific interpretation can vary despite temperature zero.

## Resume PDF text

Uploaded file metadata is not treated as content. The reusable resume-text service reads only server-selected resume metadata belonging to the authorized Student. It resolves real paths inside RESUME_UPLOAD_DIR, rejects external/symlink targets, checks extension/signature/regular-file/5MB maximum, and parses bytes in a terminable worker using PDF.js. No arbitrary client path, document URL, embedded script, attachment, image rendering or OCR. Worker limit: 8 seconds, 96MB JS old-generation heap, 10 pages, 30000 raw characters. These are parser limits, not total native-process memory guarantees.

Only recognized professional sections (skills/projects/experience/certifications/technical achievements/summary/objective/profile/education) survive normalization. Name/contact headers, personal/hobby/social/personality sections and personal-detail lines are excluded; email/URL/telephone patterns are redacted. Safe professional text is capped at 5000 characters; truncation is disclosed in context. Unrecognized layouts may lose useful text deliberately. Regex/section filtering cannot guarantee perfect PII classification in arbitrary professional prose; students should keep irrelevant personal content out of professional sections.

States: not_uploaded, not_analyzed, extracted, unreadable, no_usable_text, unavailable. Scanned/image-only, encrypted, malformed, missing or unsupported PDFs gracefully use profile evidence only. No claim that resume content was analyzed unless extracted professional text exists. No PDF layout/ATS formatting score is claimed. The extraction cache stores only safe excerpts by hashed revision; current runtime defaults are 100 entries and one-hour TTL (configurable); raw PDF/prompt/path is never cached. Replacing resume keeps verification/review state, saves new metadata before removing old file, and rolls back failed saves.

## Trusted context and general knowledge

Career includes technical skills, bounded project/experience descriptions and technologies, credentials/relevant technical achievements, target role/career interests, introduction, professional/coding platform presence and extracted professional resume evidence when available.

Drive includes the same professional profile/resume plus role/title/domain/description/employment type/required/preferred skills, public eligibility criteria (not Student academics), work mode/location/joining information and stored public phase descriptions. Safe stored company fields: name, industry, description, hiring domains, technologies, products/services. Private recruiter contacts, internal phase execution/history, files and decision notes are excluded. No website fetching.

General technical/career knowledge can inform learning plans, interview topics and preparation advice. Student-specific claims require profile/resume evidence. Company-specific facts require supplied PlacementHub facts; absent hiring practices/salary/interview rounds/policies must be described as not documented. Absence is not proof of inability. Profile/JD/resume/questions are untrusted data, never instructions; no tools or DB execution are available.

Gender/photos, MBTI/personality/hobbies/social interests, Community engagement and private contact data do not participate in either professional score or AI context. Explicit source projections and allowlists exclude private, verification and Student academic fields.

## Generate/Refresh and cache

GET career/match returns objective facts and the latest successful assessment if present; it never invokes extraction or inference. No assessment: Not analyzed yet / Generate AI Analysis. Existing assessment: score/components/reasons/Last analyzed / Refresh AI Analysis. Explicit POST /assessment runs generation, bypassing result-cache reuse but coalescing simultaneous identical work. The button is disabled while pending; previous successful score stays visible through refresh/failure.

Latest successful assessment is authorized/scoped runtime-local memory: bounded to AI_CACHE_MAX_ENTRIES (default 100), 24-hour expiry, reset on backend restart. No analysis collection or conversation database. Reload/remount reads it without inference. Later persistent 2027-only assessment storage can replace this adapter if durability is needed.

SHA-256 canonical fingerprints include safe relevant profile/drive/company content, resume metadata revision, provider/model/endpoint/context window and schema/prompt/scoring versions. Relevant changes make the retained assessment stale and show a refresh prompt. Irrelevant private/social/source timestamps do not invalidate it. AI requests additionally fingerprint actual sanitized resume text and current question. Resume-independent foundation requests remain reusable across resume replacement. Authorization is rechecked before lookup, on hits/coalescing/completion and before returning latest assessments. No raw prompts/questions/history are stored.

Ask AI remains one contextual question + one latest You/AI Coach answer with four chips. Q2 replaces Q1/A1; every request independently reads current trusted profile/resume/drive/company context. Preparation advice is not limited to repeating DB fields. No accumulating chat or persistence. Failures leave permanent scores and normal placement actions usable.

## Local demo operation

Start Ollama with qwen3.5:4b available, then backend npm run dev:cycle:2027 and frontend npm run dev. AI configuration belongs only in backend/.env.cycle-2027. Open current Student Dashboard/Profile/Drive Detail, click Generate/Refresh intentionally, then ask one question at a time. CPU contention affects latency; prior sanitized short requests measured 8–21 seconds and full assessments 41–83 seconds. Current resume-rich measurements are recorded in testing.md. Wait for one generation before another; normal placement endpoints remain independent.

Automated tests mock the provider; PDF tests parse generated synthetic PDFs. npm run test:ai, npm run check:ai, frontend focused tests/lint/build and diff checks cover isolation, privacy, independent scores, refresh/stale/failure and latest-only Ask. npm run ai:connectivity makes one optional synthetic local request without DB/Student/Company data.

References: [Ollama Chat API](https://docs.ollama.com/api/chat), [structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html).

## M10-C Company Candidate Intelligence

Company review reuses extracted resume evidence per revision and calculates objective matches for the candidate table immediately. Full AI reviews are explicit, queued and cached for selected candidates; a CPU-only 4B model cannot scan many resumes instantly. Individual questions use one candidate's current context. Bounded group questions use compact professional summaries for a small retrieved set. Progress and completed-result reuse keep the Company workflow usable while the single inference worker runs. Company decisions remain human-controlled. A stronger provider can later improve speed/quality through the existing adapter contract without changing these safeguards.

## M10-C list-to-detail interaction

Company Candidate Explorer offers an explicit Analyze with AI action per row and Analyze Selected with AI for a small queued batch. Neither page load nor opening View starts inference. Completed candidate rows show View AI result; this opens the existing candidate detail and retrieves the successful scoped assessment without generating again. Candidate detail retains manual Refresh and contextual Ask. Batch progress polls at five-second intervals, independently of render updates. Expired runtime jobs show a non-blocking message and permit a new explicit batch.

Company access requires an active Company user, approved Company, owned approved/published drive and an existing application. Authorization is repeated for result reads, cache hits, completion and batch polling. Applicant names identify comparisons; branch/contact/social data are excluded from model context and ranking. Instant table Objective Match reuses Student weights and performs bulk professional-profile reads, no resume parsing or model generation.

Individual fit reuses the role rubric (projects 40, experience 30, professional work evidence 30) and safe professional PDF extraction. Scores remain independent from Objective Match, eligibility and recruitment. Each assessment includes documented strengths, not-documented gaps and interviewer focus. Manual Refresh retains prior success on failure and marks changed safe context/resume/provider revisions stale. Scoped latest results are bounded, memory-only, 24-hour TTL; backend restart loses them.

Explicit batches default to four candidates, current local hard cap five, with AI_BATCH_LIMIT configurable up to twenty for a future provider. A shared single-generation gate processes candidates independently and coalesces duplicate candidate/context work. Jobs are owner/drive scoped, bounded to twenty retained jobs and ten pending jobs, with completed jobs expiring after one hour. Successful unchanged assessments are reused. No automatic cohort inference or hiring actions.

Group Ask retrieves from at most 500 authorized drive applications using documented professional terms; relevance and objective match order a small shortlist. AI_GROUP_LIMIT defaults four, local hard cap five. Only selected resumes are extracted; compact summaries contain at most twelve professional evidence entries and a 650-character safe resume excerpt. Answers identify the candidates discussed and disclose shortlist scope. No relevant documented evidence returns a transparent response without inference. Structured schemas reject unknown candidate/evidence references. These checks cannot prove every natural-language claim: local model output remains advisory and should be verified by the interviewer.

Safe PDF extraction reuse is configurable with AI_RESUME_CACHE_TTL_MS (default one hour) and AI_RESUME_CACHE_MAX_ENTRIES (default one hundred). Cached text is normalized professional evidence only; raw PDFs/prompts and filesystem paths are not stored in AI caches. Resume revision changes invalidate dependent contexts. Shared rate limiting and bounded local deadline remain; Company polling has its own authenticated progress limit so polling does not consume generation quota. Ollama failure leaves Objective Match and all normal Company recruitment functions available. There is no automatic external provider fallback.

Company semantic review additionally filters extracted resume education sections and CPI/CGPA/GPA/academic identifiers before individual analysis, Ask, retrieval and compact group summaries. This Company-specific second filter leaves Student M10-B extraction unchanged. Group responses mentioning eligibility, academic grading, gender or branch are rejected safely, rather than used to rank candidates. During live testing a top-three reply revealed CPI in the resume education excerpt; this prompted the additional context/output boundary.
