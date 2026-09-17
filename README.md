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
| `SUPABASE_URL` | Supabase project URL (server-side only). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role / secret key. Server-side only — never exposed to the browser. RLS is on with no anon policies. |
| `WONDER_SECRET_KEY` | 32+ char key that encrypts BYOK provider secrets at rest (AES-256-GCM). Required in production. |

Without the Supabase variables the app runs in local-only mode (browser localStorage + in-memory server state). With them, every store syncs per tenant to `wonderjobs.app_state`, provider keys go to `wonderjobs.ai_provider_secrets` (ciphertext only) and external actions are audited in `wonderjobs.action_audit`. All tables live in the dedicated `wonderjobs` schema (migrations `wonderjobs_persistence`, `wonderjobs_schema_isolation`).

## Docs

- `docs/IMPLEMENTATION_TRACKER.md` — requirement-by-requirement status and deviations.
