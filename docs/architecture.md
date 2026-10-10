# Architecture

## Approach

The project is a modular monolith: one React frontend, one Express backend, and one MongoDB database. This is intentionally simpler to develop, debug, deploy, and explain than microservices.

```text
React frontend -> Express API -> Services -> Mongoose models -> MongoDB
```

## Backend module layout

```text
backend/src/modules/<domain>/
  <domain>.routes.js       URL and middleware binding
  <domain>.controller.js   HTTP request/response handling
  <domain>.service.js      business rules and database coordination
  <domain>.validation.js   Zod schemas
  <domain>.model.js        Mongoose schema and indexes
```

Shared backend folders will hold configuration, middleware, utilities, and error classes. Controllers must not contain substantial business rules. Services must perform ownership and state-transition checks.

## Frontend layout

```text
frontend/src/
  app/ components/ layouts/ pages/ features/ services/ hooks/ utils/ constants/ styles/
```

Pages compose features. Features call API services. API services are the only frontend code that knows endpoint URLs. Every data page needs loading, empty, error, unauthorized, and success states.

## Configuration

Backend configuration includes `PORT`, `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, upload configuration, and optional `AI_ENABLED`, `AI_PROVIDER`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL` and bounded AI settings. Frontend cycle configuration chooses the backend API; secrets remain backend-only.

## M10-A optional AI module

M10-B retains a generic generate contract with Ollama as its only implementation. Backend-only non-thinking structured inference, scoped fingerprints and bounded local CPU timeout isolate failures. No external provider fallback. See ai.md.

The modular monolith is retained. Only the exact 2027 database dynamically imports/mounts AI routes. Routes/controllers/validation/service are separated; the injected Ollama adapter has no DB access. Nested professional allowlists feed Zod/evidence validation. Provider/cache creation is lazy and guarded; memory cache holds validated output. No AI Mongoose model is implemented. Core services do not invoke AI. See ai.md.

M10-B separates Student intelligence service/controller/validation/scoring/response contracts inside the same module. Versioned scoring rules live in config/ai-scoring.js. Trusted internal contracts extend the existing provider/cache path without accepting HTTP-supplied context. GET computes independent deterministic evidence; POST requests bounded explanations. A small frontend AI feature and API service are embedded in existing Student Dashboard/Profile/Drive Detail and hidden in archived cycles. Eligibility/application services remain separate and unchanged.

The contextual Ask extension reuses that infrastructure: ai-question.js defines the single-question structured contract; Student domain service loads current allowlisted evidence and facts. ContextualAskAi is a reusable single-slot view with title, chips and an authorized feature API callback. Raw questions/history are never persisted; cached answers are independent scoped fingerprint entries. Permanent scoring/analysis is unchanged; Ask replaces the redundant Explain and suggest UI action. Future Company/Admin domains must supply their own authorization/context/fact contracts before reusing this pattern.

M10-B finalization adds a worker-bounded professional resume text service and independent AI rubric scores. GET reads instant objective facts/latest successful assessment; explicit POST generates/refreshes. Latest successful assessments stay in bounded authorized runtime memory for 24 hours, including across browser reloads, with stale fingerprints and no conversation collection. AiAssessmentView is reusable for later Company UI.

M10-C embeds Company candidate intelligence in the existing Explorer and applicant detail. Dedicated Company service/controller/validation/contracts/retrieval reuse the shared guarded AI service, resume-text cache, independent role rubric and contextual Ask view. Bulk objective matching precedes Explorer sorting/pagination without PDF/model work. Explicit small batches use an owner-scoped in-memory queue with progress; group questions retrieve bounded compact evidence before one inference. Company professional semantic context omits eligibility criteria; core recruitment modules remain authoritative and unchanged.
