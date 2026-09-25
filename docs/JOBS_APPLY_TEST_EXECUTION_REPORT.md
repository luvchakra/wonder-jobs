# JobsApply — test execution report (spec §160, §162)

_2026-09-25._ Audit: [`JOBS_APPLY_IMPLEMENTATION_AUDIT.md`](./JOBS_APPLY_IMPLEMENTATION_AUDIT.md). Adapters: [`JOBS_APPLY_ADAPTER_MATRIX.md`](./JOBS_APPLY_ADAPTER_MATRIX.md). Helper: [`JOBS_APPLY_EXTENSION_ARCHITECTURE.md`](./JOBS_APPLY_EXTENSION_ARCHITECTURE.md).

## How it was run

- **Unit and API tests:** `npm run check`, which covers lint, typecheck, the full Vitest suite and the production build. Result: 877 passed, 6 skipped.
- **Playwright:** run against a production build in demo mode (`next build && next start -p 3211`) with:
  - Supabase unset;
  - `SECRET_ENCRYPTION_KEY` set (needed for helper tokens);
  - `JOBSLAKE_LOCAL_ADMIN=1`.

  Command: `PLAYWRIGHT_BASE_URL=http://localhost:3211 npx playwright test e2e/jobs-apply.spec.ts --project=chromium --project="Mobile Chrome"`.
- **The browser helper:** the real MV3 extension is loaded into Chromium. The test build changes only two things:
  - its server origin;
  - host access to the mock employer hosts, standing in for the candidate's "Allow on this site" permission prompt, which automation can't click.
- **Employer pages:** WonderJobs' own mock portals, served by request interception. No real employer site was contacted and nothing was submitted anywhere (§150).

## Totals

| Suite | Tests | Pass | Fail | Blocked | N/A |
|---|---:|---:|---:|---:|---:|
| Domain (`src/domain/jobs-apply/jobsApply.test.ts`): classification (APPLY-011…020, 040, 052), profile, mapper, destination (APPLY-008/010, SEC-010/011), governance (policy off/ask/automatic, wrong level, failed lookup), state machine (APPLY-053), session golden path, audit value-free (SEC-006/007), CAPTCHA/MFA/sign-in/payment/domain, stop (EXT-009), unknown submission (APPLY-061), multi-step (APPLY-031…034), AI provenance, readiness and duplicates (APPLY-002/006) | 47 | 47 | 0 | 0 | 0 |
| Server/API (`src/server/jobsApply/jobsApply.server.test.ts`): session create/recover/start over (APPLY-004/005), duplicate (APPLY-006), hand-off policy off, tenant isolation (SEC-001), token forged/expired/revoked (SEC-002/003), strict payloads (SEC-008/009, APPLY-047/049), fill policy, confirmation flow (APPLY-054…060), audit (SEC-006/007), file access (SEC-005), human-only answers, redirect, CSRF (SEC-012), pack validation, admin counts-only | 18 | 18 | 0 | 0 | 0 |
| Helper static guarantees (`src/server/jobsApply/extension.test.ts`): no click/submit/key code (APPLY-053, EXT-010), no password/OTP/card reads (APPLY-047/048), tokens in the worker only (EXT-003), narrow permissions (§46) | 10 | 10 | 0 | 0 | 0 |
| Playwright with the real helper (chromium) — golden journeys | 7 | 7 | 0 | 0 | 0 |
| Playwright with the real helper (chromium) — adapter contracts ADAPTER-001…010 (Greenhouse, Lever, Ashby, Workday) | 4 | 4 | 0 | 0 | 0 |
| Playwright web-only (chromium + Mobile Chrome) | 9 | 9 | 0 | 0 | 1 (admin on mobile) |
| Helper journeys on Mobile Chrome | — | — | — | — | 11 (desktop extension) |
| Firefox / WebKit | — | — | — | all | — (browsers not installed here; Chrome-only helper) |

The runs were repeated: the chromium suite ran 3 times (24/24 twice, and the full suite once). There were no flakes.

## Golden journeys (§132–§141)

| # | Journey | Result | Where |
|---|---|---|---|
| 1 | Job → Apply with Wonder → form → fill safe fields → résumé attached → 2 questions → candidate answers → submits on the employer's site → confirmation → Applications | PASS | `GJ1` |
| 2 | Sign-in required → candidate signs in → verification challenge pauses → candidate completes → fill. Password never reaches WonderJobs | PASS | `GJ2` |
| 3 | Unknown ATS → generic reader → part filled, part guided | PASS | `GJ3` |
| 4 | Automation fails → guided mode → copy, download, open → mark submitted | PASS | `APPLY-063/071` + web `GJ4` |
| 5 | Existing application → duplicate warning → View application | PASS | web `GJ5` |
| 6 | Session interrupted → reload → "Continue application" | PASS | `EXT-009 / GJ6` |
| 7 | Unexpected redirect → pause → candidate reviews → stops | PASS | `GJ7` |
| 8 | Salary question → candidate enters → remembered → filled | PASS | `GJ3` |
| 9 | Open question → AI draft (labelled) → candidate edits → approves → inserted | PASS | `GJ1` |
| 10 | Work authorization → Wonder pauses → candidate answers on the form → continue | PASS | `GJ1` |

## Defects found by these tests and fixed

1. **The helper counted a sign-in button as submitting the application.** A submit event from a form containing a password field is now ignored.
2. **An unexpected redirect wasn't detected.** A tab on an unrelated host no longer matched any session, so the helper fell back to legacy mode. Sessions are now bound to the tab. The move is reported, WonderJobs pauses with DOMAIN_CHANGED, and nothing on that page is read.
3. **A page re-read could lift a pause only the candidate may lift** (unexpected domain, payment, stop). `recordInspection` now leaves those untouched.
4. **"Signed in" wasn't recorded when a verification challenge came between the sign-in and the form.** Fixed.
5. **A file field in a hidden, later form step was treated as visible and filled early.** File inputs inside a hidden section are no longer read.

## Known limitations

- **Domain protection works only where the helper can run:** the static ATS hosts, and sites the candidate allowed. On a host with neither, the helper isn't present to notice. The session stays paused only if it was on a permitted host.
- **Multi-instance races.** Sessions are read-modify-write JSON documents per tenant, serialised within one server instance. Concurrent writes from two instances could race.
- **No production telemetry store.** The admin view aggregates sessions of the latest 200 tenants on demand.
- **Real-account run blocked.** The signed-in (Supabase) run of these journeys needs the same approval as the JobsLake candidate journeys: a disposable account.
- **Not built:** authorized application APIs, confirmation-email evidence and the Chrome side panel. The reasons are in the audit.
