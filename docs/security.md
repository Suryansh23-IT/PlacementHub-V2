# Security Policy

## Supported Version

PlacementHub is currently under active development.

| Version / Branch | Supported |
| --- | --- |
| `main` | ✅ Yes |
| Development branches | ⚠️ Best effort |
| Older archived branches | ❌ No |

## Reporting a Vulnerability

If you discover a security vulnerability in PlacementHub, please report it privately.

Please do **not** publish sensitive security details in a public GitHub Issue.

When reporting, include:

- A clear description of the vulnerability
- Steps to reproduce it
- The affected feature or route
- Expected vs actual behavior
- Screenshots or logs if useful
- Any suggested fix, if available

Sensitive information such as passwords, JWT secrets, API keys, private student data, or database credentials should never be included in public reports.

## Security Areas

PlacementHub handles several security-sensitive workflows, including:

- Authentication and JWT sessions
- Student, Company, and Placement Admin authorization
- Role-based and ownership-based access control
- Resume and document uploads
- Recruitment and placement records
- Company and student verification
- AI context filtering and privacy safeguards
- Placement-cycle data isolation

## Secrets

Never commit real credentials or secrets to the repository.

Examples include:

- `JWT_SECRET`
- `ADMIN_BOOTSTRAP_SECRET`
- MongoDB credentials
- API keys
- Production environment variables

Use local `.env` files or the deployment platform's secret/environment-variable management system.

## Responsible Disclosure

Please allow reasonable time for a reported vulnerability to be investigated and fixed before publicly disclosing it.

Security reports made in good faith are appreciated.

---

**PlacementHub**
Campus Placement Management Platform
