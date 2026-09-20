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

## Repository layout

- Monorepo with npm workspaces. The Next.js app lives in `apps/web` (Vercel root directory).
- `npm run check` (from the root or `apps/web`) runs lint, typecheck, tests and the production build; run it before pushing.
- Database schema lives in `apps/web/supabase/migrations/`; the bundled registry in `apps/web/src/server/migrations/index.ts` must match it (a unit test enforces this).
- Requirement status and deviations are tracked in `docs/IMPLEMENTATION_TRACKER.md`; update it with every feature change.
- `docs/PROGRESS.md` is the high-level progress tracker (epics → stories, done / partial / backlog). Update it at the end of **every** story, including stories that were descoped or remain open, and keep its roadmap in step with the "Roadmap" section of `apps/web/src/content/help.ts`.
