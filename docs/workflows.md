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

Published Drive visibility is separate from its application window. A published Drive accepts new applications only until its stored deadline and while Placement Administration has not manually closed intake. An Admin may extend a deadline, close applications early, or reopen a manually closed window; those actions never change the published timestamp, existing Applications, or Phase 0 history. Natural deadline expiry is calculated when eligibility or application submission runs and does not require a background job.

Admin discipline reviews: `No action / forgive` closes the review and moves the incident into History / Closed matters, retaining the Student name and decision. `Forget / Close Matter` archives a resolved incident after any active restriction has been explicitly removed. Archived matters are read-only: no further restriction may be imposed from that incident. History is preserved rather than deleted; unrelated pending incidents remain actionable.

## M7: Phase execution and placement outcomes

M7A keeps the M5 phase blueprint immutable and adds runtime `phaseExecution` metadata keyed by phase number. It holds each Company phase's schedule, optional deadline, mode, venue, instructions, resource links, instruction PDF, and execution status. Phase 0 remains system-owned and has no Company execution metadata.

The existing Application is the only candidate record. Company transition actions append an audit event to `phaseHistory`: advance only to the next configured phase, move backward with a reason, reject, mark absent, restore absent, restore rejected with a reason, provisionally select only from the final Company phase, unselect with a reason, or close the application because the Student was placed elsewhere. Withdrawn and placement-confirmed applications cannot advance. A published Drive is required; application-window closure stops new applications but does not alter existing recruitment journeys. Placement restrictions keep their M6 meaning as future-drive eligibility controls and do not retroactively remove an existing applicant from a Drive.

M7A defines the PlacementRecord data foundation only. It does not yet create records or provide Company, Student, or Admin confirmation UI; later M7 work owns those confirmation transitions.

M7C makes a Company phase operational without changing that blueprint: Company may save execution details and optional instruction PDF, export a current phase or provisional-selected candidate pool, and explicitly notify only applications currently `active` in that exact phase. Messages retain drive, Company, role, phase, and batched-send context. Student reads are limited to the authenticated Student's current active (or provisionally selected final) phase; a Student cannot choose an arbitrary phase or attachment URL.

M7D presents the Student-owned recruitment journey from the same Application record. Its timeline retains append-only phase events but hides internal notes. The active phase card shows only that phase's execution details and PDF action. Rejected, absent, withdrawn, closed, and completed states retain history but receive no active-only resources.

M7E makes Company final-phase selection provisional. A Student can create or update the single PlacementRecord for that Application only while it is provisionally selected, including PDF proof. The record moves through `pending_admin_verification`, `confirmed`, `rejected`, and `revoked`; only Placement Admin confirmation changes the Application to `placement_confirmed`. Confirmed full-time, PPO, and internship-and-PPO records block future incompatible applications and close other active applications as `closed_placed_elsewhere`; internship-only records do not impose that hard lock. Revocation preserves history and recalculates future eligibility from remaining confirmed records, but never reopens old closed applications automatically.

Students see a personal phase journey. Admin monitors the same drive, application, phase, and history data without a duplicate phase/student store. A selected result creates one controlled PlacementRecord. The Admin can postpone or cancel a drive.

Drive lifecycle control is deliberately narrow: `published -> postponed` and `published|postponed -> cancelled`, with a required reason. Both states freeze new applications, Company transitions, runtime phase editing, and phase messaging without changing Applications, phase history, resources, or PlacementRecords. Active applicants receive one notification for each lifecycle action. No resume transition is exposed because the current lifecycle policy does not define a safe reactivation path.

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

Later restrictions require a resolved, unarchived incident; pending and department-referred incidents must use the review workflow. Restriction review notes are limited to 500 characters to match the restriction record. Forgiving an incident does not remove an existing restriction; removal restores normal eligibility evaluation rather than guaranteeing eligibility.
