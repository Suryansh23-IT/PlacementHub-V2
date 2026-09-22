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

Backend configuration will include `PORT`, `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, upload configuration, and `OPENAI_API_KEY`. Frontend configuration will include only `VITE_API_URL`. Secrets stay in backend environment files.
