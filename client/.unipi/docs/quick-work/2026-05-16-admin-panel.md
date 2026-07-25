---
title: "Admin Panel"
type: quick-work
date: 2026-05-16
---

# Admin Panel

## Task
Create an admin panel for the frontend based on the Django backend.

## Changes
- `src/routes/admin.tsx`: Added protected admin shell with sidebar navigation and logout.
- `src/routes/admin.index.tsx`: Added admin dashboard metrics for users, merchants, campaigns, and sessions.
- `src/routes/admin.users.tsx`: Added user/merchant management page with role and active-status updates via `users/` API.
- `src/routes/admin.campaigns.tsx`: Added global campaign monitor page using `blast-campaigns/` API.
- `src/routes/admin.sessions.tsx`: Added WhatsApp session monitor page using `whatsapp-sessions/` API.
- `src/routes/login.tsx`: Redirects admin users to `/admin` after login by checking `users/me/`.
- `src/routeTree.gen.ts`: TanStack Router route tree was regenerated to include new admin pages.

## Verification
- Ran TypeScript check scoped to new admin/login files via `tsc --noEmit --pretty false | grep -E "admin|login"`; no admin/login errors were reported.
- Full project check still reports pre-existing TypeScript errors in merchant routes.
- `pnpm build` could not complete because pnpm 11 blocks an ignored dependency build script (`unrs-resolver`) and requires `pnpm approve-builds`.

## Notes
Backend endpoints used: `users/`, `users/me/`, `blast-campaigns/`, and `whatsapp-sessions/`.
