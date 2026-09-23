# Workflows

## Golden placement workflow

```text
Placement Admin approves Company
  -> Company creates Job (draft)
  -> Company submits Job for approval
  -> Admin approves and publishes Job
  -> Student views Job and eligibility result
  -> Eligible Student applies once
  -> Company shortlists and creates recruitment rounds
  -> Company schedules Interview
  -> Company records selected/rejected outcome
  -> Selected outcome creates PlacementRecord
  -> Admin dashboard and Excel report reflect the placement
```

## Eligibility

The backend evaluates student verification, CGPA, branch, backlog count, and graduation year against the published job rules. It returns `eligible` plus human-readable reasons. A non-verified student is not eligible and cannot submit an application. AI never decides eligibility.

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

## Institution settings and placement dashboard

The Placement Admin maintains the one institution profile; it is shared college presentation/settings data, not a tenant. The dashboard derives counts and package statistics directly from StudentProfile, Company, Job, Application, and PlacementRecord documents, then lists recent application, recruitment, interview, and placement-record activity by date. It does not use AI.

## Recruitment states

Application states: `applied`, `in_progress`, `selected`, `rejected`, `withdrawn`.

Round states: `pending`, `scheduled`, `in_progress`, `passed`, `failed`, `cancelled`.

Only valid transitions are allowed. For example, a rejected application cannot move to selected without an explicit, documented correction workflow.

## Notifications

Backend services create in-app notifications after application submission, shortlist, interview scheduling, selection, and rejection. A notification failure must not cancel the main action.
