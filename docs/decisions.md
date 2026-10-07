# Architecture Decisions

## ADR-001: Single-college scope

**Decision:** PlacementHub V2 represents one college placement cell with a Placement Admin role.

**Reason:** Multi-college tenancy would significantly increase authorization, data-isolation, onboarding, and support complexity without improving the final-year demonstration.

## ADR-002: Modular monolith

**Decision:** Use one Express API and one MongoDB database.

**Reason:** It is reliable, low-cost, easy to deploy, and suitable for a college project.

## ADR-003: Service layer without generic repositories

**Decision:** Controllers call services, and services call Mongoose models directly.

**Reason:** A separate repository layer would add boilerplate without solving a current project problem.

## ADR-004: AI is additive

**Decision:** AI analysis is stored separately and must never control eligibility, application, approval, or recruitment outcomes.

**Reason:** Core placement behavior remains reliable if the AI provider is unavailable.

## ADR-005: M9A canonical demo data and minimal placement-profile evidence

**Decision:** The 2027 demo environment uses a separate configured MongoDB database and a single structured dataset as the source for StudentProfile records and generated resumes. StudentProfile may store structured career interests, experience, credentials, achievements, extracurricular activity, and leadership evidence. These are optional placement-profile facts and do not enable a social profile.

**Reason:** M10 needs consistent, explainable inputs for advisory Candidate Fit and ATS features. Storing these facts only in generated resumes would create conflicting sources of truth. M9B will separately own social opt-in and presentation-only fields.
