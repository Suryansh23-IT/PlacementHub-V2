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
| Job | Belongs to Company; eligibility rules, deadline, approval and publishing status. |
| Application | Joins Student, Job, and selected Resume; recruitment status and outcome. |
| RecruitmentRound | Belongs to Application; ordered stage, status, score, feedback. |
| Interview | Belongs to Application and optionally RecruitmentRound; schedule, mode, feedback, score. |
| PlacementRecord | Controlled outcome for selected applications; package, joining date, placement year. |
| Notification | Belongs to User; type, text, related entity reference, read status. |
| Post / PostLike / Comment | Basic social feed. |
| AIAnalysis | Stores optional AI output separately from core data. |

## Key indexes and constraints

- `User.email` is unique.
- At most one `placement_admin` User may exist; the role uses a partial unique index while student and company accounts remain unrestricted by role count.
- `InstitutionProfile` is a singleton for the configured college; it does not introduce tenant isolation or a college foreign key on other records.
- `StudentProfile.userId` and `Company.userId` are unique.
- Recruiter policy has a unique academic-year/version pair and a partial unique index allowing at most one active version. Acceptance is unique on company User ID + policy ID. Saved Recruiter version contents are immutable; revisions create new versions.
- `Application` has a unique compound index on `studentId + jobId`.
- `PostLike` has a unique compound index on `postId + userId`.
- Jobs should be indexed by company, status, approval status, and deadline.

## Data ownership

Student projects and skills are embedded because they belong to one profile. Applications, jobs, recruitment rounds, and posts are separate documents because they must be queried independently. Core data never depends on AIAnalysis. Student verification review metadata records the Placement Admin reviewer, review time, and optional rejection reason.
