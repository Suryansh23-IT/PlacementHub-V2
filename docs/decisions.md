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
