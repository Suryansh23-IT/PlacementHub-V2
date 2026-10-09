# Database Design

MongoDB stores one document collection per primary domain. Mongoose validates schemas, applies indexes, and records timestamps.

## Core entities

| Entity | Essential relationships and purpose |
| --- | --- |
| User | Authentication identity; `name`, unique `email`, bcrypt `passwordHash`, `role` (`student`, `company`, or `placement_admin`), and `isActive`. No profile document is created in M2. |
| InstitutionProfile | One singleton document for the college; college name, logo reference, location, placement contact information, and placement-relevant branches/departments. |
| StudentProfile | One-to-one with User; academic details, skills, embedded projects, `verificationStatus` (`pending`, `verified`, or `rejected`), review metadata, and resume reference. |
| Company | One-to-one with User; company and recruiter details, approval status. |
| RecruiterPlacementPolicy | Title, academic year, version, policy text and active flag; shares the Student policy schema factory but uses a separate collection. |
| RecruiterPolicyAcceptance | `companyId` references the Company User; stores policy ID, policy version and server-generated acceptedAt. Separate from Company approval/completion. |
| Resume | Belongs to a student; file metadata, storage URL, optional parsed text. |
| PlacementDrive | Belongs to a Company and represents one role. Stores structured job details, eligibility rules, the Company/recruitment PDF, the drive/JD PDF, 1–5 ordered Company-defined phase definitions, proposal-review status, publication/lifecycle status, review metadata, and append-only Admin `lifecycleHistory` for postpone, close/completed, and cancel reasons. `phaseExecution` is separate runtime metadata keyed only by `phaseNumber`: schedule, deadline, delivery mode, venue, instructions, resource links, instruction PDF, and execution status. It does not alter the approved phase blueprint. It also stores application-window metadata for an Admin manual close and deadline extension; this does not alter the Drive lifecycle or existing Applications. Phase 0 is system-owned and is not stored as a Company phase definition. |
| Application | Joins one Student and PlacementDrive. Stores `currentPhase`, `currentStatus`, withdrawal/outcome data, and append-only `phaseHistory`; Phase 0 is the initial applicant/screening pool. M7 transitions preserve the same record and append every Company decision/correction to its history. |
| PlacementRecord | One official record per Application. Holds the Student, Company, PlacementDrive, outcome type, role, package/stipend/location/joining information, verification timestamps/state, proof metadata, notes, and append-only record history. Pending and confirmed records are offer records; every confirmed outcome contributes to the unique placed-student metric. |
| Notification | Belongs to a User; stores event type, concise text, relevant drive/application/phase references, read status, and actor/recipient context for authorized delivery. |
| PlacementRestriction | Optional future Student-level restriction record for policy or placement-rule enforcement, with reason, scope, effective dates, and audit metadata. |
| Post / SocialLike / Comment | Basic social feed. |
| AIAnalysis | Stores optional AI output separately from core data. |

## Key indexes and constraints

- `User.email` is unique.
- At most one `placement_admin` User may exist; the role uses a partial unique index while student and company accounts remain unrestricted by role count.
- `InstitutionProfile` is a singleton for the configured college; it does not introduce tenant isolation or a college foreign key on other records.
- `StudentProfile.userId` and `Company.userId` are unique.
- Recruiter policy has a unique academic-year/version pair and a partial unique index allowing at most one active version. Acceptance is unique on company User ID + policy ID. Saved Recruiter version contents are immutable; revisions create new versions.
- `PlacementDrive` should be indexed by company, proposal-review status, publication/lifecycle status, deadline, and created date.
- `Application` has a unique compound index on `studentId + placementDriveId`; index drive plus current phase/status for Company and Admin monitoring.
- `PlacementRecord` is unique per Application and indexed by student plus verification state, and by drive plus company.
- `Notification` should be indexed by recipient, read status, and created date.
- `IncidentReport` retains its review decision and optional resolved-matter archival metadata; closing a matter never changes the decision or a restriction.
- `PlacementRestriction` is indexed by student and active status. Multiple historical restrictions may belong to one Student; only the active record affects eligibility.
- `SocialLike` has a unique compound index on `postId + userId`.

## Data ownership

Student projects and skills are embedded because they belong to one profile. Company-defined phase definitions belong inside their PlacementDrive; each Student's phase journey belongs only in that Student's Application `phaseHistory`. This keeps one source of truth and avoids duplicate phase/student records. Applications, PlacementDrives, PlacementRecords, Notifications, and posts are separate documents because they must be queried independently. Core data never depends on AIAnalysis. Student verification review metadata records the Placement Admin reviewer, review time, and optional rejection reason.

## M9B Community data

`SocialPost` stores `authorUserId`, `authorRole` (placement_admin/company), `contentType` (feed/article), content, optional Article title, timestamps, and `editedAt`. Feed content is 1–3,000 trimmed characters. Article title is 1–180 and body 1–20,000. Feed requires single-image metadata (`filename`, `mimeType`, `size`); responses expose MIME/size, never stored filenames or absolute paths. Content type is immutable after creation.

`SocialLike` has a unique post/user index. `SocialComment` is one-level with authenticated author identity. Counts and `likedByMe` are derived from these collections. Deleting a post removes its likes, comments, Community comment/broadcast notifications, and image. Child removal failures retain the parent for retry. Images are held separately from resumes/company documents under configured `SOCIAL_UPLOAD_DIR`.

Existing Notification stores optional `postId` and `view_community_post` context for comment notifications. No like notification is created. All canonical placement models retain their existing ownership and behavior.

## M9B-A optional profile presentation

StudentProfile now supports optional professionalHeadline/about/softSkills without adding another collection or backfilling canonical/historical records. Existing skills, projects, internships, certifications, achievements, extracurriculars, leadership, interests and links remain the single source for professional evidence. Social Profile queries and Main Profile queries are separate safe read projections; no timestamp, upsert or save is performed by these GET endpoints.


## M9B-B author roles

SocialPost authorRole supports `placement_admin` and `company`. Authors are always derived from authenticated identity. Existing Feed/Article fields, single Feed image metadata, engagement collections, indexes, and cleanup remain unchanged. Legacy Student QA records are preserved and excluded from supported content queries; existing Company records become visible without a migration.


## M9B-A2 editable Community identity

SocialProfile is a separate collection with a unique userId and server-derived role. It stores optional headline/bio, Student creative tag arrays and self-selected MBTI, safe social links, Company identity overrides/hiring domains/public representative fields, and protected avatar metadata. User authentication and existing StudentProfile/Company/InstitutionProfile documents are not duplicated or updated by Social Profile saves. A missing SocialProfile uses in-memory safe defaults; GET never inserts/upserts. Saved empty strings/arrays intentionally clear social values without changing the placement source.

## M9B-C Community notification domain

Notification adds an optional indexed domain (placement/community), retaining existing source/category/type/read/context fields. Community comments/broadcasts explicitly set community; existing community_comment type/category is recognized by read scopes without rewriting records. Placement records need no migration/default-on-read. Broadcast deliveries use the existing Notification collection and are removed with their post. SocialPost validates exactly one Feed image on save, while legacy image-free records are retained for read-only display; Articles remain image-free.
