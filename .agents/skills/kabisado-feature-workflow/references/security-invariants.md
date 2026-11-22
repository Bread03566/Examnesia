# Kabisado Security & Architecture Invariants

Check this list whenever adding or modifying routes, models, uploads, AI calls, or frontend auth handling. These invariants are backed by automated tests in `backend/tests/`.

## 1. Authentication & Authorization
- **No accidental public routes:** Every `/api/*` route must require a bearer token except the explicit `PUBLIC` set in `backend/tests/test_security_review.py` (`/api/health`, `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/recover`).
- **Ownership isolation (404, not 403):** When a student requests another student's document, topic, flashcard, quiz, chat, progress, flag, exam prep, or export resource, return `404` so resource IDs cannot be enumerated. Verified by `backend/tests/test_ownership_matrix.py`.
- **Admin enforcement:** Every `/api/admin/*` route must enforce `role == "admin"` server-side (`403` for students). Admins cannot deactivate themselves or other admins, and every admin mutation must be audit-logged (`backend/tests/test_admin_roles.py`, `backend/tests/test_admin_dashboard.py`).
- **Sessions & passwords:** Passwords use Argon2id (`t=2`, `19 MiB`). Access tokens live 15 minutes in memory only. Refresh tokens use `HttpOnly`, `Secure` (prod), `SameSite=Strict`, `__Host-` cookie with rotation and reuse detection.

## 2. Error Handling, Headers & Docs
- **No internal leaks:** Unhandled exceptions must never expose tracebacks, SQL, or `DATABASE_URL` connection strings (`test_unhandled_errors_do_not_leak_internals`).
- **No secret logging:** Never log passwords, access/refresh tokens, recovery codes, or `JWT_SECRET`.
- **API docs off in production:** `/docs`, `/redoc`, and `/openapi.json` are disabled unless `DEBUG=true`.
- **CORS:** `ALLOWED_ORIGINS` must list explicit origins; `*` is rejected by `Settings` validation.

## 3. Uploads & Quotas
- Enforce magic-byte validation, macro and zip-bomb rejection (`DOCX_MAX_UNCOMPRESSED_MB=50`), file size (`MAX_UPLOAD_MB=10`), extracted text length (`MAX_TEXT_CHARS=400_000`), per-student quotas (`MAX_DOCS_PER_USER=25`, `STUDENT_TEXT_QUOTA_KB=5000`), and global quota (`GLOBAL_TEXT_QUOTA_MB=300`).
- Discard uploaded original files after text extraction (Render's disk is ephemeral).

## 4. AI Kill Switch & Consent Gate
- `GEMINI_ENABLED` defaults to `False`. When `False`, zero outbound requests to Google are allowed even if `GEMINI_API_KEY` is present (`backend/tests/test_gemini_switch.py`).
- Before any Gemini request, re-check user consent from the database and fail closed (`backend/tests/test_consent.py`).
- Respect per-user (`GEMINI_USER_DAILY_CALLS`) and global (`GEMINI_GLOBAL_DAILY_CALLS`) daily caps.

## 5. Frontend Safety
- Never use `dangerouslySetInnerHTML`, `innerHTML`, or `eval`.
- CSP in production enforces `default-src 'self'` and `frame-ancestors 'none'`. Avoid inline scripts or unbundled external script tags.
