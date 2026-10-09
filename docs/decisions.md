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

## ADR-005: M9A canonical demo data and minimal placement-profile evidence

**Decision:** The 2027 demo environment uses a separate configured MongoDB database and a single structured dataset as the source for StudentProfile records and generated resumes. StudentProfile may store structured career interests, experience, credentials, achievements, extracurricular activity, and leadership evidence. These are optional placement-profile facts and do not enable a social profile.

**Reason:** M10 needs consistent, explainable inputs for advisory Candidate Fit and ATS features. Storing these facts only in generated resumes would create conflicting sources of truth. M9B will separately own social opt-in and presentation-only fields.

## ADR-006: Final M9B Community and social profiles

**Decision:** Current 2027 Community has Feed, Articles, Profile and Notifications navigation. Placement Admin and Company publish; Students engage without publishing. Companies edit/delete only their own content. Admin edits Admin content and may remove any supported content/comment without impersonating Company authors.

One SocialPost model distinguishes Feed and Article, sharing SocialLike and SocialComment. Feed creation/save requires exactly one protected JPEG/PNG/WebP image; edits retain or replace it. Articles require title/body and never accept images. Legacy image-free QA posts remain readable; legacy Student QA posts remain excluded without migration. Search, newest/oldest ordering and pagination are server-side, with a narrow responsive stream and deduplicated Load More.

Every authenticated 2027 role can view safe lightweight Social Profiles. Explicit creative edits use a separate SocialProfile record, drawing read-only defaults from existing profiles without synchronizing writes. Student/Company use distinct local fallbacks and optional protected avatars; Official identity reuses AIT branding. Student Main Professional Profile is a separate Company/Admin-only safe showcase. Existing Student own-profile editing and authorized placement/document workflows remain intact. Profile GETs never upsert or change source timestamps.

Community reuses Notification infrastructure with a separate domain, inbox, unread count and read actions. Another user's comment notifies the author; self-comments and likes do not. Optional broadcasts are OFF by default and CREATE-only: Admin targets Students/Companies/Everyone, Company targets Students only. Detail links use existing notification context. Placement notifications stay separate.

Authentication and the exact 2027 database guard precede reads, writes and uploads. Dedicated protected social storage enforces signature/type/size/path checks and cleanup. Archived 2026 and canonical placement data require no migration, seed or reset. No connections, followers, chat, rich-text CMS, gallery, discovery directory or additional notification backend is introduced. M10/M11 remain outside this milestone.
