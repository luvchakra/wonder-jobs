# WonderJobs helper (Chrome extension)

The browser half of **Apply with Wonder** (JobsApply). It fills an employer's
application form with what the candidate approved in WonderJobs, stops for
questions only the candidate should answer, and never submits anything — the
candidate reviews the form and presses the employer's submit button themselves.
There is no code in the extension that clicks, submits or sends a key press;
`apps/web/src/server/jobsApply/extension.test.ts` scans every script for it.

## Apply with Wonder (session mode)

1. The candidate starts Apply with Wonder on a job. The web page asks the
   bridge to pair with the session id only; the bridge fetches a
   **session-scoped** token (`POST /api/jobs-apply/sessions/:id/token`, cookie
   auth) and hands it to the service worker. The token binds tenant + session +
   a nonce, lasts 30 minutes, and is revoked the moment the candidate presses
   Stop or Cancel (the nonce rotates).
2. On the employer's page the content script reads the form's **structure** —
   labels, types, options, whether a field has something in it. It never reads
   a password, one-time-code or payment field; it only notices that one exists
   (sign-in, verification, payment → pause/stop).
3. WonderJobs classifies and maps the fields (`domain/jobs-apply`), and returns
   values only for fields the helper may fill: safe fields matched with high
   confidence to the candidate's own profile, the selected résumé, and answers
   the candidate approved. Sensitive and legal questions are never filled.
4. The helper fills when the candidate clicks **Fill N fields** (or on
   detection, where their "Fill application forms" policy is Automatic and they
   chose "Work more independently"), highlights what needs them, and reports
   results. An unexpected domain pauses; Stop stops.
5. When the candidate presses the employer's submit button and a confirmation
   page appears, the helper reports it as evidence. Only the candidate's "Yes,
   application submitted" in WonderJobs marks it submitted.

Only the service worker holds tokens, and it only calls
`/api/jobs-apply/extension/{session,inspect,fill-plan,events,file}`.

## Without a session

The original "Fill with WonderJobs" button remains on supported boards.

## What it fills, and what it deliberately doesn't

| Field | Where it comes from |
| --- | --- |
| First / last / full name | Career Profile `name` |
| Email | Career Profile email, else the WonderJobs account's own email address |
| Phone, LinkedIn | Career Profile contact details, when present |
| Resume (file upload) | The prepared resume for *that posting*, generated as a real `.docx` |
| Cover letter (textarea or file) | The prepared cover letter for that posting |

Anything the Career Profile doesn't hold is **not** filled; the panel lists it
rather than guessing — same rule as the rest of the product (see `CLAUDE.md`,
"Real data only").

If the page isn't a posting WonderJobs has an application for, only the base
profile is filled and the panel says why.

## Supported sites

Runs automatically on **Greenhouse**, **Lever**, **Ashby** and **Workday**
(`*.myworkdayjobs.com`). On an employer's own careers site that's part of an
Apply with Wonder session, the popup offers **Allow on this site**, which
requests that one origin from the optional `https://*/*` permission — never
all sites at once.

## How it connects (no password, no key to paste)

1. A content script on WonderJobs' own pages calls `GET /api/extension/token`
   with the normal session cookie.
2. That returns a short-lived, read-only bearer token (30 minutes), which the
   service worker stores.
3. On an employer's site the content script asks the service worker for data;
   only the worker ever holds the token, and only it talks to WonderJobs.

The token grants read access to the two autofill endpoints and nothing else,
isn't stored server-side, and stops working when it ages out. Signing in to
WonderJobs again mints a new one automatically.

## Install (unpacked)

This isn't on the Chrome Web Store yet, so install it directly:

1. Download and unzip the extension (or clone this repo and use `extension/`).
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the `extension/` folder.
5. Open WonderJobs and sign in — the extension connects itself.

`http://localhost:3000/*` is in `host_permissions` so the extension works
against a local WonderJobs during development. Remove that line before any
Chrome Web Store submission.

## Files

| File | Role |
| --- | --- |
| `manifest.json` | MV3 manifest: permissions and which scripts run where |
| `background.js` | Service worker — holds the token, the only thing that calls WonderJobs |
| `content/wonderjobs-bridge.js` | Runs on WonderJobs; mints the token |
| `content/autofill.js` | Runs on employers' sites; finds fields, fills them, shows the panel |
| `popup/*` | Toolbar popup: connection status and a manual "fill this tab" |

## Repacking after a change

```bash
npm run pack:extension   # from the repo root
```

That rewrites `apps/web/public/wonderjobs-extension.zip`, which is what the
site's `/extension` page serves.
