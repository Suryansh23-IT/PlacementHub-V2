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
| Admin | `PATCH /admin/companies/:id/approval`, `PATCH /admin/jobs/:id/approval` |
| Jobs | `GET /jobs`, `GET /jobs/:id`, `GET /jobs/:id/eligibility` |
| Applications | `POST /applications`, `GET /applications/me`, `PATCH /applications/:id/status` |
| Recruitment | `POST /applications/:id/rounds`, `PATCH /rounds/:id` |
| Reports | `GET /reports/placements/export` |

Routes must authenticate, authorize the role, validate input, and check resource ownership before calling the service.
