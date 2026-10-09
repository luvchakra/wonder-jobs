# Partner job portals — how to connect them (WJ-256)

LinkedIn, Indeed, Naukri, foundit and TimesJobs are registered in JobsLake as **Partner API** sources. None of them offers an open job-search API. The only legitimate access is a signed partnership or data-licensing agreement, after which the portal gives you an endpoint and credentials. Scraping them is not allowed, and JobsLake never scrapes (scraper governance, `server/jobslake/types.ts`).

The code side is done. When a portal hands over access, you enter it in the admin portal, run a test and activate. No further code is needed, as long as the portal delivers one of:

- a **JSON REST API**: any response shape, mapped field by field in the admin portal; or
- an **XML feed**: RSS 2.0, Atom, or the common `<job>` XML job-feed layout (`title`, `url`, `company`, `city`/`state`/`country`, `date`, `referencenumber`, `description`).

It also has to authenticate with one of:

- an **API key in a header** you name, with an optional prefix;
- a **Bearer token**;
- an **API key as a URL parameter**;
- **OAuth 2.0 client credentials** (token URL + client ID + client secret). JobsLake fetches the token, caches it until shortly before it expires, and renews it.

If a portal offers something else (SFTP drops, SOAP, a signed-request scheme, webhooks pushing to us), tell the engineering team. That would need a small connector.

## Per portal: who to contact

| Portal | Where to apply | What we know publicly |
|---|---|---|
| **LinkedIn** | LinkedIn Talent Solutions partner programme. Docs: <https://learn.microsoft.com/linkedin/talent/>. Non-partners use the *Talent Solutions Partner Request Form* linked from those docs, or LinkedIn business development. | Its public partner APIs (Job Posting, Apply Connect) are for ATSs to **post jobs into** LinkedIn. There is no public API for reading LinkedIn listings. Reading them needs a separate data agreement, so ask business development for that specifically. Its partner APIs use OAuth 2.0 client credentials. |
| **Indeed** | Indeed partner programme. Docs: <https://docs.indeed.com/>. For reading jobs, contact Indeed's partnerships / business development team. | The old Publisher (job search) API is closed to new publishers. The current partner APIs (e.g. Job Sync) **send jobs to** Indeed. Reading Indeed listings needs a data agreement. Its partner APIs use OAuth 2.0 client credentials. |
| **Naukri** (Info Edge) | No public partner programme that we can confirm. Contact Naukri / Info Edge's business development or data partnerships team. | Nothing public about a read API. Fields are left empty in the admin form. |
| **foundit** (formerly Monster India) | No public partner programme that we can confirm. Contact foundit's business development or data partnerships team. | Nothing public. Fields are left empty. |
| **TimesJobs** (Times Internet) | No public partner programme that we can confirm. Contact TimesJobs' business development or data partnerships team. | Nothing public. Fields are left empty. |

## What to ask each portal for

Send them this list. Their written answers are what you enter in the admin portal and what your agreement must cover.

1. **Endpoint**: the https URL of the jobs API or feed (production, plus a sandbox if they have one).
2. **Format**: JSON or XML, with a sample response. For JSON, which field holds the list of jobs and which fields hold id, title, employer, location, description, apply URL and posted date.
3. **Search**: can we pass a keyword and a location (and the parameter names), or is it a full feed?
4. **Authentication**: API key (header name or URL parameter), Bearer token, or OAuth 2.0 client credentials (token URL, client ID, client secret, scope). Also ask how to rotate credentials.
5. **Rate limits and freshness**: requests per minute/day, recommended refresh interval, maximum results per call.
6. **Permitted use, in writing**:
   - showing their jobs to WonderJobs candidates inside our product;
   - linking each job to its apply page (theirs or the employer's);
   - storing postings for a limited time (JobsLake keeps postings it has seen in a warm pool, and serves search answers from the last 24 hours out of a cache; agree retention limits with them);
   - required attribution or branding;
   - whether their jobs can be combined and de-duplicated with other sources;
   - anything forbidden (e.g. auto-applying, contacting employers, re-selling data).
7. **Their IP allowlist needs**, if any. WonderJobs calls from Vercel serverless functions, which don't have a fixed outbound IP unless one is configured.

## Entering it in the admin portal

You need to be on the admin allowlist (`JOBSLAKE_ADMIN_EMAILS`).

1. Open **Admin → JobsLake → Sources** and pick the portal (e.g. `/platform/jobs-lake/sources/partner_naukri`). It shows **Needs setup** with the checklist: endpoint → credential → test → agreement.
2. Go to **Configuration → Connection**:
   - **Delivery format**: JSON API or XML / RSS feed.
   - **Authentication**: pick the type. Enter the header name, URL-parameter name, or token URL + client ID as applicable.
   - **Endpoint**: the https URL. Internal, IP-address and plain-http URLs are refused.
   - Under **Search parameters and more**: the keyword and location parameter names (leave empty for a full feed; JobsLake filters it to each search), the key prefix, OAuth scope / client-authentication method, and a default employer for feeds.
   - Click **Save connection**.
3. Under **Credential** (or **Client secret** for OAuth), paste the key, token or client secret and save. It is stored encrypted and shown masked from then on. It never appears in the config, logs, API responses or audit trail.
4. For a JSON API, open **Mapping**. Click **Preview with live data**, set where the job list is and which field is which, then **Save mapping**.
5. Click **Run test**. This is a real fetch through the partner's API, validated against the JobsLake protocol (jobs returned, ≥ 90 % valid records, valid apply URLs). Fix anything it flags and test again.
6. Click **Activate**. Tick the box confirming that *a signed agreement with the portal permits WonderJobs to show these jobs to candidates and link to apply*, and optionally add the contract reference. Activation is refused without that tick, without a credential, or without a passing test from the last 24 hours. Your name, the time and the reference are recorded on the source and in its **Audit** tab.

From then on, the portal is searched like every other source. Candidates see its jobs with their provenance, and its health shows on the Sources list.

Changing the connection later puts the source back to **Do not use** until it passes a test and is activated again, with the agreement confirmed again. If the agreement ends, use **Advanced → Pause/Disable** straight away.
