# WonderJobs cloud browser

"Wonder fills, you press submit" — without the Chrome extension, so it works from a phone.

The worker opens the employer's application page in an isolated browser (Playwright Chromium), streams
it to the candidate inside WonderJobs, and runs the same helper script the extension runs
(`extension/content/autofill.js`): it reads the form's structure, asks the app what may be filled, fills
exactly that, and never submits. The candidate signs in, solves any verification and presses the
employer's own submit button in the stream. The browser context is discarded when the session ends —
no cookies or storage survive it.

## Trust boundaries

- Only the WonderJobs app can open, fill or end a session: `x-wonder-secret` (`CLOUD_BROWSER_SECRET`, shared).
- Only the candidate's browser, from an allowed origin and holding the stream token minted for that one
  session, can watch and drive it (`/stream?token=…`).
- The helper's calls to the app carry the session's own bearer token and may reach only the five
  `/api/jobs-apply/extension/*` routes — the same gate the extension has. The app applies the candidate's
  fill policy on every plan.
- Nothing in the worker clicks, presses or submits on its own (`src/worker.test.ts` scans for it): the only
  page actions are the candidate's own taps and typing, relayed from the stream.

## Run locally

```bash
CLOUD_BROWSER_SECRET=$(openssl rand -base64 48) \
WONDERJOBS_ORIGIN=http://localhost:3000 \
npm run dev -w @wonder/browser-worker
```

and give the app the same two values plus the worker's address:

```
CLOUD_BROWSER_URL=http://localhost:4100
CLOUD_BROWSER_SECRET=<same>
```

## Deploy (Fly.io)

```bash
fly launch --no-deploy --copy-config --config apps/browser-worker/fly.toml --dockerfile apps/browser-worker/Dockerfile
fly secrets set CLOUD_BROWSER_SECRET=<secret> WONDERJOBS_ORIGIN=https://<app domain>
fly deploy --config apps/browser-worker/fly.toml --dockerfile apps/browser-worker/Dockerfile
```

Then in Vercel set `CLOUD_BROWSER_URL=https://wonderjobs-browser-worker.fly.dev` and `CLOUD_BROWSER_SECRET=<secret>`.
Any host that runs a long-lived Node process with Chromium works the same way (Railway, Render, a VM) —
the Vercel functions can't, which is why this is a separate service.

Environment: `CLOUD_BROWSER_SECRET`, `WONDERJOBS_ORIGIN`, `PORT` (4100), `CLOUD_BROWSER_ALLOWED_ORIGINS`
(defaults to the app origin), `CLOUD_BROWSER_MAX_SESSIONS` (6), `CLOUD_BROWSER_IDLE_MS` (10 min),
`CLOUD_BROWSER_MAX_MS` (45 min), `PW_CHROMIUM_PATH` (optional).
