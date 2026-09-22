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

The backend evaluates CGPA, branch, backlog count, and graduation year against the published job rules. It returns `eligible` plus human-readable reasons. AI never decides eligibility.

## Recruitment states

Application states: `applied`, `in_progress`, `selected`, `rejected`, `withdrawn`.

Round states: `pending`, `scheduled`, `in_progress`, `passed`, `failed`, `cancelled`.

Only valid transitions are allowed. For example, a rejected application cannot move to selected without an explicit, documented correction workflow.

## Notifications

Backend services create in-app notifications after application submission, shortlist, interview scheduling, selection, and rejection. A notification failure must not cancel the main action.
