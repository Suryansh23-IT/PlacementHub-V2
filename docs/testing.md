# Testing Strategy

## Automated checks

Run frontend lint/build checks and backend test/lint checks once tooling exists. Add focused automated tests for authentication, student-verification transitions and enforcement, eligibility, duplicate-application prevention, ownership checks, recruitment transitions, deterministic dashboard aggregates, and AI-response validation.

## API checks

Use a REST client or Postman collection to test valid input, invalid input, unauthenticated requests, wrong-role requests, ownership violations, Placement Admin-only institution/verification/dashboard endpoints, and non-verified student rejection for each completed API group.

## Manual browser checks

For every milestone, test loading, empty, success, error, and unauthorized states. Verify the full golden placement workflow during final QA using seeded demo accounts.

## Definition of done

A milestone is complete when code is inspected, checks pass, the relevant API works, the frontend flow works, invalid/unauthorized behavior is tested, documentation is current, and the user has manually tested it.
