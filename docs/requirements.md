# Requirements

## Product goal

PlacementHub V2 is a professional-looking placement-management platform for one college placement cell. It must demonstrate a complete, reliable student-to-placement workflow.

## Roles

| Role | Main responsibilities |
| --- | --- |
| Student | Manage profile and resume, browse jobs, check eligibility, apply, track recruitment, view interviews and notifications. |
| Company | Maintain company profile, create jobs, review applicants, manage recruitment rounds and interviews. |
| Placement Admin | Maintain the institution profile, verify students, approve companies and jobs, monitor placement activity, manage official placement records, and export reports. |

## Included modules

Authentication and RBAC; a basic single-college institution profile/settings section; student verification; student and company profiles; resume metadata/upload; jobs and approval; deterministic eligibility; applications; recruitment rounds; interviews; notifications; placement records; dashboards; Excel reports; basic posts, likes and comments; resume feedback AI; job-preparation AI.

## Institution and student verification

PlacementHub V2 serves one college only. The Placement Admin maintains one basic institution profile containing the college name, logo, location, placement contact information, and placement-relevant academic branches/departments. It is not a multi-college tenant model.

Student profiles begin with `pending` verification. A Placement Admin reviews each student and moves the status to either `verified` or `rejected`. A rejected Student may correct the profile/resume and explicitly resubmit it, changing the status back to `pending` and clearing the previous review decision for a new Admin review. Verified is final for this workflow. Only verified students can perform placement actions that require verification, including receiving a positive placement-eligibility result and submitting an application. Pending or rejected students may manage their own profile and resume, but receive a clear status/reason when an action is unavailable.

## Placement dashboard

The Placement Admin dashboard uses deterministic database aggregates only. It shows total students, verified students, approved companies, published jobs/drives, total applications, placed students, placement rate, package statistics when placement package data exists, and recent placement/recruitment activity. AI does not generate, rank, or modify these statistics.

## Acceptance criteria

The main workflow must work using demo accounts: admin approves a company, company creates a job, admin publishes it, an eligible student applies, company progresses the student through rounds and an interview, selects the student, and admin exports the placement record.

## Postponed features

Multi-college tenancy, public college signup, payments, chat, WebSockets, advanced feed recommendations, job scraping, advanced AI matching, real calendar integrations, and enterprise infrastructure are out of scope.
