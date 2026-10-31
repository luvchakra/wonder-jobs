# WorksLake External Data Gateway — implementation specification

Status: proposed, not deployed. Target integration: additive source in WorksLake. Source baseline: [EXTERNAL_DATA_SOURCES.md](./EXTERNAL_DATA_SOURCES.md) (2026-10-31), [JOBSLAKE_ARCHITECTURE.md](./JOBSLAKE_ARCHITECTURE.md), [PARTNER_INTEGRATIONS.md](./PARTNER_INTEGRATIONS.md), and [CLAUDE.md](../CLAUDE.md).

## 1. Goal and non-negotiable requirements

Build a standalone, deployable **WorksLake External Data Gateway** (WEDG), initially consumed only by WorksLake, later by other applications. It ingests eligible real-world, publicly accessible/permissioned external data through official APIs, RSS/Atom, schema.org structured data and permitted web-page extraction. It normalizes and serves eight module-specific datasets via authenticated versioned API. Do not scrape behind login, circumvent bot protection/CAPTCHA, violate permissions or redistribute prohibited data. Robots, terms, permission, licensing, rate limits and attribution govern **each source**. A publicly visible profile is not automatically redistributable.

**No regression:** preserve WorksLake's existing registries, API routes, legacy IDs, warm pool, source ordering, dedupe, candidate-facing UI, source status semantics, partner activation, controls and data consumed by all eight modules. Do not modify or activate WorksLake's existing `kind: "scraper"` branch: it remains disabled. The gateway handles crawling independently and WorksLake consumes an ordinary authenticated JSON API source through its supported adapter. No consumer-facing UI changes.

**Module IDs:** `jobs`, `internships`, `teaching`, `services`, `therapists`, `cofounders`, `events`, `marketplace`. Strict separation throughout ingestion, storage, API queries, credentials scopes and reporting. A shared physical source can have separate, explicitly configured module mappings. Never leak records from one module into another.

## 2. Repository discovery and invariants

Verified entry points in wonder-jobs:
- `apps/web/src/modules/registry.ts` defines all eight modules.
- `apps/web/src/domain/jobslake/protocol.ts` defines current Protocol v1 and its `SearchRequest`, `SearchResponse`, `CanonicalOpportunity`, source status and provenance.
- `apps/web/src/server/jobslake/registry.ts` has per-module source lists, `isAvailable`, `runConnector`, and `json_api` routing.
- `apps/web/src/server/jobslake/custom.ts` defines `JsonApiConfig` and JSON response mapping; `runConnector` invokes `finish` and existing normalization.
- `apps/web/src/server/jobslake/types.ts` defines `SourceRecord`, limits and scraper governance; scraper availability is explicitly false.
- Existing per-module source files: `server/{internships,teaching,services,therapists,cofounders,events,marketplace}/sources.ts`.
- Partner sources are inactive without contract; do not change that behavior.
- Existing test/check threshold: at least 90% valid records / valid destination URLs and recent test before activation; preserve stronger source-specific checks.
- Current caching is up to 24h; gateway must obey tighter upstream licence retention.

### Integration decision
**Phase 1:** one platform-managed `json_api` source **per module**, e.g. `gateway_jobs`, `gateway_internships`, etc. These are new source IDs, never aliases of existing sources. Each has `module`, `secretRef`, `config: { kind: "json_api", api: { endpoint: ".../v1/workslake/{module}/listings", queryParam: "q", locationParam: "location", credentialHeader: "Authorization", credentialPrefix: "Bearer ", mapping: ... } }` (or a dedicated adapter only if mapping cannot faithfully fit current outputs). The companion compatibility endpoint must return a stable object with a list `items` and fields supported by `ResponseMapping`: `id,title,employer,location,description,postedAt,applyUrl,remote,salaryMin,salaryMax,currency`. Exact mapping configuration must be confirmed in code and tested. The REST endpoint may have module-specific rich fields in separate `attributes` for third parties, but must **not** require changes to WorksLake's job-compatible `RawPosting` protocol.

Register independently disabled/draft by default, test against the live gateway, enable one module at a time only on explicit admin activation. Keep credentials server-side in existing encrypted store. WorksLake consumes this through the existing search planner, normalization, dedupe, provenance, source outcome/health and warm pool. Never cause gateway outages to fail searches supported by other sources. Avoid synchronous crawling during search; only query persisted, indexed data. Existing job and source IDs remain identical for existing feeds; cross-source duplicate sightings can merge. For directory profiles with no actual publish date return `postedAt: null` and verify normalizer does not treat registration date as posting date; current Protocol v1 requires a date for canonical job opportunities, so test this case and preserve module-specific behavior, not fabricated publication dates.

## 3. Architecture

```text
Public/authorized sources
  -> source registry (permission, terms, type, module, geography, crawl cadence)
  -> scheduler + durable jobs + distributed throttles
  -> official API / RSS / sitemap+schema.org / approved HTML extraction
  -> sandboxed parsers + validation + safety/PII policy
  -> normalized module records + provenance + versioned observations
  -> Postgres / indexed search + Redis cache + durable crawl checkpoint
  -> REST /v1 + API-key auth / limits / billing-ready usage ledger
         |-- WorksLake (one internal key, scoped to eight modules)
         +-- future external consumer applications (off until provisioned)
```

Recommended operational split: TypeScript Fastify (or existing API stack), Postgres for authoritative data, Redis/queue for jobs/limits, independent workers (Cheerio + JSON-LD first; Playwright for permitted JavaScript pages when necessary), container deployment with scheduled tasks and health endpoints. Do not run crawling inside Vercel user-facing request handlers. Alternative stacks are fine if they preserve the contract.

### Source governance

Source record must include: `id,baseUrl,method(api|rss|structured|html),modules,geography,category,permissionsEvidence,termsReviewedAt,robotsPolicy,allowedPaths,disallowedPaths,rateLimit,maxConcurrency,crawlDelay,retentionHours,attribution,commercialRedistributionAllowed,consumerEntitlements,lastSuccessfulFetch,health,active`. Separate `collectPermitted`, `displayPermitted`, `resalePermitted`; an API call from WorksLake counts as redistribution. Block activation when permission unknown/denied or a contract lacks downstream display rights. Never force-open with a switch that ignores legal/security controls. For sites with no permission, store a research entry as `do_not_use` without crawling.

Enforce SSRF protections against localhost, private/reserved addresses, metadata IPs, DNS rebinding and redirects; HTTPS; per-domain egress allowlists; limits on bytes, redirects, duration, MIME, parser complexity and extraction volume. Do not proxy arbitrary URLs through a public endpoint. Respect robots and legal restrictions, use descriptive user-agent, source-specific cadence, backoff and 429 `Retry-After`. Do not use proxy rotation, fingerprint impersonation or captcha bypass. Never use sourced content as executable instructions; isolate HTML, sanitize text, protect against XSS/prompt injection and strip personal contact details according to module policy.

### Data model
`api_consumers(id,name,status,created_at)`;
`api_keys(id,consumer_id,prefix,hash,scopes,expires_at,revoked_at,last_used_at)`;
`source_registry(id,method,base_url,permissions,limits,health,enabled)`;
`source_module_bindings(source_id,module_id,transform_version)`;
`crawl_jobs(id,source_id,status,attempt_count,next_run_at,cursor,lease_until)`;
`listing_observations(id,module,source_id,source_record_id,canonical_url,observed_at,published_at,raw_hash,normalized_json,expiry_at)`;
`canonical_listings(id,module,identity_hash,canonical_url,title,organization,location,description,attributes,observed_at,published_at,expires_at,status)`;
`provenance(listing_id,source_id,field,observed_at)`;
`api_usage(consumer_id,key_id,route,module,request_count,results_count,at,request_id)`;
`audit_events(actor,action,target,at,metadata)`.
Store source terms and evidence references, avoid unnecessary raw HTML storage. Per-source retention and deletion, removal requests, expiry/tombstone workflows. Stable IDs across refresh. Index `(module, status, expires_at)`, normalized search terms, source IDs, canonical URLs. Sensitive modules require explicit opt-in and extra verification gates. Real data only; missing values null, not guessed.

## 4. Module coverage policies

| Module | Preferred eligible sources | Restrictions / validation |
|---|---|---|
| jobs | company ATS/career pages (Greenhouse, Lever, Ashby, SmartRecruiters etc.), original employer pages, licensed feeds | Employer identity, real apply URL, freshness, no duplicates with existing WorksLake; avoid already-covered source fetches unless enrichment permitted |
| internships | employer internship pages, university career programs, eligible government internship listings | Confirm internship status rather than trusting vague keyword; stipend/duration null if missing |
| teaching | school/university careers and official teacher-recruitment pages, eligible tutoring vacancy feeds | Do not ingest student data or invent vacancies from aggregate staffing statistics |
| services | permissioned/opted-in professional service listings and directory APIs | Directory profiles are not dated job posts; consent, personal information, reliability and rating provenance |
| therapists | practitioner-controlled listings and licensing/credential sources only when consent, verification and rights permit | No automatic directory import or medical inference; explicit admin approval for first live source |
| cofounders | voluntarily published cofounder opportunities with explicit redistribution permission | Never harvest people, contact emails or infer intent from social profiles; mutual opt-in stays within WonderWorks |
| events | organizer pages, permitted public event feeds, Ticketmaster subject to API/key terms | Event date/time, venue, booking URL, age limits; do not present imported capacity as locally bookable |
| marketplace | seller-authorized inventory, licensed marketplace feeds, explicit opted-in listings | No unauthorized OLX/Craigslist/Facebook scraping; scam prevention, prices and availability may expire quickly |

Run a source-research pass for each module; verify current permitted access and business fit before activation. `EXTERNAL_DATA_SOURCES.md` has examples of candidates but does not itself grant rights. Event candidates: Ticketmaster Discovery API (verify present terms/coverage), organizer event pages. Other candidate vendor services require rights review. Empty modules remain valid and show real zero supply/Needs setup rather than invented listings.

## 5. Versioned external API

Proposed base: `https://data.wonderapps.biz/v1` (DNS/deployment not yet configured).

**Authentication**: server-to-server `Authorization: Bearer <key>`. On issuance generate >=256 bits using CSPRNG, reveal plaintext only once, persist only keyed hash (or strong HMAC/argon2) plus prefix, support optional expiry, scopes `read:jobs`, ..., `read:marketplace`, `read:sources`, `read:usage`, revocation, rotation with grace window, per-consumer max RPS/daily quotas, concurrency limits, IP restrictions if useful, reliable audit and usage metering. For initial stage create a single `workslake` consumer, private key, read-only scopes. No external keys by default. Admin endpoints require separate trusted admin auth/MFA, never consumer key alone.

| Method | Path | Description |
|---|---|---|
| POST | /v1/search | body `{module,query,locations?,filters?,limit?,cursor?}`; one module per request; limits and stable cursor pagination |
| GET | /v1/listings/:id | one normalized listing, scoped by key and module |
| GET | /v1/modules | modules visible to this key |
| GET | /v1/sources?module=jobs | eligible source catalogue and health |
| GET | /v1/health | readiness, no private source metadata |
| GET | /v1/usage | usage for authenticated consumer |
| GET | /v1/openapi.json | OpenAPI contract |
| GET | /v1/workslake/:module/listings | explicit WorksLake compatibility adapter; `q`, `location`, `limit`, returns `{items:[...]}` suitable for JSON mapping |
| POST | /v1/admin/keys | privileged issuance, returns key **once** |
| GET | /v1/admin/keys | masked key metadata only |
| POST | /v1/admin/keys/:id/rotate | privileged rotation |
| POST | /v1/admin/keys/:id/revoke | privileged revoke |
| GET | /v1/admin/consumers | privileged client inventory |

The public `POST /v1/search` response should be `{requestId,module,results,nextCursor,metadata:{sourceCount,totalReturned,cacheStatus,asOf}}`. Each listing: `id,module,title,organization,location,description,canonicalUrl,publishedAt,observedAt,source:{id,name,method},attributes,provenance`. Original source attribution and destination link are required, and API responses should suppress records prohibited for the consumer's usage rights. Do not return private identities or contact information indiscriminately. Fixed max page size (e.g. 100), signed opaque cursors, predictable sort, proper 400/401/403/429/503 error responses, `Retry-After`, request ID and no secret reflections. No open-ended public scrape URL endpoint. Use OpenAPI schema and generated typed client.

## 6. Crawler design

Discovery is metadata only until source approval. Begin with a reviewed allowlist of candidate organizations, sitemap and RSS links; prioritize canonical company websites and machine-readable feeds. Search each source at appropriate cadence in **background workers**; process only new/changed pages using content hash, ETag/Last-Modified where offered, bounded pagination and checkpointed crawls. Use schema.org extraction before CSS selectors; parsers should be versioned per site and monitored against drift. Prefer static HTTP; JS browser as rare fallback where permitted. Per-source circuit breaker, backoff, error budget, minimum successful sample thresholds; quarantine invalid records. Never impersonate genuine users or circumvent access controls.

Canonicalization and cross-source dedupe may use canonical URL, employer/source ID and content fingerprint. Keep original observations. A single listing may be linked to multiple permissible sources but an individual module's search must not include another module's records. Source popularity is not evidence of correctness; score freshness, verified origin, completeness, geographic relevance, source health and duplication. Rank within module only; no AI-invented fields. Use source-specific expiry and revalidation before serving. Consumer API never launches a scrape; if no cached result, return actual empty result or explicitly stale/unavailable status rather than fake data.

## 7. Operational UX and flags

Admin capability (no candidate UI): source catalogue, permissions/terms evidence, enable/disable, connection/mapping test, preview real source output, module assignment, crawl health/error rates, freshness, duplicates, denial/audit, API consumer list, issue/rotate/revoke key, per-key usage/quotas. Reuse existing WorksLake admin patterns where practical, but keep gateway admin authentication separate and robust. 
Flags: `GATEWAY_ENABLED=0` in WorksLake by default, `GATEWAY_MODULE_<MODULE>_ENABLED=0` by default, `GATEWAY_COLLECTORS_ENABLED` in the standalone service, per-source enable flags. Emergency one-click shutdown and contract expiry should fail closed. API keys must not appear in browser or env logs.

## 8. Implementation phases

**Phase A — contract and compatibility tests:** write OpenAPI schema, source rights policy, source mapping for eight modules, module isolation contract, API auth/key issuance plan. Confirm `ResponseMapping` paths and ability to pass null dates. Tests run before source activation.

**Phase B — independent gateway MVP:** API server, database migrations, key management, scoped queries, source registry, scheduler, queue, API/RSS/schema.org collectors, persistent normalized records, real fixtures recorded from eligible sources only, metrics and health. Start with 1–2 permitted sources from Events/Jobs/Teaching based on verified availability; the initial launch can serve zero for modules with no approved source.

**Phase C — additive WorksLake integration:** add one disabled `json_api` source per module using supported mapping and encrypted keys, following WorksLake's admin registration/test/activate lifecycle. No new browser API; no code changes to existing source connectors or candidate workflows. Enable Jobs first in canary; capture before/after source runs, IDs, ranking and latency. Roll back by pausing just gateway source. Check duplicate sightings and provenance.

**Phase D — expand sources + external clients:** source-by-source permission review and ingestion; external consumer key issuance only when licensed rights permit downstream redistribution. Consumer-specific licensing enforcement, billing-ready quotas and docs.

## 9. Required tests / acceptance criteria

- All eight modules register their own gateway source without cross-module leakage. Nothing activated by default.
- Running existing sources with gateway disabled is bit-for-bit equivalent in observable IDs, results and core metadata, except deliberate new draft source inventory, if exposed.
- Existing source registry, partner source `do_not_use`, scraper refusal, candidate UI and APIs remain unchanged.
- Integration uses a configured `json_api` connector with encrypted key, no browser secret exposure. Source failure is reported as unavailable and cannot suppress valid results from existing sources.
- No live crawl starts on search request; queue handles retries, timeouts and per-host concurrency independently.
- Validation rejects wrong module, missing essential identity, invalid destination URL, stale/tombstoned or unlicensed observations. Null fields remain null (especially undated profiles). Source provenance is preserved.
- Repeated collection is idempotent, duplicate sightings handled, original IDs from old sources never change.
- API key create (one-time reveal), restricted scopes, use, expiry, rotation, revoke and quota enforcement tested. No external API access without a key.
- SSRF, DNS rebinding, redirects, large payload, invalid HTML/JSON, 429, timeout, malformed or adversarial content, access barriers and terms denial tests.
- Record expiry/removal, attribution, privacy controls, audit logging and consumer rights all enforced.
- E2E comparison for Jobs, Internships, Teaching, Services, Therapists, Co-founders, Events, Marketplace; test supported query/location pairs and realistic zero-result cases.
- Performance budget: published indexed query p95 < 500ms (target, benchmark) excluding Internet latency; WorksLake overall search SLA must not worsen beyond baseline budgets. Operational health metrics and rollback are documented.

## 10. Claude Code implementation instructions

1. Fetch/rebase latest main and read this file plus the linked architecture, product and source docs. Inspect current migrations, deployment stack and all registry and mapping tests; note discrepancies before editing.
2. Write a concrete implementation plan with folder structure, table migrations, OpenAPI, integration touchpoints, test plan, dependency/operation cost and source permissions matrix. **Do not change existing consumption paths**.
3. Implement an independent gateway service in a new isolated directory or repository. Start with eligibility checks and real source collectors, no prohibited crawling or fake data.
4. Implement and thoroughly test the key authority. Provision only WorksLake with a server-managed key (no secrets in Git), and keep external clients disabled until needed.
5. Make the gateway available through WorksLake's standard JSON source adapter, ideally **without changing any existing internal source functions**. If the generic adapter is insufficient, create the smallest possible backward-compatible adapter and document why.
6. Run all existing WorksLake and module unit/E2E tests and new security, integration, contract and load tests; report explicit before/after diff, API sample, failure behaviors, all permission statuses and measured coverage.
7. Deploy only to staging first; test/activate per source/module, maintain a fast flag-only rollback, and update `EXTERNAL_DATA_SOURCES.md` in the same PR as source changes. Never claim a source live until a real production check succeeds.

## 11. Source starting points (research only, not permission)

Jobs / Internships: company ATS + employer career pages and legitimate public API feeds. Teaching: school/university career pages and official recruitment notices; data.gov.in staffing counts are **not vacancies**. Services: existing Freelancer.com API rather than re-scraping the same provider; local services mainly opt-in. Therapists: no import until identity and licensure validation/consent. Co-founders: no unauthorised people-profile harvest; invite people to opt in. Events: assess Ticketmaster API and organizer sites first. Marketplace: opt-in/partner feeds only; eBay contract, OLX and classifieds terms must be reviewed before any use.

## 12. Important distinctions

- Gateway `/v1/search` is a **data API**, not a public arbitrary-URL scraper.
- Gateway API-key issuer is an admin capability, **not** a self-serve unchecked issuance loophole.
- Separate services and shared protocol allow future consumers without moving current WorksLake internals.
- An empty module is an honest result; a high item count is not a reason to override rights or safety.
