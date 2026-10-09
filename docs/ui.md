# UI Plan

## Visual direction

Use a clean professional interface: white and neutral backgrounds, a restrained purple accent, readable typography, consistent spacing, responsive layouts, and accessible contrast.

## Shared UI

Each role uses a dashboard layout with navigation, header, notification entry point, profile menu, reusable cards, tables, form controls, confirmation dialogs, and toast messages.

## Key pages

Student: dashboard, profile, resume, jobs, job detail, applications, interviews, notifications, feed, AI pages.

Company: dashboard, profile, jobs, job editor, applicants, recruitment, interviews, notifications, feed.

Admin: dashboard, institution settings, students and verification review, company approvals, job approvals, placements, reports, notifications, feed.

## Admin-specific states

Institution settings display the single college profile. The students screen shows `pending`, `verified`, and `rejected` verification states, a review action only for pending students, and an understandable reason when a placement action is unavailable.

The placement dashboard presents total students, verified students, approved companies, published jobs/drives, total applications, placed students, placement rate, available package statistics, and recent placement/recruitment activity. Zero-data cards and unavailable package statistics have clear empty states.

## Required states

Every data screen implements loading, empty, success, error, and unauthorized states. Forms show field-level validation and understandable server errors.

Admin discipline separates pending reviews, active restrictions, and collapsible history with section counts and a Student/enrollment/branch/Company/role search. History identifies resolved reviews separately from archived matters. Later restriction forms are collapsed and explain replacement of any active restriction. All mutation controls are disabled while an action is saving; form validation matches API note and drive-count limits.

## M9B Community presentation

### M9B-A profiles

Community post/comment author names and role-specific avatars link to `/community/profiles/:userId`. Social Profiles are compact identity cards with short About/skills previews or Company description/website. Student and Company use distinct local SVG fallbacks; Official profiles reuse the existing ApexMark. Optional protected Student/Company avatars use the simple Social Profile editor; no discovery directory is introduced.

Company/Admin viewers of a Student Social Profile see View Main Profile. The additional read-only Main Profile presents professional evidence in responsive section cards, with separate technical and explicit soft skills. Students retain their existing profile editor with optional headline, About, and soft-skills inputs, but cannot open the new Main Profile viewer. No Company/Admin Main Profile exists. Both pages are unavailable in 2026.

Community uses a centered 660px stream, responsive padding, and Feed/Articles/Profile/Notifications tabs. Server-backed search and Newest/Oldest controls reset loaded pages. Load More appends deduplicated ordered records, disables while pending, hides at the last page, and retains loaded content on failure. Engagement refresh preserves loaded pages.

Feed cards show Placement Administration / Official or Company name / Company, timestamp/edited marker, caption, required aspect-preserving image capped at 384px high, then lightweight Like/Unlike and Comment links/counts at the bottom. Articles show a text title/preview and Read Article, with full readable text on detail. Admin and Company see the same simple composer. Company sees edit/delete controls only for its own content. Admin edits Admin content and sees remove-only moderation controls for Company content; Article forms contain no image controls. All roles can comment; own-comment removal and Admin moderation use inline confirmation. There is no right sidebar, rich text editor, or additional content section.


## M9B-A2 creative Social Profiles

The Community Profile tab opens the current user’s Social Profile; owner/Admin Edit Social Profile appears before the identity card. Student Social Profiles show a circular image, concise identity/About, interest/hobby/soft-skill chips, optional campus highlights/clubs/activities/volunteering, languages/growth interests, user-selected MBTI, and safe social links. Main Profile stays a separate professional showcase. Company Social Profiles have a protected optional logo, basic social identity/hiring domains, and an explicit public recruiter/representative contact block. Official profiles retain AIT branding. The dedicated editor explains social-only writes and uses ordinary fields/comma-separated tags; profile image upload has no media editor. Empty optional sections stay hidden. Both profile pages remain responsive and unavailable in archived 2026.

## M9B-C navigation and notifications

The compact Community stream keeps Feed | Articles | Profile | Notifications tabs. Profile opens the current user's existing Social Profile; author links and Main Profile permissions are preserved. Notifications shows a Community-only unread badge and lightweight scoped inbox/read controls with detail links. Placement sidebar notifications remain separate. Feed composer requires one image and permits keeping/replacing on edit, with no image-removal control. Article composer remains text-only. Notify Community is an unchecked create-only checkbox: Admin audience selector, Company Students-only hint. No additional sidebar, media editor or social dashboard.
