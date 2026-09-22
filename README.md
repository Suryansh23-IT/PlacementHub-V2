# PlacementHub V2

PlacementHub V2 is a MERN platform for one college placement cell. Students manage profiles and apply to approved jobs, companies run recruitment, and a placement administrator oversees approvals, records, and reports.

## Current status

**M1 — Foundation in progress.** React, Express, configuration, errors, and database connectivity are being established.

## Planned stack

- Frontend: React, Vite, Tailwind CSS
- Backend: Node.js, Express, MongoDB, Mongoose
- Validation: Zod
- Authentication: JWT and bcrypt
- Uploads: Multer with a storage provider selected later
- Reporting: xlsx
- AI: OpenAI API through the backend only

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

1. Copy `backend/.env.example` to `backend/.env` and replace `JWT_SECRET` with a secure value of at least 32 characters. Set `MONGO_URI` to a reachable MongoDB database.
2. Copy `frontend/.env.example` to `frontend/.env` if the API uses a different address.
3. Run `npm run dev:backend` to start the API on port 5000.
4. Run `npm run dev:frontend` to start the web app.

## Checks

- `npm run build --prefix frontend`
- `npm run lint --prefix frontend`
- `npm run check:backend`
- `npm start --prefix backend`
