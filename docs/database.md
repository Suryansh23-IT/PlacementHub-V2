# Database Design

MongoDB stores one document collection per primary domain. Mongoose validates schemas, applies indexes, and records timestamps.

## Core entities

| Entity | Essential relationships and purpose |
| --- | --- |
| User | Authentication identity; `name`, `email`, `passwordHash`, `role`, `isActive`. |
| StudentProfile | One-to-one with User; academic details, skills, embedded projects, verification status, resume reference. |
| Company | One-to-one with User; company and recruiter details, approval status. |
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
- `StudentProfile.userId` and `Company.userId` are unique.
- `Application` has a unique compound index on `studentId + jobId`.
- `PostLike` has a unique compound index on `postId + userId`.
- Jobs should be indexed by company, status, approval status, and deadline.

## Data ownership

Student projects and skills are embedded because they belong to one profile. Applications, jobs, recruitment rounds, and posts are separate documents because they must be queried independently. Core data never depends on AIAnalysis.
