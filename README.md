# PlacementHub V2

PlacementHub V2 is a MERN platform for one college placement cell. Students manage profiles and apply to approved jobs, companies run recruitment, and a placement administrator oversees approvals, records, and reports.

## Current status

M0–M9 and M10-B are committed on demo-2027-m9. M10-C Company Candidate Intelligence is implemented and validated for its authorized checkpoint. M10-D Admin AI has not started. From backend: npm run test:ai, npm run check:ai, npm run check. Optional npm run ai:connectivity sends at most one synthetic request to the explicitly selected enabled provider; never runs in automated tests. See docs/ai.md and docs/m10c-checkpoint.md.

**Roadmap status:** M0 documentation complete; M1 foundation complete; M2 authentication and authorization complete; M3 student profiles, resumes, and verification complete; M4 company profiles, institution settings, and company approval complete.

## Planned stack

- Frontend: React, Vite, Tailwind CSS
- Backend: Node.js, Express, MongoDB, Mongoose
- Validation: Zod
- Authentication: JWT and bcrypt
- Uploads: Multer with a storage provider selected later
- Reporting: xlsx
- AI: optional local Ollama qwen3.5:4b through the backend; current 2027 runtime only (Student and Company Intelligence; Admin pending). Generic provider boundary retained; no automatic external fallback.

## Documentation

- [Requirements](docs/requirements.md)
- [Architecture](docs/architecture.md)
- [Database](docs/database.md)
- [API](docs/api.md)
- [Workflows](docs/workflows.md)
- [Roadmap](docs/roadmap.md)
- [Testing](docs/testing.md)
- [AI](docs/ai.md)
- [UI](docs/ui.md)
- [Security](docs/security.md)
- [Decisions](docs/decisions.md)

## Planned structure

```text
frontend/     React application
backend/      Express API
docs/         Approved project documentation
```

## Local setup

1. Copy `backend/.env.example` to `backend/.env`; set `MONGO_URI`, `JWT_SECRET`, and `ADMIN_BOOTSTRAP_SECRET` to separate secure values of at least 32 characters. The bootstrap secret is needed only to create the first Placement Admin account. Keep the provided authentication rate-limit values unless the deployment needs a documented adjustment.
2. Copy `frontend/.env.example` to `frontend/.env` if the API uses a different address.
3. Run `npm run dev:backend` to start the API on port 5000.
4. Run `npm run dev:frontend` to start the web app.

## Checks

- `npm run build --prefix frontend`
- `npm run lint --prefix frontend`
- `npm run check:backend`
- `npm start --prefix backend`

## Local smoke fixture

The controlled TCS browser-smoke fixture is optional and is kept separate from normal local data.

- `npm run fixture:tcs-smoke --prefix backend` creates or replaces only the fixture records tracked by `placementhub-v2-tcs-smoke-fixture-v1`.
- `npm run fixture:tcs-smoke:clean --prefix backend` prints the tracked-record audit, then removes only that fixture’s notifications, workflow records, fixture accounts/profiles, policy acceptances, store entry, and generated local manifest.

The cleanup never selects records by Company name and does not remove manual or demo-seeded data.

## Isolated 2027 demo foundation

M9A uses a separate MongoDB database named `placementhub-v2-demo-2027`. The 2027 commands refuse every other database name, including the historical M8.5 database. Configure `MONGO_URI` for that exact database and provide the required local demo password environment variables before record seeding.

- `npm run seed:demo:2027:validate --prefix backend` validates the guarded environment and canonical source without connecting to MongoDB.
- `npm run seed:demo:2027 --prefix backend` currently prints only the deterministic foundation plan; it creates no records or PDFs.
- `npm run seed:demo:2027:reset --prefix backend -- --confirm` is confirmation-gated and can remove only IDs and upload paths recorded in the dedicated 2027 manifest.
