# Workflows

## Golden placement workflow

```text
Approved Company with accepted Recruiter Placement Policy
  -> Company creates a Placement Drive proposal for one role
  -> Company submits structured details, eligibility, two PDFs, and 1–5 phases
  -> Admin approves, rejects, or requests changes
  -> Admin publishes an approved drive
  -> Student views the drive, PDFs, and recruitment journey
  -> Student applies; backend evaluates deterministic eligibility
  -> Eligible Student enters system Phase 0 (applicant/screening pool)
  -> Company executes configured phases and records candidate outcomes
  -> Selected outcome creates PlacementRecord
  -> M8 dashboards and Excel exports report the same underlying data
```

## M5: Placement Drive proposal and review

A Placement Drive is one Company role; a Company can create multiple drives. An approved Company with a current Recruiter Placement Policy acceptance may submit a proposal. The proposal contains structured job details, structured eligibility rules, a Company/recruitment-information PDF, a Placement Drive/job-description PDF, and one to five Company-defined recruitment phases. Phase 0 is never Company-defined.

Admin proposal decisions are approve, reject, or request changes. Review status is separate from publication/lifecycle status. M5 reserves `postponed` and `cancelled` drive states for later use; M7 gives the Admin those actions. Eligibility rules are defined and validated in M5, but eligibility is not evaluated until application in M6.

## M6: Published drives, eligibility, and applications

The Admin publishes an approved drive. Students can see published drive details, both PDFs, and the planned recruitment journey. Applying runs deterministic backend eligibility against student verification, CGPA, branch, backlog count, graduation year, and the drive's stored rules. The response includes eligibility plus human-readable reasons; AI never decides eligibility.

An eligible application is created once per Student and drive and starts in Phase 0, the system-owned applicant/screening pool. Future AI or ATS screening may attach to Phase 0 without making it a Company-defined phase. Student views show personal application, status, and history; Company views expose rich applicant data; Admin views expose lighter monitoring data. Applications support withdrawal, status, and history.

## M7: Phase execution and placement outcomes

M7 executes the phases designed in M5. Companies can schedule each phase, provide external links and instructions, and notify candidates in that phase. Candidate states include `pending`, `result_pending`, `qualified`, `rejected`, `absent`, `disqualified`, and `selected`. Companies can promote or demote candidates between Phase 0 and configured phases while preserving phase history.

Students see a personal phase journey. Admin monitors the same drive, application, phase, and history data without a duplicate phase/student store. A selected result creates one controlled PlacementRecord. The Admin can postpone or cancel a drive.

## Student verification

```text
Student completes profile
  -> StudentProfile verificationStatus is pending
  -> Placement Admin reviews the profile
  -> verified or rejected
  -> rejected Student corrects profile/resume and explicitly resubmits
  -> pending review again
```

Only the Placement Admin can make the review decision. Admin review transitions are `pending -> verified` and `pending -> rejected`. A rejected Student may explicitly resubmit only after completing the required academic details and resume; the resubmission transition is `rejected -> pending` and clears the previous review metadata. Verified is final for this workflow. Profile/resume editing remains available to the student; placement eligibility and application submission require `verified`.

## Recruiter Placement Agreement

The Admin inserts the approved Recruiter policy text, academic year and version, then activates it. No default Recruiter policy text is seeded: the repository currently contains no supplied Recruiter policy artifact. Inactive versions remain available in Admin management. Activating a version deactivates the previous one; saved text cannot be edited in place, so revisions require a new academic-year/version pair.

Only approved Companies can read and sign the active Recruiter policy. The Company confirms representative authority and agreement, then explicitly accepts the displayed version. Each acceptance is permanent for that Company user and policy ID, with server time and version stored. A different active version needs its own acceptance; reactivating an already signed version retains that signature. Admin Company Review shows agreement status against the active version, or Not Accepted with no policy metadata when none is active. Admin cannot sign on behalf of the Company. Student policy behavior is unchanged. Job creation enforcement remains deferred to M5.

## M8: dashboards, analytics, and exports

M8 adds no core placement decision logic. It presents clean Admin, Company, and Student dashboards using M3–M7 data: Placement Drive monitoring, filters and search, notification-center polish, analytics, and Excel exports. The Student Placement Center groups Open Drives, My Applications, and History. The Placement Admin dashboard derives its statistics from stored data, including verified students, approved companies, published drives, applications, placement records, placement rate, package statistics when available, and recent activity. AI does not generate, rank, or modify these statistics.

## Notifications across M5–M7

Notifications support meaningful placement events only: Admin to Students, Admin to Companies, Company to Admin, and Company to Students in that Company's own drive or phase. They are used for proposal decisions, publishing, application and material phase updates, schedules, selection, rejection, postponement, cancellation, and similar actionable changes. The system must not notify users for every small status change.
