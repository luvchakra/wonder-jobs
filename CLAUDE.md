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

## Repository layout

- Monorepo with npm workspaces. The Next.js app lives in `apps/web` (Vercel root directory).
- `npm run check` (from the root or `apps/web`) runs lint, typecheck, tests and the production build; run it before pushing.
- Database schema lives in `apps/web/supabase/migrations/`; the bundled registry in `apps/web/src/server/migrations/index.ts` must match it (a unit test enforces this).
- Requirement status and deviations are tracked in `docs/IMPLEMENTATION_TRACKER.md`; update it with every feature change.
- `docs/PROGRESS.md` is the high-level progress tracker (epics → stories, done / partial / backlog). Update it at the end of **every** story, including stories that were descoped or remain open, and keep its roadmap in step with the "Roadmap" section of `apps/web/src/content/help.ts`.
