---
title: "Admin Filters"
type: quick-work
date: 2026-05-16
---

# Admin Filters

## Task
Add frontend filters and backend django-filter support.

## Changes
- Backend `core/settings.py`: added `django_filters` and default DRF filter/search/ordering backends.
- Backend `account/views/user_view.py`: added `UserFilter` and `AgentPhoneNumberFilter` with search/order support.
- Backend `whatsapp/views/blast_campaign_view.py`: added `BlastCampaignFilter`, search/order support, and admin-wide campaign queryset.
- Backend `whatsapp/views/session_view.py`: added session/session-log filters, search/order support, and non-admin queryset restriction.
- Frontend admin users/campaigns/sessions pages: added search, status/role/merchant, and ordering filters wired to query params.

## Verification
- Admin TypeScript check filtered for admin route errors passed.
- Backend `python manage.py check` could not run in this environment because Python dependencies are missing (`celery` module not installed in WSL environment).

## Notes
Backend filter query params include `search`, `ordering`, plus exact fields like `role`, `is_active`, `status`, `user`, `created_after`, `created_before` depending on endpoint.
