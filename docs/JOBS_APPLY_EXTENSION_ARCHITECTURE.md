# JobsApply — browser helper architecture (spec §45–§48, §89–§92)

The existing MV3 extension (`extension/`) was extended, not duplicated (§155).

```
WonderJobs page ──(session id only)──▶ bridge content script ──cookie──▶ POST /api/jobs-apply/sessions/:id/token
                                               │ token (tenant+session+nonce, 30 min)
                                               ▼
                                     service worker (only holder of tokens)
                                               ▲  jobsApplyFor / jobsApplyCall (allowlisted paths)
employer page ── content script: read structure → inspect → fill-plan → fill → events
```

## Tokens (§90)

- Tokens are **session-scoped**: an HMAC over tenant, session id, nonce and expiry.
- Stop and Cancel rotate the nonce, so an issued token is revoked immediately.
- Every helper request re-checks the stored session. A token is rejected when:
  - its nonce no longer matches;
  - the session has ended;
  - it has expired.
- The web page re-pairs every 20 minutes while it is open.
- A token never appears in a URL or in a page script.
- The service worker calls only `/api/jobs-apply/extension/{session,inspect,fill-plan,events,file}`.

## What the helper reads and sends (§48, §88)

The form's **structure**:
- labels, types, options, required flags, attribute hints and step;
- whether each field has a value.

It never reads:
- the content of a field;
- password, one-time-code or card fields. It only notes that a sign-in form, a verification challenge, a code or a payment form exists.

The server schema is `.strict()`, so a payload containing a value, cookie or password is rejected with 400.

## What it fills

Only what the server's fill gate returns (`domain/jobs-apply/policy.ts::fillGate`):
- SAFE fields with HIGH confidence, filled from the candidate's own snapshot;
- the selected résumé or cover letter;
- answers the candidate approved.

It never fills human-only fields, whatever is sent. Values are set through native setters and input/change events. Radios are checked by property, not by clicking.

When filling happens depends on the policy:
- **Ask** (default): after "Fill N fields".
- **Automatic**: on detection, but only when the policy says Automatic *and* the candidate chose "Work more independently".

## What it never does

It contains no `.click()`, `.submit()`, `requestSubmit`, synthetic keyboard, mouse or submit events. `apps/web/src/server/jobsApply/extension.test.ts` scans every shipped script for these.

The submit listeners are passive. They report `SUBMIT_CLICKED`, and then `SUBMISSION_DETECTED` when a confirmation page appears, as evidence. A sign-in form is never counted as a submit.

## Where it runs (§46–§47)

- **Statically:** Greenhouse, Lever, Ashby and `*.myworkdayjobs.com`.
- **On an employer's own site:** only after the candidate clicks "Allow on this site" in the popup, which requests that one origin from `optional_host_permissions`.
- **Tab-bound sessions:** a page the application redirects to on an unrelated host is recognised as the same session. The helper reports the move, the server pauses (`DOMAIN_CHANGED`), and nothing on that page is read until the candidate approves the host or stops.

## Panel (§94)

An in-page, shadow-DOM panel docked at the bottom right. It shows:
- progress;
- Fill N;
- the Needs-you list, which scrolls to each field;
- the résumé in use;
- pause messages (sign-in, verification, unexpected site, payment);
- Stop.

The Chrome Side Panel API is not used yet: it needs another permission and store review.

## Legacy mode

Without a session, the original "Fill with WonderJobs" button remains. It fills name, email, phone, LinkedIn, résumé and cover letter, and never overwrites anything the candidate typed.
