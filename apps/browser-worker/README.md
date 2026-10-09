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

One command, from anywhere in the repository, signed in to Fly (`fly auth login`):

```bash
scripts/deploy-browser-worker.sh
```

It creates the app (`wonderjobs-browser-worker`, Mumbai — next to the app's `bom1` functions) if it
doesn't exist, makes the shared secret the first time (set on Fly, and written to
`~/.wonderjobs-cloud-browser-secret` for you — never printed or committed), deploys **one** machine and
checks `/health`. Then in Vercel (Production) set `CLOUD_BROWSER_URL=https://wonderjobs-browser-worker.fly.dev`
and `CLOUD_BROWSER_SECRET=<that value>` (Sensitive), redeploy, and delete the file.

- Sessions live in the machine's memory, so it runs as exactly one machine (`--ha=false`); it stops when
  idle and starts on the next request.
- Later deploys: run the script again, or let the **Deploy cloud browser** workflow do it — it redeploys
  on every push to `main` that changes the worker or `extension/content/autofill.js` (the worker bakes the
  helper in) once the `FLY_API_TOKEN` repository secret is set (`fly tokens create deploy --app wonderjobs-browser-worker`).
- New secret: `ROTATE=1 scripts/deploy-browser-worker.sh`, then update it in Vercel. Another app name or
  org: `FLY_APP=… FLY_ORG=…`.
- By hand, from the repository root (the build context must be the root so the helper comes along):
  `fly deploy . --config apps/browser-worker/fly.toml --ha=false`.

Any host that runs a long-lived Node process with Chromium works the same way (Railway, Render, a VM) —
the Vercel functions can't, which is why this is a separate service.

Environment: `CLOUD_BROWSER_SECRET`, `WONDERJOBS_ORIGIN` (set in `fly.toml`), `PORT` (4100), `CLOUD_BROWSER_ALLOWED_ORIGINS`
(defaults to the app origin), `CLOUD_BROWSER_MAX_SESSIONS` (6), `CLOUD_BROWSER_IDLE_MS` (10 min),
`CLOUD_BROWSER_MAX_MS` (45 min), `PW_CHROMIUM_PATH` (optional).
