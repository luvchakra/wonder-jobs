/**
 * Unit tests never reach a real service (owner-visible incident, 2026-11-01): a machine whose environment holds the
 * production Supabase keys (a cloud session, a developer's shell) ran the unit tests, and tests that use the real
 * stores wrote to production: test companies in the company directory, the scheduler's settings, the ratings history.
 *
 * Loaded first by vitest (`setupFiles`), this removes every credential-like variable from the test process, so each
 * store falls back to its in-memory twin. A test that needs a variable stubs its own (`vi.stubEnv`).
 */
const CREDENTIAL = /SUPABASE|DATABASE_URL|POSTGRES|STRIPE|RESEND|SENDGRID|SMTP|VAPID|CRON_SECRET|GATEWAY_|JOBSLAKE_|WONDERJOBS_|_API_KEY$|_SECRET$|_TOKEN$|_PASSWORD$|_KEY$/;

for (const name of Object.keys(process.env)) {
  if (CREDENTIAL.test(name)) delete process.env[name];
}
