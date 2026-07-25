---
title: "Multi-template campaign UI"
type: quick-work
date: 2026-05-25
---

# Multi-template campaign UI

## Task
Update the frontend so campaigns can be created/edited with multiple message templates, matching backend behavior where each recipient receives each template 3 seconds apart before the normal interval.

## Changes
- `src/routes/merchant.campaigns.tsx`: added a multi-template editor with add/remove/template switching. Each template supports the existing text/media/buttons/list fields, media upload preview/removal, edit loading, and card previews for every template.
- `src/routes/admin.campaigns.tsx`: admin campaign form can enter multiple text templates separated by a line containing `---`; edit mode loads all existing template texts.

## Verification
- Ran `./node_modules/.bin/tsc --noEmit --pretty false`; changed files passed, but the project still reports pre-existing TypeScript errors in `src/routes/merchant.tsx` and `src/routes/merchant.whatsapp-sessions.tsx`.
- Tried `npm run build`; it failed before compiling app code because the Linux Rolldown optional native binding is missing from `node_modules`.

## Notes
Merchant UI sends `templates: [...]` in order. Admin delimiter is only for text-only templates.

## Follow-up: preserve template IDs on edit
- `src/routes/merchant.campaigns.tsx`: template drafts now keep existing template `id`s and include them in the update payload so adding a new template appends only the new template instead of recreating all previous templates.
