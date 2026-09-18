# WonderJobs

Your next opportunity is out there. Wonder finds it.

Monorepo (npm workspaces). The web app lives in `apps/web` (Next.js 16, App Router, TypeScript, Tailwind v4).

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run check      # lint + typecheck + tests + production build
```

## Configuration

Copy `apps/web/.env.example` to `apps/web/.env.local` (and set the same variables in Vercel):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (`SUPABASE_URL` also accepted). |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key. Used by the browser for Supabase Auth (sign-in, sign-up, magic links) and by the server/proxy to verify session tokens. Data access itself stays service-role and server-side. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key. Server-side only — never exposed to the browser. RLS is on with no anon policies. |
| `SECRET_ENCRYPTION_KEY` | 32+ char key that encrypts BYOK provider secrets at rest (AES-256-GCM). Required in production (`WONDER_SECRET_KEY` also accepted). |

Without the Supabase variables the app runs in local-only mode (no sign-in, the seeded demo candidate, browser localStorage + in-memory server state). With them, visitors sign in with Supabase Auth, every store syncs per user to `wonderjobs.app_state`, provider keys go to `wonderjobs.ai_provider_secrets` (ciphertext only) and external actions are audited in `wonderjobs.action_audit`. All tables live in the dedicated `wonderjobs` schema. Schema source: `apps/web/supabase/migrations/`.

## Accounts, sessions and the demo

- **Sign-in** (`/sign-in`, `/sign-up`): email + password or a magic link, through Supabase Auth. Sessions live in cookies (`wj-auth`, chunked) so the route proxy and API routes can verify them; the proxy (`apps/web/src/proxy.ts`) guards `/app/*` and `/onboarding`, refreshes expired sessions and mirrors the verified user id into `wj_user` for client-side state namespacing. API routes answer `401` without a session.
- **Per-user state**: a new account starts empty (no invented history), goes through onboarding to create its Career DNA, and everything it does syncs to its own tenant (`tenant_id` = Supabase user id). Local copies are namespaced per user, so a shared device never mixes accounts; sign-out revokes the refresh token, clears cookies and drops that user's local copy.
- **Demo** (`/demo`, also under the avatar menu): the sample candidate "Alex Morgan" with realistic history. Runs entirely on this device (`demo:` localStorage namespace, no server sync, no account). `/demo/exit` leaves it.
- **Supabase Auth settings to check** in the dashboard (Authentication → URL configuration): set *Site URL* to the deployment origin and add `<origin>/auth/callback` to *Redirect URLs*, otherwise confirmation and magic-link emails point at `localhost`. "Confirm email" is on by default; the built-in SMTP is rate-limited, so either connect an SMTP provider or turn confirmation off for password sign-ups.

## Database schema

Apply the schema once per Supabase project, either:

- **SQL Editor** — paste each file in `apps/web/supabase/migrations/` (in order) into Supabase → SQL Editor and run it, or
- **CLI** — `DATABASE_URL="postgresql://…" npm run db:migrate` (idempotent; records applied files in `public._wonderjobs_migrations`), or
- **From the deployment** — `POST /api/admin/migrate` with `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` and body `{ "databaseUrl": "postgresql://…" }`. Runs only the bundled migrations; useful when your machine can't reach Postgres directly (Supabase's direct host is IPv6-only — the route falls back to the IPv4 pooler automatically).

## Docs

- `docs/IMPLEMENTATION_TRACKER.md` — requirement-by-requirement status and deviations.
