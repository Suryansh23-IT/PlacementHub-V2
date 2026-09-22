# API Conventions

## Base URL

All endpoints use `/api/v1`.

## Response format

Successful responses:

```json
{ "success": true, "message": "Job created successfully.", "data": {} }
```

Error responses:

```json
{ "success": false, "message": "You are not authorized.", "errorCode": "FORBIDDEN" }
```

## Status codes

Use 200 for successful reads/updates, 201 for creation, 400 for malformed requests, 401 for unauthenticated users, 403 for unauthorized users, 404 for missing resources, 409 for duplicates or invalid state conflicts, 422 for validation failures, and 500 for unexpected failures.

## Endpoint groups

| Group | Examples |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Student | `GET/PATCH /students/me`, `POST /students/me/resume` |
| Company | `GET/PATCH /companies/me`, `POST /companies/me/jobs` |
| Admin | `GET/PATCH /admin/institution`, `GET /admin/students`, `PATCH /admin/students/:id/verification`, `PATCH /admin/companies/:id/approval`, `PATCH /admin/jobs/:id/approval`, `GET /admin/dashboard` |
| Jobs | `GET /jobs`, `GET /jobs/:id`, `GET /jobs/:id/eligibility` |
| Applications | `POST /applications`, `GET /applications/me`, `PATCH /applications/:id/status` |
| Recruitment | `POST /applications/:id/rounds`, `PATCH /rounds/:id` |
| Reports | `GET /reports/placements/export` |

Routes must authenticate, authorize the role, validate input, and check resource ownership before calling the service.

## Authentication and RBAC

`POST /auth/register` creates student or company accounts and returns a JWT access token plus safe user data. `POST /auth/login` does the same after credential verification. `GET /auth/me` requires a valid bearer token and returns the current active user. Password hashes are never returned.

The `placement_admin` role is not available through ordinary registration. It can create one initial Placement Admin account only when the configured `ADMIN_BOOTSTRAP_SECRET` is supplied; the secret is never returned or stored. Authentication loads the current user from the database for each protected request, so inactive accounts and changed roles cannot continue using a previously issued token.

Registration and login use the configured authentication rate limit and return `429 RATE_LIMITED` after too many attempts.

## Placement Admin responsibilities

Only a Placement Admin may read or update the singleton institution profile, list students for review, change a student verification status, approve companies/jobs, and read the placement dashboard. Student verification accepts only `pending -> verified` or `pending -> rejected`; it records the reviewer and optional rejection reason.

Student profile responses expose the student's own verification status. Placement eligibility and application services must reject non-verified students with a consistent `403` response and a clear verification-status message. Browsing jobs, editing a profile, and managing resume metadata remain available to pending/rejected students.

`GET /admin/dashboard` returns deterministic aggregates: total students, verified students, approved companies, published jobs/drives, total applications, distinct placed students, placement rate, package statistics when placement records contain package values, and a date-descending recent placement/recruitment activity list. Placement rate is `distinct placed students / verified students * 100`; it is `0` when there are no verified students. Package statistics use PlacementRecord package values only. No AI output is used.
