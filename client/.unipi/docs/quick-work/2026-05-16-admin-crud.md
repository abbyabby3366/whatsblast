---
title: "Admin CRUD"
type: quick-work
date: 2026-05-16
---

# Admin CRUD

## Task
Add CRUD controls to all admin panel sections.

## Changes
- `src/routes/admin.users.tsx`: added create/edit/delete dialog, inline role/status update, interval editing.
- `src/routes/admin.campaigns.tsx`: added create/edit/delete dialog for campaigns with merchant, recipients, and message text.
- `src/routes/admin.sessions.tsx`: added create/edit/delete dialog for WhatsApp sessions with merchant and warmup schedule.

## Verification
- Ran TypeScript check filtered for admin route errors; no admin CRUD TypeScript errors were reported.
- Full Vite build could not run in WSL after node_modules was installed from Windows; rolldown native Linux optional binding is missing. Reinstall dependencies in the same environment used to build/run.

## Notes
Do not mix Windows and WSL `node_modules`. If running with Windows `pnpm.cmd`, reinstall and run from Windows. If running in WSL, delete `node_modules` and reinstall from WSL.

## Bulk Delete Update
- Added row checkboxes and select-all checkbox to admin users, campaigns, and sessions tables.
- Added "Delete selected" bulk action using parallel DELETE requests to the existing backend detail endpoints.
- Verified admin route TypeScript check remains clean.
