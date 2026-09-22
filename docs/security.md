# Security Plan

- Hash passwords with bcrypt; never store plaintext passwords.
- Keep JWT secrets, MongoDB URLs, storage credentials, and OpenAI keys in backend environment variables.
- Authenticate protected routes, authorize roles, and verify ownership of jobs, profiles, applications, posts, and recruitment records.
- Permit only Placement Admins to maintain the institution profile, review student verification, approve companies/jobs, and read placement dashboard aggregates. Enforce verified-student checks in eligibility and application services.
- Validate requests with Zod and enforce model-level constraints with Mongoose.
- Validate resume file type, MIME type, and size before storage.
- Use CORS with the configured frontend URL and rate-limit sensitive authentication and AI routes.
- Return safe error messages; do not expose stacks, passwords, tokens, or private personal data.
- Do not commit `.env` files or real student data. Use demo accounts and sample resumes for presentation.
