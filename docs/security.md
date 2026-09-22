# Security Plan

- Hash passwords with bcrypt; never store plaintext passwords.
- Issue short-lived JWT access tokens after registration/login, verify them on every protected request, and load the current active user before authorization. Do not trust a role embedded in an old token without checking the database.
- Allow ordinary registration only for student and company roles. Bootstrap one Placement Admin through the configured `ADMIN_BOOTSTRAP_SECRET`; never commit, return, or store that secret.
- Rate-limit registration and login using configured request-window and maximum-attempt values; return a standard `429 RATE_LIMITED` response when the limit is reached.
- Keep JWT secrets, MongoDB URLs, storage credentials, and OpenAI keys in backend environment variables.
- Authenticate protected routes, authorize roles, and verify ownership of jobs, profiles, applications, posts, and recruitment records.
- Permit only Placement Admins to maintain the institution profile, review student verification, approve companies/jobs, and read placement dashboard aggregates. Enforce verified-student checks in eligibility and application services.
- Validate requests with Zod and enforce model-level constraints with Mongoose.
- Validate resume file type, MIME type, and size before storage.
- Use CORS with the configured frontend URL and rate-limit sensitive authentication and AI routes.
- Return safe error messages; do not expose stacks, passwords, tokens, or private personal data.
- Do not commit `.env` files or real student data. Use demo accounts and sample resumes for presentation.
