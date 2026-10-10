# M11-A environment foundation

Only M11-A is implemented. No deployment, storage migration, cloud configuration, seed/reset or M11-B. M0–M10 and local archived data remain preserved. Checkpoint awaits user testing approval.

## Configuration

| Setting | Local | Future public deployment |
| --- | --- | --- |
| Backend NODE_ENV | development (default) / test | production |
| Backend MONGO_URI | Existing per-cycle URI | Exact database path /placementhub-v2-demo-2027, on the approved Atlas host |
| Backend AI_ENABLED | true for Ollama; false disables semantic work | false; startup rejects true |
| Backend AI_PROVIDER | ollama | No running provider needed |
| Frontend VITE_APP_MODE | local (dev default) | public (build default) |
| Frontend VITE_AI_ENABLED | true by default; false for disabled preview | false; public mode rejects true |
| Frontend VITE_API_URL_2027 | Existing local backend URL | Render HTTPS API URL, configured later |
| Frontend VITE_API_URL_2026 | Existing archived local URL | Ignored; 2026 is excluded |

Backend production validates the exact current database identity already used by Community/AI guards. Unknown/archived databases fail startup before connection. The runtime policy additionally denies semantic AI if a service is programmatically constructed with production + AI_ENABLED=true. Routes remain available for objective calculations; disabling AI does not remove objective routes. No Ollama process is required. Modules can be imported for shared metadata without constructing a provider or making a request.

Frontend mode is explicit, never inferred from the hostname. Dev defaults local and builds default public. VITE_APP_MODE=local permits a local build/preview; never use it on Vercel. Keep frontend/backend AI settings aligned. Backend ai.reason=disabled also replaces semantic controls if the local UI flag was left enabled.

Public configuration contains only 2027. Stored 2026 selection normalizes to 2027 for context, session keys and API lookup. Archived auth data is neither restored nor deleted. Local mode retains both cycles and isolated sessions. Public API URLs reject HTTP/local addresses, credentials and protocol-relative URLs. /api/v1 is a relative build placeholder only: split Vercel/Render deployment must configure the actual Render URL during M11-E/F. Actual hosting URLs are not configured here.

## Disabled AI contract

Student Career/Drive GET, assessment and explanation retain unchanged objective scores; Ask returns unavailable/disabled. Company detail retains Objective Match; review/Ask/group never extract resumes or infer. Batch POST authorizes owned drive/candidates then returns {ai} disabled without a job ID. Explorer retains Objective Match, sorting, filters, exports and View, omitting semantic selection/Fit/Status/actions. Admin analytics remain unchanged; exact fact Ask still returns trusted_facts, qualitative Ask/generation returns disabled with no new insight write. Admin runtime GET/reset returns {status:DISABLED,ai} without runtime actions.

Domain guards run after existing role/ownership checks but before PDF extraction/inference/jobs. Shared inference service and provider factory independently enforce disabled policy. Auth, strict validation and quotas remain. Archived/unknown local runtimes still expose no AI routes. No scores are blended; eligibility/Apply/recruitment/analytics remain authoritative.

The shared deep-blue AiComingSoon card appears for Student Career, Student Drive, Company detail/Explorer and Admin Placement AI, with no Generate/Ask/runtime controls. Student/Company objective evidence loads independently of the card. Local enabled M10 interfaces remain intact.

## Manual checks

1. Start existing local cycle backends/frontend normally. Keep NODE_ENV=development and AI_ENABLED=true in the configured 2027 backend. Verify 2027 default, local cycle switching and existing M10 controls in all four areas. A new model generation is optional.
2. Preview disabled UI: stop only the frontend dev server, set $env:VITE_AI_ENABLED='false' in that PowerShell session and restart. Check Student Dashboard/Profile/Drive Detail, Company Explorer/detail and Admin Dashboard. Coming Soon should appear, objective scores should remain and semantic controls should be absent.
3. Preview public mode locally: set $env:VITE_APP_MODE='public', $env:VITE_AI_ENABLED='false', $env:VITE_API_URL_2027='/api/cycle-2027' before starting the dev server. Existing Vite proxy serves local 2027 reads. In browser storage set placementhub_active_cycle to 2026, reload and verify only 2027 and its API are used. No placement mutations are needed.
4. Backend disabled check: temporarily set AI_ENABLED=false in the existing 2027 cycle file and restart its backend. The launcher overrides shell values with that file. Authenticated objective reads/actions remain; direct Ask/batch requests return disabled. Restore true afterwards. Do not seed/reset.
5. Restore frontend shell defaults: Remove-Item Env:VITE_APP_MODE, Env:VITE_AI_ENABLED, Env:VITE_API_URL_2027 -ErrorAction SilentlyContinue; restart frontend normally.

## Later phases

Approved free stack: Vercel Hobby → Render Free → MongoDB Atlas Free, with Supabase Storage Free. Persistent storage/data-and-file transfer, real API URLs, CORS, secrets and hosting hardening belong to M11-E/F. Existing filesystem uploads intentionally remain unchanged and are not yet suitable for Render persistence.

Focused mocked tests cover enabled/disabled guards, direct API protection, objective retention, all Coming Soon areas, Explorer, stale archive selection/session isolation and local cycle preservation. Results are recorded in testing.md. No live LLM benchmark or database mutation is needed for M11-A verification.

## Changed files

- `.gitignore`
- `backend/.env.example`
- `backend/.env.production.example`
- `backend/package.json`
- `backend/scripts/check-ai-syntax.js`
- `backend/src/config/env.js`
- `backend/src/config/runtime-policy.js`
- `backend/src/modules/ai/admin-ai.service.js`
- `backend/src/modules/ai/ai-runtime.controller.js`
- `backend/src/modules/ai/ai.routes.js`
- `backend/src/modules/ai/ai.service.js`
- `backend/src/modules/ai/company-ai.service.js`
- `backend/src/modules/ai/providers/ai.provider.js`
- `backend/src/modules/ai/student-ai.service.js`
- `backend/test/admin-ai.test.js`
- `backend/test/company-ai.test.js`
- `backend/test/production-foundation.test.js`
- `backend/test/student-ai.test.js`
- `docs/ai.md`
- `docs/api.md`
- `docs/architecture.md`
- `docs/decisions.md`
- `docs/m11a-foundation.md`
- `docs/roadmap.md`
- `docs/security.md`
- `docs/testing.md`
- `docs/ui.md`
- `frontend/.env.example`
- `frontend/.env.production.example`
- `frontend/src/features/ai/AdminIntelligence.jsx`
- `frontend/src/features/ai/AiComingSoon.jsx`
- `frontend/src/features/ai/CompanyIntelligence.jsx`
- `frontend/src/features/ai/StudentIntelligence.jsx`
- `frontend/src/features/ai/useCompanyExplorerAi.js`
- `frontend/src/features/placement-cycle/placement-cycle-core.js`
- `frontend/src/features/placement-cycle/placement-cycle.js`
- `frontend/src/features/placement-cycle/runtime-config.js`
- `frontend/src/pages/CompanyCandidateExplorerPage.jsx`
- `frontend/test/production-foundation.test.js`
- `frontend/vite.config.js`

