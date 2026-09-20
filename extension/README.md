# WonderJobs Autofill (Chrome extension)

Fills an employer's application form with the materials the candidate already
prepared in WonderJobs. It never submits anything — the candidate reviews the
form and clicks Apply themselves.

## What it fills, and what it deliberately doesn't

| Field | Where it comes from |
| --- | --- |
| First / last / full name | Career DNA `name` |
| Email | The WonderJobs account's own email address |
| Resume (file upload) | The prepared resume for *that posting*, generated as a real `.docx` |
| Cover letter (textarea or file) | The prepared cover letter for that posting |

Phone number, LinkedIn URL and location are **not** filled: Career DNA has no
field for them, so there is nothing real to fill them with. The extension says
so in its panel rather than guessing — same rule as the rest of the product
(see `CLAUDE.md`, "Real data only").

If the page isn't a posting WonderJobs has an application for, only the base
profile is filled and the panel says why.

## Supported sites

Known field names for **Greenhouse**, **Lever** and **Ashby**, then a generic
pass that reads each field's visible label, so an unfamiliar form still gets
the obvious fields. Applying the generic pass to arbitrary sites requires the
optional `https://*/*` permission, which Chrome asks for separately.

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
