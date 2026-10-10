# Architecture Decisions

## ADR-001: Single-college scope

**Decision:** PlacementHub V2 represents one college placement cell with a Placement Admin role.

**Reason:** Multi-college tenancy would significantly increase authorization, data-isolation, onboarding, and support complexity without improving the final-year demonstration.

## ADR-002: Modular monolith

**Decision:** Use one Express API and one MongoDB database.

**Reason:** It is reliable, low-cost, easy to deploy, and suitable for a college project.

## ADR-003: Service layer without generic repositories

**Decision:** Controllers call services, and services call Mongoose models directly.

**Reason:** A separate repository layer would add boilerplate without solving a current project problem.

## ADR-004: AI is additive

**Decision:** AI analysis is stored separately and must never control eligibility, application, approval, or recruitment outcomes.

**Reason:** Core placement behavior remains reliable if the AI provider is unavailable.

**M10 foundation (final M10-B decision):** Ollama qwen3.5:4b is the only implemented backend provider. Current cache is bounded memory, not an AIAnalysis model. Only the exact 2027 database enables infrastructure. Objective scores/trusted facts stay backend-owned; independent AI rubric scores remain advisory. Student features are M10-B; Company/Admin await separate approval. No general chatbot or external API dependency.

**Approved resume rule:** Replacement preserves verification/review metadata, safely replaces the old file and invalidates resume-dependent analyses using a hashed current-file revision. The prerequisite correction removes legacy saveResume verification revocation, with focused preservation/file-failure/cache tests. No Student AI product feature is included.

## ADR-005: M9A canonical demo data and minimal placement-profile evidence

**Decision:** The 2027 demo environment uses a separate configured MongoDB database and a single structured dataset as the source for StudentProfile records and generated resumes. StudentProfile may store structured career interests, experience, credentials, achievements, extracurricular activity, and leadership evidence. These are optional placement-profile facts and do not enable a social profile.

**Reason:** M10 needs consistent, explainable inputs for advisory Candidate Fit and ATS features. Storing these facts only in generated resumes would create conflicting sources of truth. M9B will separately own social opt-in and presentation-only fields.

## ADR-006: Final M9B Community and social profiles

**Decision:** Current 2027 Community has Feed, Articles, Profile and Notifications navigation. Placement Admin and Company publish; Students engage without publishing. Companies edit/delete only their own content. Admin edits Admin content and may remove any supported content/comment without impersonating Company authors.

One SocialPost model distinguishes Feed and Article, sharing SocialLike and SocialComment. Feed creation/save requires exactly one protected JPEG/PNG/WebP image; edits retain or replace it. Articles require title/body and never accept images. Legacy image-free QA posts remain readable; legacy Student QA posts remain excluded without migration. Search, newest/oldest ordering and pagination are server-side, with a narrow responsive stream and deduplicated Load More.

Every authenticated 2027 role can view safe lightweight Social Profiles. Explicit creative edits use a separate SocialProfile record, drawing read-only defaults from existing profiles without synchronizing writes. Student/Company use distinct local fallbacks and optional protected avatars; Official identity reuses AIT branding. Student Main Professional Profile is a separate Company/Admin-only safe showcase. Existing Student own-profile editing and authorized placement/document workflows remain intact. Profile GETs never upsert or change source timestamps.

Community reuses Notification infrastructure with a separate domain, inbox, unread count and read actions. Another user's comment notifies the author; self-comments and likes do not. Optional broadcasts are OFF by default and CREATE-only: Admin targets Students/Companies/Everyone, Company targets Students only. Detail links use existing notification context. Placement notifications stay separate.

Authentication and the exact 2027 database guard precede reads, writes and uploads. Dedicated protected social storage enforces signature/type/size/path checks and cleanup. Archived 2026 and canonical placement data require no migration, seed or reset. No connections, followers, chat, rich-text CMS, gallery, discovery directory or additional notification backend is introduced. M10/M11 remain outside this milestone.

## M10-B final Student intelligence decision

Ollama qwen3.5:4b is the sole provider; obsolete Gemini implementation/configuration is removed. Generic provider and bounded validation/cache/rate-limit architecture remains. Exact 2027 guard; no historical changes or Company/Admin features.

Objective Career/Drive calculations remain unchanged. AI Assessment Score/AI Role Fit are separate model-rubric opinions; the earlier 80/20 and 75/25 combined-score proposals are superseded and removed. Evidence references/rating ranges are validated and rubric dimension points reconcile to each independent score. Eligibility/Apply remains authoritative outside AI.

Professional PDF extraction uses bounded PDF.js worker parsing, rooted server-owned paths, normalization/section allowlisting/redaction and graceful image-only/unreadable fallback. Replacement preserves verification. Structured professional profile plus actual safe resume content feeds Career and Drive; Drive additionally includes actual role/public criteria/phase descriptions and safe stored company fields. General career knowledge may guide advice but cannot establish person/company-specific facts.

Explicit Generate/Refresh only, no silent inference. Latest successful assessment/timestamp survives browser reload in bounded authorized memory, reset on backend restart/24h expiry. Profile/resume/role/company fingerprint changes mark it stale. Failure keeps objective/previous AI result. Ask retains one independent latest question/answer, no history/database. See ai.md.

## M10-C Company Intelligence

Use fast objective matching for every authorized applicant; invoke the local model only for explicit individual/selected small-batch reviews or retrieved group questions. Independent fit, no blended score, no automatic hiring/eligibility actions. Default batch/retrieval four, Ollama cap five, future adapter/config may raise the cap. Reuse professional PDF extraction by revision, scoped results, manual refresh and latest-only Ask. Explorer row actions start analysis without opening detail; successful results link to existing detail. No Gemini integration/fallback in this milestone. Live closure uses one normally approved/published existing 2027 drive and three normal eligible Student applications specifically authorized by the user, not a seed/reset.
# M10-D: trusted aggregate Admin intelligence

Admin insights use existing M8 analytics/report semantics, never model-generated queries or raw Student/Company dumps. Whole-2027 context is explicit and independent of dashboard filters. Exact bounded fact questions bypass inference; qualitative reasoning uses the shared controlled Ollama service. Only latest successful Admin insights persist in a guarded 2027 singleton collection. GET does not generate/write; refresh is explicit and preserves prior success on failure. Relevant facts/provider/contract changes mark retained insights stale. No Admin AI score, conversation history, Gemini fallback, Student/Company redesign or M11 work. Reference/numeric validation supplements concise structured output but does not establish complete semantic proof.

## Approved M11-A environment and future free deployment

Only M11-A is authorized now. Use explicit local/public frontend mode and backend NODE_ENV. Preserve local cycles and Ollama. Public 2027-only UI and production database guard retain archive isolation; production semantic AI shows shared Coming Soon cards. Keep deterministic scores, matching, exact facts and placement workflows. Direct API guards run before extraction/inference/jobs. Approved future stack: Vercel Hobby, Render Free, MongoDB Atlas Free, Supabase Storage Free. Storage migration belongs to M11-E; no cloud work, seed/reset or deployment in M11-A. See m11a-foundation.md. Commit/push awaits testing approval.
