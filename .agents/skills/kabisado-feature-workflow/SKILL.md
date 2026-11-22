---
name: kabisado-feature-workflow
description: >
  End-to-end development workflow for adding or modifying features in the
  Kabisado study app (FastAPI backend, SQLAlchemy/Alembic models, Gemini or
  offline AI engine, and React/Tailwind frontend). Use this skill whenever the
  user asks to add an endpoint, build a new study feature, change the database
  schema, update auth/roles, modify AI generation, or refactor backend or
  frontend code in Kabisado — even if they don't mention tests or security
  checks. Do not use for deployment/ops tasks (use kabisado-deploy-ops) or
  pure UI copywriting (use kabisado-brand-copy).
---

# Kabisado Feature Workflow

Build and verify changes in Kabisado without breaking its security invariants, offline-first AI guarantee, or free-tier database constraints.

## When this applies
- Adding or changing FastAPI routes under `backend/app/routers/`
- Adding or editing SQLAlchemy models or Alembic migrations under `backend/migrations/`
- Modifying AI generation, consent checks, or offline fallback logic in `backend/app/services/`
- Adding or updating React views/components in `frontend/src/`

## Workflow

1. **Identify the affected layers** before editing.
   - Check whether the change touches routes, models/migrations, AI/offline services, or React views.
   - Read `references/security-invariants.md` whenever touching routes, auth, uploads, AI calls, or user-owned records. Kabisado enforces these invariants in automated tests that will fail on regressions.

2. **Enforce auth, ownership, and data boundaries on every backend route.**
   - Require the authenticated user dependency on every new `/api/*` route. `backend/tests/test_security_review.py` sweeps the OpenAPI schema and fails if any non-public route allows anonymous access.
   - Scope every query by `user_id` and return `404` (not `403`) when a record belongs to another student, so IDs cannot be probed.
   - Enforce admin roles server-side on `/api/admin/*` and write an audit log entry for admin mutations.

3. **Preserve the offline-first AI kill switch and consent gate.**
   - Never call Gemini unless `GEMINI_ENABLED=true` AND database-backed user consent is verified at request time. Failing closed protects the ₱0 budget and user privacy.
   - Always implement or preserve deterministic behavior in the offline fallback engine (`backend/app/services/ai_service.py`) so the feature works with `GEMINI_ENABLED=false` and remains 100% testable without API keys.

4. **Handle schema changes through Alembic.**
   - In production, `AUTO_CREATE_SCHEMA=false` and the API refuses to start if the database revision is behind.
   - Create an Alembic migration under `backend/migrations/` for any model change, and keep migrations compatible with both SQLite (local tests) and Postgres (Supabase production).

5. **Keep the React frontend safe and consistent.**
   - Never use `dangerouslySetInnerHTML`, `innerHTML`, or `eval` (use `frontend/src/components/Markdown.jsx` for rendered content).
   - Keep access tokens in memory via `frontend/src/services/authClient.js`; never persist tokens to `localStorage` or `sessionStorage`.
   - Use `kabisado-brand-copy` when writing new Taglish microcopy or Kabi reactions.

6. **Verify before finishing.**
   Run the checks matching what you changed:
   - Backend tests:
     ```powershell
     cd backend
     .\.venv\Scripts\pytest -v
     ```
   - Frontend lint, unit tests, and production build:
     ```powershell
     cd frontend
     npm run lint
     npm test
     npm run build
     ```

## Output format
Summarize completed feature work using this structure:
```markdown
## Summary
- What changed and why.

## Files changed
- `path/to/file` — brief description

## Verification
- Exact test/lint/build commands run and their results.
```

## Examples

**Example 1:**
Input: "Add a bookmark toggle on flashcards so students can star hard cards."
Output plan:
1. Add `is_bookmarked` column to `Flashcard` in `backend/app/models/models.py` + Alembic migration in `backend/migrations/`.
2. Add authenticated `PATCH /api/flashcards/{id}/bookmark` in `backend/app/routers/flashcards.py` scoped by `current_user.id` (returning `404` if not owned).
3. Add ownership and anonymous-access coverage in `backend/tests/test_ownership_matrix.py` (and confirm `test_security_review.py` passes).
4. Add bookmark toggle button in `frontend/src/views/FlashcardStudyMode.jsx` wired through `frontend/src/services/api.js`.
5. Run `pytest -v`, `npm run lint`, `npm test`, and `npm run build`.

## Edge cases
- **New public route needed:** Only add to `PUBLIC` in `backend/tests/test_security_review.py` if the route genuinely must be unauthenticated (like health or auth) and handles its own throttling/origin checks. Explain why in the summary.
- **Upload handling changes:** Keep magic-byte checks, macro/zip-bomb guards (`DOCX_MAX_UNCOMPRESSED_MB`), per-student/global text quotas, and discard originals after extraction.
- **No `.venv` or `node_modules` installed:** Report which verification step could not run instead of claiming it passed.

## Reference files
- `references/security-invariants.md`: read before modifying routes, auth, uploads, AI consent, or admin features.
