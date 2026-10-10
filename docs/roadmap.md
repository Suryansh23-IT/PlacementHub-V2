# Roadmap

Only one milestone is active at a time. Each milestone requires implementation checks, manual testing, a report, and user approval before its Git checkpoint.

| Milestone | Outcome |
| --- | --- |
| M0 | Documentation and approved V2 blueprint. |
| M1 | React/Express foundation, database connection, configuration, errors. |
| M2 | Authentication, JWT, roles, protected routes. |
| M3 | Student profile, skills/projects, resume metadata/upload, and Placement Admin student verification. |
| M4 | Company profile, basic institution profile/settings, and admin company approval. |
| M5 | Placement Drive proposals: one role per drive, structured role and eligibility details, two PDFs, 1–5 Company-defined recruitment phases, and Admin proposal review. |
| M6 | Published drives, basic notifications, deterministic eligibility at application time, Phase 0 applicant screening, and role-specific application views. |
| M7 | Execution of Company-defined phases, candidate movement/outcomes, placement records, drive postponement/cancellation, and targeted recruitment notifications. |
| M8 | Read-only placement dashboards, drive monitoring, filters, notification-center polish, analytics, Excel exports, and the Student Placement Center. |
| M9 | 2027 Community, social profiles, professional showcases, engagement and separate notifications. |
| M10 | 2027 Placement Intelligence: foundation, Student career/job match, Company candidate match, Admin insights and bounded data questions. |
| M11 | Full QA, responsive polish, demo data, deployment, and viva material. |

## Milestone protocol

1. Inspect relevant files and documentation.
2. Explain the scoped plan and affected files.
3. Implement only the active milestone.
4. Run focused checks and test the user flow.
5. Report results, limitations, and manual test steps.
6. Wait for user approval, then create a Git checkpoint.

## M9B final scope and closure

M9B-A/A2/B/C implementation is complete: Admin/Company Feed with exactly one required image, text-only Articles, ownership/moderation RBAC, shared likes/comments, Social Profiles, safe Company/Admin-only Student Main Profiles, and separate Community notifications with optional create-only broadcasts. Feed | Articles | Profile | Notifications navigation and 2027 isolation are preserved.

M9B-D automated regression and current-2027 browser checks passed. The legacy archived institutionprofiles.updatedAt-only baseline deviation is documented and accepted by the user; its pure-read helper fix and explicit post-fix baseline complete the integrity closure. The final M9 checkpoint is authorized on demo-2027-m9. See testing.md and docs/integrity/m9-2026-post-fix-baseline.json for evidence and warnings.

## Active milestone: M10-B Student Intelligence

Final approved architecture: Ollama qwen3.5:4b only, non-thinking local CPU inference, one active generation and bounded 180-second deadline. No Gemini dependency/fallback. M10-A foundation and verified-resume replacement behavior are retained.

Career and Drive display unchanged instant objective scores plus independent semantic AI scores. No weighted combined score. Explicit Generate/Refresh retains previous success/timestamp through refresh/failure and marks relevant profile/resume/drive/company revisions stale. GET/reload/remount never generate. Actual professional resume PDF text is extracted safely on the backend and reusable by later M10-C. Latest-only Ask can use general technical knowledge while grounding person/company claims in supplied safe evidence.

Only the exact 2027 runtime enables AI. No 2026 modifications, seed/reset or Company/Admin product implementation. User authorizes M10-B commit/push only after automated checks and real local validation pass; M10-C/D await separate approval. See ai.md and testing.md.
