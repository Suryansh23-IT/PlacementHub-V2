# Requirements

## Product goal

PlacementHub V2 is a professional-looking placement-management platform for one college placement cell. It must demonstrate a complete, reliable student-to-placement workflow.

## Roles

| Role | Main responsibilities |
| --- | --- |
| Student | Manage profile and resume, browse jobs, check eligibility, apply, track recruitment, view interviews and notifications. |
| Company | Maintain company profile, create jobs, review applicants, manage recruitment rounds and interviews. |
| Placement Admin | Approve companies and jobs, monitor placement activity, manage official placement records, export reports. |

## Included modules

Authentication and RBAC; student and company profiles; resume metadata/upload; jobs and approval; deterministic eligibility; applications; recruitment rounds; interviews; notifications; placement records; dashboards; Excel reports; basic posts, likes and comments; resume feedback AI; job-preparation AI.

## Acceptance criteria

The main workflow must work using demo accounts: admin approves a company, company creates a job, admin publishes it, an eligible student applies, company progresses the student through rounds and an interview, selects the student, and admin exports the placement record.

## Postponed features

Multi-college tenancy, public college signup, payments, chat, WebSockets, advanced feed recommendations, job scraping, advanced AI matching, real calendar integrations, and enterprise infrastructure are out of scope.
