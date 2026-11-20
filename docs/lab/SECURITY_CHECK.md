# LAB verification scope

- `gp_lab_rooms`: RLS enabled; `anon` SELECT and `authenticated` UPDATE permissions are false; service access true. This is intentionally a server-only table with no client policies.
- Supabase advisor INFO `rls_enabled_no_policy` is expected for this table: direct client access is denied. [Advisor reference](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Existing project warning about leaked-password protection belongs to Supabase Auth and was not changed by this LAB work. LAB pairs a test device using one-use tokens rather than creating real employee passwords. [Auth reference](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Service-role key stays in Supabase Edge runtime; only the separate LAB owner secret is configured on the new Vercel project. APK contains no owner code, Vercel credentials, or Supabase service key.
- The public APK and download page were retrieved without Vercel authentication. A protected deployment URL is not needed for the stable public alias.
- Release APK package/signature and remotely streamed SHA-256 matched `dist/VERIFICATION.json`.
