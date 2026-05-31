## Plan: Restart dev server and verify Supabase env vars

1. Restart the Vite dev server so it picks up the `.env` file (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).
2. Open the preview in the browser at `/login` and check:
   - No "Missing Supabase environment variable(s)" error in the console
   - Login page renders
   - No startup crash
3. Capture console logs and report results.
4. If errors remain, share the new console output and propose a follow-up fix.