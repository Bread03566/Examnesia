---
name: kabisado-deploy-ops
description: >
  Operations runbook for deploying, migrating, verifying, and administering
  Kabisado on its ₱0-budget stack (Render Free Docker web service, Supabase Free
  Postgres session pooler, and GitHub Pages wake-up page). Use this skill
  whenever the user asks to deploy Kabisado, run production Alembic migrations,
  create or reactivate an admin account, rotate JWT_SECRET, troubleshoot Render
  or Supabase issues, or run the live E2E verification script. Do not use for
  feature coding (use kabisado-feature-workflow).
---

# Kabisado Deploy & Operations Runbook

Safely release, migrate, administer, and troubleshoot Kabisado without breaking production or incurring any paid cloud charges.

## When this applies
- Preparing a release that includes database migrations
- Creating an admin account or running `python -m app.cli` maintenance commands
- Rotating `JWT_SECRET` or revoking all sessions
- Verifying a live deployment with `backend/scripts/e2e_check.py`
- Troubleshooting Render boot failures, Supabase connections, cookies, or the GitHub Pages wake-up page

## Hard rules (and why)
1. **₱0/month budget rule:** Never suggest adding a credit card, starting a paid trial, or enabling paid tiers on Render, Supabase, or Google AI.
2. **Never commit or paste secrets:** Keep `DATABASE_URL` and `JWT_SECRET` out of git, logs, and chat transcripts.
3. **Always use Supabase session pooler (port 5432):** Direct Supabase Postgres hosts are IPv6-only and fail from Render.
4. **Keep `GEMINI_ENABLED=false`** unless the owner explicitly confirms Google billing, terms, and age-restriction review are complete.
5. **Migrate BEFORE deploying code that expects new schema:** The API refuses to boot if the database revision is behind Alembic head.

## Workflows

### A. Releasing a version with a migration
Execute in one sitting so a sleeping Render instance does not wake on old code against a new schema (or vice versa):
1. Push code so the Render build is ready.
2. Run migrations from your machine against the Supabase session pooler URL:
   ```powershell
   cd backend
   $env:DATABASE_URL="postgresql://...pooler.supabase.com:5432/postgres"
   $env:JWT_SECRET="any-32-or-more-characters-here-0123456789"
   .\.venv\Scripts\alembic upgrade head
   ```
3. Trigger the Render deploy immediately and wait for **Live**.
4. Verify with `backend/scripts/e2e_check.py`.

### B. Admin & maintenance CLI commands
Admins can only be created via CLI (never via the web UI):
- Create admin:
  `python -m app.cli create-admin --username <name> --display-name "<Name>"`
  (Prints a one-time recovery code — remind the owner to save it in a password manager.)
- Reactivate a deactivated account:
  `python -m app.cli reactivate --username <name>`
- Purge expired login/session metadata (>30 days):
  `python -m app.cli purge-expired`

### C. Verifying a live deployment
Run the automated E2E script (it creates and cleans up two throwaway accounts):
```powershell
python backend/scripts/e2e_check.py https://<your-service>.onrender.com
```
Optionally include `E2E_ADMIN_USERNAME` and `E2E_ADMIN_PASSWORD` env vars to test admin routes, then follow the manual checklist in `references/release-checklist.md`.

### D. Rotating `JWT_SECRET`
- **Zero-downtime rotation:** Copy current `JWT_SECRET` to `JWT_SECRET_PREVIOUS`, set a new 32+ char `JWT_SECRET`, deploy, then delete `JWT_SECRET_PREVIOUS` after ~20 minutes.
- **Emergency sign-out of all users:** Set a new `JWT_SECRET`, leave `JWT_SECRET_PREVIOUS` empty, deploy, and run `DELETE FROM sessions;` in Supabase SQL editor (confirm explicitly with the user before any destructive SQL).

## Output format
When guiding an ops task, output:
```markdown
## Ops checklist: [Task]
1. [Step with exact command and placeholder values — never real secrets]
2. ...

## Verification
- How to confirm the operation succeeded.
```

## Examples

**Example 1:**
Input: "We added a new column in migration 0005. How do I deploy safely to Render?"
Output: Provide Workflow A steps (push → set pooler `DATABASE_URL` + 32-char `JWT_SECRET` → `alembic upgrade head` → trigger Render deploy → run `backend/scripts/e2e_check.py`), reminding the user to complete it in one sitting and keep `COOKIE_SECURE=true` and `GEMINI_ENABLED=false`.

## Edge cases
- **Destructive database operations (`DROP`, `DELETE FROM sessions`, `purge-legacy --yes`):** Always stop and ask for explicit user confirmation before executing.
- **Login works locally but reloads sign out in production:** Check `COOKIE_SECURE=true`, HTTPS Render URL, and that `ALLOWED_ORIGINS` includes the Render URL and GitHub Pages origin (no wildcard `*`).
- **Render build fails on `lightningcss`:** Retry once; if persistent, add `lightningcss-linux-x64-gnu` explicitly to `frontend/package.json`.

## Reference files
- `references/release-checklist.md`: read for the full post-deploy manual verification and troubleshooting matrix.
- `docs/operations.md` (in repo root): canonical source of truth for environment variables and known free-tier limits.
