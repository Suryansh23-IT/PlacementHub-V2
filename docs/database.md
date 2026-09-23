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
| PlacementDrive | Belongs to a Company and represents one role. Stores structured job details, eligibility rules, the Company/recruitment PDF, the drive/JD PDF, 1–5 ordered Company-defined phase definitions, proposal-review status, publication/lifecycle status, and review metadata. Phase 0 is system-owned and is not stored as a Company phase definition. |
| Application | Joins one Student and PlacementDrive. Stores `currentPhase`, `currentStatus`, withdrawal/outcome data, and append-only `phaseHistory`; Phase 0 is the initial applicant/screening pool. |
| PlacementRecord | Controlled record created from a selected Application; records the Student, Company, PlacementDrive, package, joining date, and placement year. |
| Notification | Belongs to a User; stores event type, concise text, relevant drive/application/phase references, read status, and actor/recipient context for authorized delivery. |
| PlacementRestriction | Optional future Student-level restriction record for policy or placement-rule enforcement, with reason, scope, effective dates, and audit metadata. |
| Post / PostLike / Comment | Basic social feed. |
| AIAnalysis | Stores optional AI output separately from core data. |

## Key indexes and constraints

- `User.email` is unique.
- At most one `placement_admin` User may exist; the role uses a partial unique index while student and company accounts remain unrestricted by role count.
- `InstitutionProfile` is a singleton for the configured college; it does not introduce tenant isolation or a college foreign key on other records.
- `StudentProfile.userId` and `Company.userId` are unique.
- Recruiter policy has a unique academic-year/version pair and a partial unique index allowing at most one active version. Acceptance is unique on company User ID + policy ID. Saved Recruiter version contents are immutable; revisions create new versions.
- `PlacementDrive` should be indexed by company, proposal-review status, publication/lifecycle status, deadline, and created date.
- `Application` has a unique compound index on `studentId + placementDriveId`; index drive plus current phase/status for Company and Admin monitoring.
- `PlacementRecord` should be unique per selected Application and indexed by student, company, drive, and placement year.
- `Notification` should be indexed by recipient, read status, and created date.
- `PlacementRestriction`, if introduced, should be indexed by student and active/effective dates.
- `PostLike` has a unique compound index on `postId + userId`.

## Data ownership

Student projects and skills are embedded because they belong to one profile. Company-defined phase definitions belong inside their PlacementDrive; each Student's phase journey belongs only in that Student's Application `phaseHistory`. This keeps one source of truth and avoids duplicate phase/student records. Applications, PlacementDrives, PlacementRecords, Notifications, and posts are separate documents because they must be queried independently. Core data never depends on AIAnalysis. Student verification review metadata records the Placement Admin reviewer, review time, and optional rejection reason.
