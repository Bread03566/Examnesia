# Kabisado Post-Deploy Verification & Troubleshooting

## Manual Verification (After `e2e_check.py`)
1. **Persistence across restart:** Restart the Render service from the dashboard, then log in with a pre-existing account and confirm its modules are intact.
2. **Session persistence on reload:** Reload the page while signed in; the `__Host-kabisado_rt` refresh cookie must keep the session active.
3. **Cross-browser & mobile check:** Verify sign-in cookie behavior on Chrome, Safari, and Firefox, at phone width, and using keyboard Tab navigation.
4. **Wake-up page:** Open the GitHub Pages URL while Render is asleep; confirm the wake message appears and redirects once the API responds.

## Quick Troubleshooting Matrix
| Symptom | Likely Cause & Fix |
|---|---|
| API refuses to boot: `"Run: alembic upgrade head"` | Production DB is behind head. Run `alembic upgrade head` against the Supabase session pooler URL. |
| Sign-in succeeds but reload logs you out | Cookie rejected. Confirm `COOKIE_SECURE=true`, HTTPS Render origin, and exact `ALLOWED_ORIGINS`. |
| Wake-up page times out after 90 s | Pages origin missing from `ALLOWED_ORIGINS`, or Render service failed to boot (inspect Render logs). |
| `"Too many attempts"` on login | Per-username + IP throttle active. Clears automatically within 15 minutes. Check `TRUST_PROXY=true` on Render. |
| Missing `lightningcss` binary on Render build | Retry build; if persistent, add `lightningcss-linux-x64-gnu` to `frontend/package.json`. |
