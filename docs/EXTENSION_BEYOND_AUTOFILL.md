# Browser helper beyond autofill — design

Status: **agreed** (2026-10-11). Phase 1 (match, save, status) built in extension 0.3.0, WJ-304; phases 2–4 to come. Owner question: "Is there more beyond autofill? … CV tailoring, job matching,
recruiter outreach, follow-ups, application tracking — let's design this for the extension."

## Goal

Wherever the candidate is looking at a job — a company careers page, Greenhouse/Lever/Ashby/Workday, LinkedIn, Naukri — the
helper answers four questions in one place, without opening WonderJobs:

1. **Is this job for me?** (match)
2. **Keep it.** (save → tracked in Pipeline)
3. **Make my application fit it.** (tailored résumé / cover letter, then the existing autofill)
4. **What do I do next?** (recruiter note, follow-up when it's due)

Everything is computed by the app from real data (the posting on screen + the candidate's Career DNA). The helper is a
window onto the app, not a second brain: no logic, keys or AI calls live in the extension.

## What exists today (and what's reused)

| Need | Already in the app | Gap |
|---|---|---|
| Match | `services/jobs/matching.ts::computeMatch`, `domain/jobs/decision.ts` (reasons), Career DNA in `wj.career` (server-readable) | No route the helper can call |
| Track | `wj.applications` (Saved → Applied → …), JobsApply sessions report `APPLICATION_SUBMITTED` / `SUBMISSION_DETECTED` | No "save a job from a page"; ATS URL parsing exists (`services/jobs/atsUrl.ts`) |
| Tailor | `AIService.generateResume / generateCoverLetter` (`services/ai/service.ts`) | Runs only in the browser app; needs a server route |
| Follow-ups | `Application.followUps`, `generateFollowUpEmail`, cron `server/workflow/reminders.ts` | No route; no badge in the helper |
| Outreach | Capability `send_recruiter_message` (draft-only) | No draft UI or AI method |
| Apply | JobsApply + `content/autofill.js` (gated fill, Next, opt-in Submit) | — unchanged |

## Surface: a side panel, one action at a time

- **Chrome Side Panel** opened from the toolbar icon replaces the popup as the helper's home. It stays open while the
  candidate scrolls the posting or moves between tabs. (New permission `sidePanel`; the popup remains as fallback.)
- **Nothing is injected into pages** except the existing autofill panel on application forms. No floating buttons on
  LinkedIn or job boards.
- The toolbar badge shows the match score on a recognised job page, and the number of follow-ups due elsewhere.
- **Minimal UI:** each panel state has one primary button; the rest folds under "More".

| Page / state | Shows | Primary action |
|---|---|---|
| Not a job page | Follow-ups due today (if any) | Open WonderJobs |
| Job page, new to you | Match score + 3 reasons / 1 gap, "Read from this page" | **Save** |
| Saved, no tailored résumé | Status, match | **Tailor my résumé** |
| Saved, ready | Résumé chosen | **Apply with Wonder** (existing flow) |
| Applied, follow-up due | Days since applied | **Draft a follow-up** |
| LinkedIn profile / hiring team | Person's name and role on screen | **Draft a note** |

## How each piece works

### 1. Read the job on screen

- When the panel opens, the helper reads the current tab once, using `activeTab`, the permission the candidate's own click
  grants. There is no broad host access and no background scraping.
- Extraction order, read-only:
  1. schema.org `JobPosting` JSON-LD, which most careers sites and ATSs publish;
  2. a known ATS URL, for which the server fetches the posting itself from the public ATS API (`parseAtsUrl`), so the text
     is the employer's, not the DOM's;
  3. per-site readers for LinkedIn and Naukri (title, company, location, description from the visible job card);
  4. the page's main visible text.
- The extracted text is **untrusted data** (CLAUDE.md, external content): the server parses fields out of it. It is never
  used as instructions, never runs as a prompt's system text, and never triggers an action.
- Provenance is shown in one line: "Read from linkedin.com · just now" or "From Greenhouse's posting".

### 2. Match

- `POST /api/extension/job/read` with `{ url, extracted }`. The server normalises the posting and finds the same job if
  it's already known (ATS id or canonical URL). It then runs `computeMatch` against the candidate's Career DNA and returns:
  - the score;
  - the fit label;
  - the top reasons and the biggest gap, from `decision.ts`;
  - the job's status if it's already in Pipeline.
- Capability `analyze_jobs` (low risk, automatic).
- If the Career DNA is too thin to match, the panel says so and links to the profile. It never shows a made-up score.

### 3. Save → track

- **Save** calls `POST /api/extension/job/save`. It adds the job to the candidate's catalogue with source
  "Saved from <site>", and creates the application in `wj.applications` with status Saved.
- Idempotency key `save:{canonicalUrl}`, so saving twice is a no-op. Writes go through `writeClientState` for the token's
  tenant only.
- The candidate's own click is the action; `save_jobs` only governs *automatic* saving, which this isn't.
- Status follows the application from then on:
  - autofill's existing `SUBMISSION_DETECTED` / `APPLICATION_SUBMITTED` events move it to Applied;
  - revisiting the page shows the current status (Saved / Applied · 5 days ago / Interview).

### 4. Tailor the résumé (and cover letter)

- `POST /api/extension/draft` with `{ kind: "resume" | "cover", jobRef }`.
- This needs one new server piece: run `AIService.generateResume / generateCoverLetter` server-side through the same
  provider boundary (WonderJobs template AI, or the candidate's encrypted BYOK key, decrypted only on the server).
- The draft goes through `resolveCapability("generate_resume" | "generate_cover_letter")`:
  - The default policy is "ask", and the button press is the asking.
  - If a policy forbids it, the button says why instead of running.
  - A failed lookup fails closed.
- The output is a **draft labelled AI-generated**. The panel shows what changed (for example "+ IAM governance, SailPoint
  moved up") and offers *Review in WonderJobs*, which opens the Application Pack, and *Use for this application*.
- Nothing leaves the candidate's account.

### 5. Apply

Unchanged: Apply with Wonder (JobsApply session, gated fill, Next, opt-in Submit). The tailored résumé is preselected.

### 6. Recruiter outreach — draft only

- On a LinkedIn profile, or the "hiring team" card on a LinkedIn job, **Draft a note** calls
  `POST /api/extension/draft { kind: "outreach", jobRef, person: { name, role } }`.
- The note fits LinkedIn's 300-character connection-note limit, or is a short email.
- Capability `send_recruiter_message`: high risk, **draft-only**. Wonder never contacts anyone.
- The panel offers **Copy**. The candidate pastes and sends it themselves. The helper never presses LinkedIn's buttons;
  the two-button rule in `extension.test.ts` stays exactly as it is.
- "I sent it" logs a `recruiter_message` event on the application, keyed per job and person.
- Only the person on screen is read, and only when the candidate asks. No profile crawling.

### 7. Follow-ups

- A daily `chrome.alarms` tick (new permission `alarms`) calls `GET /api/extension/followups`. It reads the same due
  follow-ups the cron's `raiseDueReminders` uses, and sets the badge count.
- **Draft a follow-up** uses `POST /api/extension/draft { kind: "followup", jobRef }` under capability `send_email`
  (draft-only). It offers:
  - **Copy**;
  - **Open in Gmail**, a compose link with the subject and body filled in. The candidate presses Send.
- **Mark sent** calls `POST /api/extension/followups/:id/done`, which completes the follow-up and logs it. The idempotency
  key is the follow-up id.

## API (all new routes)

- **Auth:** the existing 30-minute general token (`server/extensionToken.ts`, Bearer). Its "read-only" wording is
  corrected in docs.
- **Validation and limits:** every route checks its input with a zod schema. Requests are capped at 200 KB (extracted text
  is trimmed to 50 KB) and rate-limited per tenant.
- **Tenant isolation:** every read and write is filtered by the token's tenant, with a unit test for each route.

| Route | Does | Capability |
|---|---|---|
| `POST /api/extension/job/read` | normalise, dedupe, match, status | `analyze_jobs` |
| `POST /api/extension/job/save` | catalogue + application (Saved) | user action |
| `POST /api/extension/draft` | résumé / cover / outreach / follow-up draft | `generate_resume`, `generate_cover_letter`, `send_recruiter_message`, `send_email` (draft-only) |
| `GET /api/extension/followups` | due follow-ups | — |
| `POST /api/extension/followups/:id/done` | mark sent | user action |

## Permissions and the store

- Add `sidePanel` and `alarms`. No new host permissions: reading uses `activeTab` and the click that grants it.
- Updating with new permissions triggers a Chrome Web Store review. Ship them in one update, and update
  `docs/CHROME_WEB_STORE.md` with the justifications:
  - "reads the job you're viewing when you open the panel";
  - "daily reminder count".
- Privacy notice: page text is sent to WonderJobs only when the candidate opens the panel on that page. It is stored only
  if they press Save.

## Phases (each one PR, each shippable)

1. **Match + Save + status.** Side panel, the reader, `job/read`, `job/save`. Biggest value, low risk.
2. **Tailor.** Server-side AI draft route plus résumé and cover letter in the panel.
3. **Follow-ups.** Alarms, badge, draft, mark sent.
4. **Outreach.** LinkedIn person reader and note draft.

## Owner decisions (2026-10-11)

1. **Surface:** the side panel is the helper's home, and the popup stays as a fallback.
2. **LinkedIn and Naukri:** the helper reads the job or person you have open, only when you open the panel. No crawling,
   and it never presses their buttons.
3. **Tailored résumé:** it's used for that job's Apply with Wonder straight away, and you can review it in the app at any
   time.
4. **Order:** phase 1 (match, save, status) first, then tailoring, follow-ups and outreach.
