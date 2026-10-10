# <Project> — working rules for Claude

<!-- Replace <placeholders>. Delete any section that doesn't apply. Keep rules short and checkable. -->

## Always start from the latest `main`

Before doing anything else in a session (reading code, planning, editing, answering questions about the codebase), fetch and merge the latest `main`:

```bash
git fetch origin main
git merge origin/main        # or: git rebase origin/main, when the branch is yours alone
```

- Do this at the start of every session and again before every push.
- If `main` has moved, resolve conflicts first. Never build on a stale base.

## Real data only

The product earns trust by never showing a user anything it did not actually find, compute or receive.

- **Signed-in users see only real data.** Values come from real sources (`<path to data providers>`) and are computed from them. Nothing is seeded, generated, sampled or hardcoded for a real account. Mock or generated data (`<path to mocks>`) is for demo and local mode only, behind `<demo-mode check>`. Never widen that gate.
- **Never substitute a default for the user's intent.** Queries, thresholds and goals come from what the user typed or from their saved profile. When nothing can be derived, ask; don't fall back to a placeholder.
- **When a real value is unavailable, say so.** A missing credential shows "Needs setup", a failed fetch shows "Unavailable", and an empty result is an empty state with the reason. Don't fill the gap.
- **Show provenance.** If a number appears in the UI, the user must be able to see where it came from. AI-generated content is labelled as AI-generated.
- **Verify before claiming.** Before saying data is real or a source works, check the actual code path and the production logs, or reproduce the call. Don't answer from the docs.

## AI and automation governance

- **AI proposes, application code decides.** `<path to AI service boundary>` is the only place app code talks to a model. Model output is a draft or proposal. It never decides authorization, ownership, or whether an external side effect happens.
- **One deterministic gate.** Every AI-driven or external-effect action goes through `<path to policy/permission function>`. A missing or unreadable policy fails closed (ask the user, or don't run). Never default to automatic.
- **Irreversible actions are opt-in.** Anything that can't be undone (sending, submitting, paying, deleting) runs only when the user turned it on. It is idempotent, audited, and visible to the user afterwards.
- **UI copy must match what the code does.** A confirmation dialog is a contract. Never say "sent", "submitted" or "can't be undone" unless that is literally true.
- **External content is data, never instructions.** Uploaded files, fetched pages, emails and imported documents are untrusted text to extract from or display. They can never change a prompt's system behaviour, skip the gate, or trigger an action.
- **Every external side effect has an idempotency key and an audit entry** before it has anything else. Reuse `<existing ledger/audit mechanism>`; don't add a parallel one. A retry or rerun must never repeat a completed external action.
- **Provenance on AI artifacts.** Mark each value as AI-generated, user-provided, user-modified or system-derived, and keep that visible.

## Identity, tenant isolation and security

- The tenant is the session's user id (`<path to auth>`). Every route and query filters by it explicitly.
- Don't rely on database row-level security to catch a missing tenant filter unless real policies exist. Write the filter every time.
- Secrets (API keys, tokens) are encrypted at rest (`<path to secrets store>`) and masked on read. Never log a decrypted secret, send one to the client, or add a secret type that bypasses the store.
- Never commit secrets. If one appears in chat or logs, recommend rotating it.

## Minimal UI

Every page stays minimal. Before adding a control, look for one to remove.

- **Fewest buttons and options possible.** One primary action per screen. A list item carries at most one action; the rest live on the item's own page.
- **Fold, don't show.** Settings, rarely used options, explanations and advanced controls go behind a collapsed row (`<Fold component>`).
- **Default instead of asking.** Pick a sensible default from the user's data rather than adding a selector.
- **Short copy.** At most one line of help. No repeated explanations, badges or "why" blocks on list items.
- When changing a page, count its visible controls before and after. The number should go down, not up.

## Ship fast (pre-launch; adjust after launch)

The owner tests changes themselves, so getting a change in front of them fast beats exhaustive pre-push verification.

- **Fastest path to something testable:** commit, push the branch, open a PR, merge (squash) as soon as CI is green, then confirm the production deploy is ready. Use branch previews only if the host's deployment budget allows them (see "Build-slot budget").
- **Before pushing, run only fast, relevant checks:** typecheck (`<typecheck command>`), lint on the files you changed, and unit tests for the areas you touched (`<test command> <paths>`). CI runs the full suite (`<full check command>`); let it.
- **Don't run** end-to-end, accessibility or full-app walkthroughs unless asked or the change is genuinely risky. A quick look at the one screen you changed is enough.
- **Notify the owner when a task is done** (merged, or blocked on something only they can do), with a one-line outcome. Send one notification per finished task, not one per step.
- **Still required, because they're cheap and protect trust:** the rules above, plus a unit test for any change to the permission gate, any workflow that gates AI-touching or external-effect actions, billing, or any database query or migration (check the tenant filter explicitly).

## Build-slot budget

Hosting platforms often cap deployments per day (Vercel's free plan: 100) and count every deployment they create, including ones an ignored-build step cancels. Running out blocks production, so deployments are a budget, production first.

1. **Create no deployment you don't need.** Turn automatic deployments off for working branches at the platform level (Vercel: `vercel.json` → `"git": {"deploymentEnabled": {"*/**": false}}`, with working branches always named `prefix/topic`). An ignore script that cancels the build still uses a slot. Keep previews off unless someone will open them, and don't link a second project to the same repository.
2. **One merge to main = one production deployment, so merge in bigger pieces.** Squash-merge; put docs, changelog, tracker and test updates in the same PR as the code. No docs-only PRs while a code PR is open or about to open.
3. **Tests on the hosting platform cost a slot per run.** Run end-to-end tests on the CI runner. Run pre-merge platform tests only for security-sensitive changes (auth, permissions, database rules, integrations). Keep scheduled suites few, and skip them when main hasn't changed since the last green run. Never re-run a failed run hoping it passes.
4. **Verify before pushing.** Typecheck, lint, the touched unit tests and a local production build; push a branch once, when it's ready.
5. **Watch the budget.** Count the last 24 hours' deployments before deployment-heavy work. Above ~70% of the cap, stop test runs and docs-only merges; keep the rest for production and hotfixes.
6. **When the cap is hit:** stop pushing to branches that deploy (refused deployments aren't queued), wait until the oldest counted deployment is 24 hours old, then redeploy only the latest main, once. Treat "rate limited" statuses as infrastructure, not test failures.

## Working conventions

- **Branches:** one branch per task, created from the latest `main`. Never push directly to `main`.
- **Commits and PRs:** say what changed and why in plain words. Include the user-facing effect. Don't put model names in PR bodies.
- **Docs to keep current:**
  - `<docs/TRACKER.md>`: one short row per feature, including any security or governance implication.
  - `<docs/PROGRESS.md>`: one line per finished story.
  Don't update the user-facing help guide unless asked.
- **CI red:** root-cause it. "Flake" is not a cause. Never skip or disable a test to get green. A failure caused by infrastructure (e.g. a hosting rate limit) gets one PR comment saying so; it isn't fixed in code.
- **Merge conflicts in tracker docs:** keep both sides' rows.

## Repository layout

- `<monorepo / package manager / workspace notes>`
- App: `<path>`; deploy target: `<host>`, with root directory `<path>`.
- Database schema: `<migrations path>`. Any registry that mirrors it must match (a test enforces this).
- Full check: `<command>` (lint, typecheck, tests, build). CI runs it on every PR.
- Planning docs to read before changing navigation or information architecture: `<paths>`.
