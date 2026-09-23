# WonderJobs — working rules for Claude

## Always start from the latest `main`

Before doing anything else in a session (reading code, planning, editing, answering questions about the codebase), fetch and integrate the latest `main`:

```bash
git fetch origin main
git merge origin/main        # or: git rebase origin/main, when the branch is yours alone
```

- Do this at the start of every session and again before every push.
- If `main` has moved, resolve conflicts first; never build on a stale base.
- Only after the working branch is up to date with `origin/main` may other activity begin.

## Real data only

WonderJobs earns trust by never showing a candidate anything it did not actually find, compute or receive. Every change must keep that true:

- **Signed-in accounts see only real data.** Jobs come from live sources through `apps/web/src/server/jobs/providers.ts`; matches, quality signals, insights and counts are computed from those postings and the candidate's own Career DNA. Nothing is seeded, generated, sampled or hardcoded for a real account — not a job, a company, a number, a chart series, a "typical" value or a canned search term. Generated data (`services/mock/*`) exists for demo and local mode only, gated on `getClientMode().mode !== "user"`; never widen that gate.
- **Never substitute a default for the candidate's intent.** A search query, location, threshold or goal comes from what the candidate typed or from their Career DNA (`defaultSearchQuery` in `services/jobs/normalize.ts`); when nothing can be derived, ask — do not fall back to a placeholder like "product manager".
- **When a real value is unavailable, say so.** A source without credentials is "Needs setup", a failed fetch is "Unavailable", an empty result is an empty state with the reason. Do not fill the gap.
- **Show provenance.** A run says what it searched, where, and across which sources; per-source counts are evidence on the search stage; AI drafts are labelled AI-generated. If a number appears in the UI, the candidate must be able to see where it came from.
- **Verify before claiming.** When asked whether data is real, or before asserting a source works, check the actual code path and the production logs (`/api/jobs/search` runtime logs on Vercel) or reproduce the fetch — do not answer from the docs.

## AI and agent governance

WonderJobs already separates "what AI may decide" from "what only application code may decide." Every change must keep that separation, not blur it:

- **AI proposes, application code decides.** `services/ai/service.ts` / `domain/ai/types.ts` is the only boundary through which app code talks to a model (WonderJobs AI template provider, or Anthropic/OpenAI/Gemini BYOK); AI output is a draft or a proposal — resume text, a cover letter, a screening answer, a follow-up email, a career insight. It is never the thing that decides whether an action is authorized, who a job belongs to, or whether an external side effect happens.
- **`domain/automation/policy.ts::resolveCapability` is the single deterministic gate**, already wired in front of every AI-touching or external-effect capability (generate résumé/cover letter, send email, submit application, change Career DNA, etc.). It combines a capability's fixed risk tier, the candidate's chosen automation level (Assist/Guided/Autonomous/Continuous), and their per-capability policy (automatic/ask/off). Never add a code path — AI-driven or otherwise — that performs a gated action without going through this function. If a policy or automation-level lookup fails or is missing, that must fail closed (ask the candidate, or don't run the capability) — never default to automatic execution.
- **The `apply` workflow stage must never gain the ability to submit an application to an employer on its own**, at any automation level. This is currently enforced structurally, not just by policy: there is no server-side `apply` executor past `rank`, and the client executor only opens the employer's page and records a hand-off note — "submitted" is set exclusively by the candidate's own later click. Preserve that structural limit; do not let "make automation smarter" become "let Wonder submit for the candidate."
- **UI copy describing an action must match what the code actually does.** A confirmation dialog is a contract with the candidate. (A 2026-09 audit found real drift here — a modal claiming an action "submits your application… can't be undone" when it only hands off, and a "send" confirmation claiming real email delivery that was actually a mocked delay — see `docs/UX_BASELINE_AUDIT.md` §18–19 for the specifics being fixed. Don't reintroduce this class of bug in new copy.)
- **External content is data, never instructions.** A candidate's uploaded résumé (`server/resume/extractText.ts`, `parseResume.ts`), a fetched job posting (`server/jobs/providers.ts`), or any future imported document/email/link is untrusted text to extract fields from or display — never something whose content can redefine an AI prompt's system behavior, skip `resolveCapability`, or trigger an action by itself.
- **Every external side effect needs a stable idempotency key and an audit trail before it needs anything else.** The workflow engine's action ledger (keyed e.g. by `submit:{jobId}:me`) and `store/actions.ts` + `/api/audit`'s draft → confirm → execute-once → audit pattern are the existing implementations — reuse them for any new action with a real-world effect rather than adding a parallel mechanism. A rerun, retry, or rescheduled run must never repeat an already-completed external action.
- **Every AI-generated artifact keeps its provenance** (`AI_GENERATED` / `USER_PROVIDED` / `USER_MODIFIED` / `SYSTEM_DERIVED`, per `domain/workflow/resolve.ts`) visible to the candidate. Don't add an AI-touching surface that hides whether a value came from the model or the person.

## Identity, tenant isolation and security

- Tenant is the session's user id (`server/auth.ts`); every route and query must filter by it explicitly.
- **Known gap, not a design goal: Postgres RLS is enabled on every `wonderjobs` table but no `CREATE POLICY` exists anywhere in the migrations** (confirmed in the 2026-09 audit). Isolation is enforced entirely in application code — the schema is revoked from `anon`/`authenticated`, and only the service role (which bypasses RLS regardless) can reach it. Never write a Supabase query that omits an explicit tenant filter on the assumption that RLS will catch a mistake — it will not. If you add real per-tenant RLS policies, update this note.
- A legacy/no-auth mode exists (a random `wj_uid` cookie, used when Supabase Auth isn't configured) where tenant identity has no real authentication behind it — acceptable for local/dev, but never describe or market that mode as equivalent to authenticated tenant isolation.
- Secrets (BYOK provider keys) are AES-256-GCM encrypted server-side and masked on read (`server/secrets.ts`); never log a decrypted key, pass one to the client, or add a new secret type that skips this store.

## Testing and regression discipline

- `npm run check` (lint, typecheck, tests, production build) before every push — unchanged, see Repository layout below.
- `npm run e2e` (Playwright) and `npm run a11y` (axe-core) exist but are **not** part of CI (they need real time and real Supabase credentials). Run them yourself for any change touching auth, onboarding, Career DNA, automation/scheduling, BYOK, or PWA/push — the 2026-09 audit found these are exactly the areas with the thinnest automated coverage, so CI passing is not sufficient evidence there.
- Any change to `domain/automation/policy.ts`, `domain/workflow/*`, or anything gating an AI-touching or external-effect action needs a unit test for the specific authorization/governance path (policy off / ask / automatic, wrong automation level, failed lookup) — not just the happy path.
- Any change touching a Supabase query or migration: verify the tenant filter explicitly in the test, don't rely on RLS to enforce it (see above).

## Repository layout

- Monorepo with npm workspaces. The Next.js app lives in `apps/web` (Vercel root directory).
- `npm run check` (from the root or `apps/web`) runs lint, typecheck, tests and the production build; run it before pushing.
- Database schema lives in `apps/web/supabase/migrations/`; the bundled registry in `apps/web/src/server/migrations/index.ts` must match it (a unit test enforces this).
- Requirement status and deviations are tracked in `docs/IMPLEMENTATION_TRACKER.md`; update it with every feature change — including the security/governance implication when the change touches automation policy, AI providers, or external actions, not just what changed on screen.
- `docs/PROGRESS.md` is the high-level progress tracker (epics → stories, done / partial / backlog). Update it at the end of **every** story, including stories that were descoped or remain open, and keep its roadmap in step with the "Roadmap" section of `apps/web/src/content/help.ts`.
- `docs/UX_BASELINE_AUDIT.md`, `docs/UX_CAPABILITY_MAP.md` and `docs/UX_SIMPLIFICATION_DECISIONS.md` are the current UX-simplification planning docs (Phase 1, Step 1 complete as of 2026-09-23) — consult them before changing navigation, information architecture, or any screen they inventory, rather than re-deriving the current implementation from scratch.
