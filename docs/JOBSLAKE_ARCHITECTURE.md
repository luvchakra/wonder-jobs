# JobsLake — architecture and operations

JobsLake is WonderJobs' platform job-acquisition layer: the source registry, connectors, the
canonical opportunity model, dedupe and provenance, source health and runs, credentials, the admin
portal, and the Protocol v1 APIs (REST, stream, MCP). WonderJobs owns the candidate — Career
Profile, matching, ranking, applications — and receives only `CanonicalOpportunity`s.

It lives in this repo (not a separate service) so it shares auth, the secret store and the deploy,
but its code is layered so it could be split out behind the same protocol:

| Layer | Path | What it owns |
|---|---|---|
| Protocol + pure logic | `apps/web/src/domain/jobslake/` | `protocol.ts` (v1 types, validator, error codes), `canonical.ts` (normalization, dedupe, provenance), `planner.ts` (search modes, waves, depth), `health.ts` (health + alerts from runs), `detect.ts` (URL → ATS / partnership / custom), `mapping.ts` (response mapping), `ssrf.ts`, `wonderjobs.ts` (WonderJobs mapping + evidence) |
| Server | `apps/web/src/server/jobslake/` | `registry.ts` (sources, connectors), `ats.ts`, `custom.ts` (JSON API / feed / structured page / MCP), `safeFetch.ts`, `store.ts` (Supabase or memory), `credentials.ts`, `core.ts` (the one search/test/refresh implementation), `service.ts` (adapter-neutral operations), `admin.ts`, `views.ts`, `mcp.ts`, `access.ts`, `flags.ts` |
| REST v1 | `apps/web/src/app/api/jobs-lake/v1/` | `search`, `search/stream`, `opportunities/:id` (+`refresh`), `sources` (+`:id`, `:id/test`), `health`, `coverage`, `protocol`, `telemetry` |
| MCP | `apps/web/src/app/api/jobs-lake/mcp/` | `search_jobs`, `get_job`, `refresh_job`, `search_sources`, `get_source_health`, `get_coverage` — each calls the same `service.ts` function as its REST endpoint |
| Admin API + portal | `apps/web/src/app/api/jobs-lake/admin/`, `apps/web/src/app/platform/jobs-lake/` | Overview, Sources, source detail, Add Source wizard, Playground, Jobs, Data Quality, Coverage, Health, Runs, Alerts, Protocols, Credentials, Settings |
| WonderJobs client | `apps/web/src/services/jobs/jobsLakeClient.ts`, `jobsLakeMode.ts` | `searchJobs`, `searchJobsStream`, `getJob`, `refreshJob`, `reportContribution` |

## Sources

- **Built in** (defined in code, `registry.ts`): Greenhouse, Lever, Ashby (the career boards WonderJobs
  already searched, split out of the combined "careers" source), Remotive, Jobicy, Remote OK,
  Himalayas, Arbeitnow, Adzuna India (credentials from `ADZUNA_APP_ID`/`ADZUNA_APP_KEY`). They wrap
  the existing fetchers in `server/jobs/providers.ts`, so job ids (`careers_…`, `remotive_…`) never
  change.
- **Partnership catalogue**: LinkedIn, Indeed, Naukri, foundit, TimesJobs — listed as **Do not use**,
  with the reason. They can't be activated; there is no scraping.
- **Admin-added**: an ATS board (Greenhouse, Lever, Ashby, SmartRecruiters, Workable), a JSON API with a
  response mapping, an RSS/Atom feed, a page with schema.org `JobPosting` data, or an MCP tool.
  Scrapers can be *recorded* with their governance answers but are always Do not use — no scraper
  engine runs.
- Candidates keep choosing sources by their WonderJobs ids: "careers" maps to every ATS source
  (built in and admin-added boards); admin-added non-ATS sources are platform-managed and included
  whenever they're active.

**Lifecycle:** Draft → (test) Testing → Active. Activation requires a passing test from the last 24
hours; a test is a real fetch through the connector, validated against Protocol v1 (at least 90% of
records and apply URLs valid — invalid records are named and never served). Changing a source's
connection puts it back to Draft. Paused / Disabled are set by an admin; resuming needs a new
passing test.

## Search

`core.search(request)` plans sources by mode (Fast: top sources, shallow; Balanced: waves 1–2;
Maximum coverage: every eligible source, deep), runs each wave with bounded parallelism and a per-source
timeout, records one run per source, canonicalizes (union of URL / identity / content-fingerprint keys;
postings from the same source are never merged; the most authoritative source — employer ATS first —
supplies the canonical fields, and every field records which source it came from), validates, stores the
results in the warm pool, and merges recent warm results that the live search didn't return. A failing
source is reported and recorded; it never fails the search.

Candidates see category-level source messages only ("Temporarily unavailable"); admins and the service
token see the upstream message.

## WonderJobs integration

- **Browser search stage** (`services/workflow/executors.ts`): signed-in runs call
  `POST /api/jobs-lake/v1/search/stream` once with the candidate's search terms, locations and
  enabled sources — nothing else. Each source's evidence appears as it answers; "Searched with:
  JobsLake · N sources planned" and "Sources searched: X of N answered" say how broad the search was.
  The dedupe stage uses JobsLake's merge ("Cross-posted duplicates merged"). After matching, per-source
  relevant/strong counts go to `/v1/telemetry` (counts only).
- **Fallback:** if JobsLake is switched off the stage searches each source directly and says "JobsLake:
  Off — searched each source directly"; if it fails, the same path runs with a warning.
- **Scheduled runs** (`server/workflow/serverExecutors.ts`) call `core.search` in-process, same fallback.
- **Job detail → Sources & signals → "Where this job was found"**: every sighting, which one is shown,
  access type, employer site, which source supplied title / apply link / date / salary, and a
  "Check <source> now" refresh. Unknown JobsLake source ids render by name.
- Demo and local mode keep the generated sample data (unchanged).

## Access and security

- **Admin**: signed-in accounts whose email is in `JOBSLAKE_ADMIN_EMAILS`. Unset = nobody (fails closed).
  Everyone else gets a 404 from the portal and 401/403 from the admin API. `JOBSLAKE_LOCAL_ADMIN=1`
  works only when Supabase Auth isn't configured (local development) and is ignored otherwise.
- **Service / MCP**: `Authorization: Bearer $JOBSLAKE_MCP_TOKEN` (≥ 24 characters, constant-time compare).
- **Candidates**: any WonderJobs session may call search, stream, opportunities and telemetry;
  per-tenant rate limits.
- **SSRF**: every URL an admin enters is checked before it's stored (https only, port 443, no IP
  literals, no private/metadata hosts); `safeFetch` checks again at request time, including every DNS
  answer and every redirect, with time and size limits.
- **Credentials**: AES-256-GCM (same key as BYOK), masked on read (`••••••••1234`), never returned by
  any API, never logged, never in an error message. Environment-managed credentials (Adzuna) are
  reported, not stored.
- **Audit**: source created / updated / paused / disabled / activated / deleted / tested / previewed,
  credential created / replaced / deleted, playground searches — with the admin's email.
- **External content is data**: postings, API responses and MCP results are parsed into fields; nothing
  in them reaches a prompt or triggers an action.

## Feature flags (environment; all reversible without code)

| Variable | Default | Off means |
|---|---|---|
| `JOBSLAKE_ENABLED` | on | Everything below is off; WonderJobs searches each source directly |
| `JOBSLAKE_SEARCH_ENABLED` | on | WonderJobs searches each source directly; v1 search answers `FEATURE_DISABLED` |
| `JOBSLAKE_STREAMING_ENABLED` | on | The client uses the plain search endpoint |
| `JOBSLAKE_WARM_POOL_ENABLED` | on | Nothing is stored; every search is live only |
| `JOBSLAKE_MCP_ENABLED` | **off** | The MCP endpoint answers 404 |
| `JOBSLAKE_ADMIN_ENABLED` | on | Portal and admin API answer 404 |

## Storage

Migration `0007_jobslake.sql` creates `wonderjobs.jobslake_sources`, `_credentials`, `_runs`,
`_audit`, `_opportunities` (RLS enabled, revoked from `anon`/`authenticated`, reached only by the
service role). These are platform tables — no tenant column, no candidate data. Until 0007 is applied,
JobsLake runs on an in-memory store and says so on the Overview and Settings pages ("history … resets
when the server restarts").

## Operating it

1. Apply migration `0007_jobslake.sql` (Supabase SQL editor or `npm run db:migrate`).
2. Set `JOBSLAKE_ADMIN_EMAILS` to the platform admins' emails and redeploy.
3. Optionally set `JOBSLAKE_MCP_ENABLED=1` and a random `JOBSLAKE_MCP_TOKEN` for MCP/service callers.
4. Open `/platform/jobs-lake`.

## Deviations from the design spec

- In-repo module rather than a separate service; the protocol boundary is kept so it can be split.
- No scraper engine, and no partnership connectors — both are listed and blocked, never faked.
- Health, coverage and quality cover what JobsLake has actually recorded (7-day default, 24 h / 30 days
  selectable); no projections or backfilled history.
- Role family, seniority and industry are derived from posting text and labelled "derived".
- Admin settings are read-only (environment variables), so every change is a deploy-time decision.
