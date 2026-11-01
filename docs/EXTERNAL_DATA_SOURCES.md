# External data sources — what each module imports, and what's open

*As of 2026-10-31, `main` at `bef99e3`. Owner: the WonderWorks session. Update this file in the same PR as any change to a module's sources.*

Every module's listings come from two places: **WonderWorks' own** (what people and organisations post in the app) and **outside sources** that WorksLake reads for it. This file lists every outside source we use, every option we looked at, what state each is in, and what is still open. "Open" below means *free to read*; "paid" means a fee, a licence or a signed agreement.

**How to read the status column**

| Status | Meaning |
|---|---|
| **Live** | In the code, on by default, no credential needed. |
| **Needs key** | In the code, shows "Needs setup" until the server has the credential (env var). |
| **Off by default** | In the code but disabled until an admin turns it on. |
| **Do not use** | Registered, never read: needs a signed agreement first. |
| **Researched** | Not built. Notes say whether it is worth building. |
| **Rejected** | Not worth it, with the reason. |

"Responds" means the endpoint answered HTTP 200 from our build machine on 2026-10-31. It does **not** prove the data is good, complete or licensed for our use.

---

## 0. Why WonderWorks was not getting data — live diagnosis, 2026-10-31

Each module's real search was run against the live feeds (no mocks). What came back, and why:

| Module · query | Result | Why |
|---|---|---|
| Internships · "marketing" | 36 results (Himalayas 29, SmartRecruiters 5, Arbeitnow 1, Jobicy 1) | Free feeds work. **Adzuna, Jooble and USAJOBS: Needs setup** (no credential) — these are the India and US sources, so India coverage is thin. The Muse, Remote OK, Remotive: 0 for this query. |
| Internships · "software", Pune | 3 results (Himalayas) | Same: the India-strong sources are the ones without keys. |
| Teaching · "english teacher" | 15 results (Himalayas only) | **Adzuna and Jooble: Needs setup.** WonderWorks schools: 0 (no school has posted a match). |
| **Talent & Services · "designer"** | **0 results** | **A bug, now fixed (below).** Freelancer.com returned 39 pros; WorksLake dropped all 39 as "too old". |
| Therapists · "counselling" | 1 result | Only WonderWorks' own practitioners until an admin registers the OpenStreetMap practices (WJ-600). |
| Events · "music" | 1 result | Only WonderWorks' own events; no outside source yet. |

**The Talent & Services bug.** A directory profile has no posting date, so its "posted" date was the day the freelancer made their account (often years ago). WorksLake serves only postings from the last two weeks (`domain/jobs/age.ts`), so every pro was removed (`tooOld: 39` in the search metadata). Fixed in `server/services/sources.ts`: a pro is not a dated posting, so it carries no date and isn't judged for age. After the fix the same search returns 39. This source has never returned a result before.

**Tried and not kept.** Adding the free feeds Internships uses (career sites, SmartRecruiters, Remotive, Remote OK, Jobicy, Arbeitnow) to Teaching returned 0 teaching jobs for "english teacher" and "maths tutor": those boards are almost all tech roles. They would only add six calls to every Teaching search, so they were not added. More free feeds do not fix Teaching; the Adzuna and Jooble keys do.

**What is still blocking data, in order of effect**
1. **Missing credentials** for Adzuna (Jobs, Internships, Teaching), Jooble (Internships, Teaching) and USAJOBS (Internships). Free to get; the owner must create the accounts and set the env vars (§11). *In the environment this was run in, none of them were set; whether they are set on production is still unverified.*
2. **Few WonderWorks postings**: the app's own schools, pros, practitioners and events are the only supply for Therapists, Events, Co-founders and Buy, Sell & Rent.
3. **Narrow queries on small remote feeds.**

---

## 1. How imports work (the rules every source follows)

- **WorksLake keeps one dataset per module.** A source belongs to one module; another module's sources and listings never appear in its searches (`module` column, `server/<module>/sources.ts`). Jobs' built-ins are in `server/jobslake/registry.ts`.
- **A source is a definition plus a provider.** The definition (id, provider, category, geography, `secretRef`, capabilities) says what it is; the provider fetches and maps it to the module's listing shape. A new source needs: the definition, the provider, a test with a recorded sample, and a row here.
- **Real data only** (CLAUDE.md). A source without its credential says **Needs setup**; a failed fetch says **Unavailable**; nothing is seeded, sampled or filled in. Every search shows what was searched, where, and per-source counts.
- **No scraping.** A source with no open API stays **Do not use** until a partnership hands over an endpoint and credential, a test passes, and an admin confirms the signed agreement (`docs/PARTNER_INTEGRATIONS.md`). WorksLake never scrapes a portal.
- **Credentials** are server env vars (`secretRef: "env:…"`) or encrypted admin-entered secrets (`server/secrets.ts`); never sent to the browser, never logged.
- **Outside listings link out.** Apply opens the source's own page; WonderWorks never submits to an outside site on the person's behalf except through the helper, on the employer's own page, with their opt-in (CLAUDE.md, AI and agent governance).
- **Retention and caching.** WorksLake keeps postings it has seen in a warm pool and serves a search from a cache for up to 24 hours. Any licence we sign must allow that (see §10).

---

## 2. Summary

| Module | Outside sources in code | Free/open | Paid or agreement | Biggest open issue |
|---|---|---|---|---|
| **Jobs** | 20 outside (19 free, 1 paid; 4 need a free key) plus WonderWorks employers; 5 partner portals not in use | Yes (15) | TheirStack (paid); LinkedIn, Indeed, Naukri, foundit, TimesJobs (agreement) | Credentials on production unverified; partner portals not started |
| **Internships** | 11 outside | Yes (all 11; 3 need a free key) | none | Same credentials; quality of "internship" detection varies by source |
| **Teaching** | 3 | Yes | none | No live-vacancy feed for Indian schools; coverage thin |
| **Talent & Services** | 2 (+ OpenStreetMap built, an admin registers it) | Yes | none | Nothing else is open; supply must come from WonderWorks pros; Freelancer.com terms (§6 issue 4) |
| **Therapists** | 1 (+ OpenStreetMap practices built, an admin registers it) | — | none | No register or directory is open; practices only, nothing verified |
| **Co-founders** | 0 | — | — | Deliberately none: people are listed only by consent |
| **Events & Social** | 0 | Researched: Ticketmaster | — | No India-strong open feed |
| **Buy, Sell & Rent** | 0 | none found | eBay (partner contract) | No open data; scrapers carry terms risk |

---

## 3. Jobs

Dataset `jobs`. Source of truth: `server/jobslake/registry.ts`, `domain/jobs/sources.ts`.

### Current sources

| Source | Kind | Access | Status | Notes |
|---|---|---|---|---|
| WonderWorks employers | WonderWorks | own | **Live** | Companies' own postings; unverified companies say so |
| Greenhouse | ATS | official public API | **Live** · responds | Public boards of companies WorksLake knows |
| Lever | ATS | official public API | **Live** · responds | Same |
| Ashby | ATS | official public API | **Live** | Same |
| SmartRecruiters career sites | ATS | official public API | **Live** · responds | Swiggy, Freshworks, Bosch, Continental, Delivery Hero, LinkedIn, ServiceNow (last two added 2026-11-01, WJ-544) |
| JazzHR career sites | ATS | public feeds | **Live** | HackerEarth, Ebizon, ProcDNA and more |
| The Muse | aggregator | public API | **Live** · responds | Key env `THEMUSE_API_KEY` is read; check whether it is required or only raises limits |
| Jobicy | aggregator | public API | **Live** · responds | Salary where disclosed |
| Remote OK | aggregator | public API | **Live** · responds | Latest 100 per search |
| Himalayas | aggregator | public API | **Live** · responds | Newest postings scanned |
| Himalayas part-time | aggregator | public API | **Live** | Part Time mode |
| Freelancer.com gigs | aggregator | public API | **Live** · responds | Gig mode; client not named publicly |
| Working Nomads | aggregator | public JSON (`/api/exposed_jobs/`) | **Live — terms pending** | Added 2026-11-01 (WJ-544). ~35 newest remote jobs, no search. Confirm with Working Nomads that reuse of the feed's listings is allowed |
| We Work Remotely | aggregator | public RSS (`/remote-jobs.rss`) | **Live — terms pending** | Added 2026-11-01 (WJ-544). Newest 100 remote jobs, no search. Confirm with We Work Remotely that showing the RSS listings in another product is allowed |
| Remotive | aggregator | public API | **Off by default** · responds | Public feed exposes only a handful of listings |
| Arbeitnow | aggregator | public API | **Off by default** · responds | Europe-focused |
| Adzuna India | aggregator | official API, free tier | **Needs key** | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` |
| Adzuna India part-time | aggregator | same keys | **Needs key** | Part Time mode |
| Jooble | aggregator | official API, free key | **Needs key** | Added 2026-11-01 (WJ-545) through WorksLake's shared connector. `JOOBLE_API_KEY` |
| USAJOBS | portal | official API, free key | **Needs key** | Added 2026-11-01 (WJ-545), US federal jobs. `USAJOBS_API_KEY`, `USAJOBS_EMAIL` |
| TheirStack | aggregator | **licensed, paid per job** | **Needs key** | `THEIRSTACK`; asked only when free sources fall short |
| LinkedIn, Indeed, Naukri, foundit, TimesJobs | portals | partner API | **Do not use** | None has an open search API; see `docs/PARTNER_INTEGRATIONS.md` for who to contact and what to ask |

### Options not built

| Option | Open/paid | Verdict |
|---|---|---|
| Hacker News "Who is hiring" via Algolia API | Open | Researched. Free, no key; posts hold contact emails (personal data) and terms are unclear. Low value for India. |
| Bundesagentur für Arbeit Jobsuche API (German federal job board, open data via bund.dev) | Open, public client id | Researched 2026-11-01. Answered 403 from our servers (a block, not a terms question): not built. Retry from the deployment before deciding. |
| Findwork.dev | Free key | Researched 2026-11-01. Tech jobs API, answers 401 without a key. Worth adding as "Needs setup" (`FINDWORK_API_KEY`, signup findwork.dev) if tech coverage is thin. |
| Reed.co.uk | Free key | Researched 2026-11-01. UK jobs API, 401 without a key. Low value for India; worth it only for UK searches. |
| Careerjet partner API | Free affiliate id | Researched 2026-11-01. Global aggregator incl. India; needs an affiliate id and the user's IP/user agent per call. Candidate for a later pass. |
| More company boards | Open | Ongoing. 2026-11-01 (WJ-544) added Razorpay, InMobi, HackerRank, Observe.AI (Greenhouse), Paytm, Zeta, Mindtickle (Lever), Sarvam AI, PostHog (Ashby); probed ~90 India-strong slugs, kept only boards that answered with the named company's jobs. Phonepe, Swiggy, Flipkart, Zomato, Dream11, Postman, BrowserStack and others aren't on these public APIs. |
| USAJOBS (all federal jobs) | Open, key | Already used for Internships and Teaching through WorksLake's shared connector (`server/jobslake/usajobs.ts`); Added to Jobs 2026-11-01 (WJ-545); see Current sources. |
| Jooble | Free key | Already used for Internships and Teaching through WorksLake's shared connector (`server/jobslake/jooble.ts`); Added to Jobs 2026-11-01 (WJ-545); see Current sources. |
| Coresignal job/people data | Paid | Researched (vendor). Priced by volume; only if TheirStack is not enough. |

### Open issues
1. **Production credentials unverified.** Whether `ADZUNA_*`, `JOOBLE_API_KEY`, `USAJOBS_*`, `THEMUSE_API_KEY`, `THEIRSTACK` are set on the Vercel project could not be checked: the Vercel connector is denied on team `wonder-team4` until the owner authorises it. Until then, treat every **Needs key** row as *not confirmed live*.
2. **Partner portals not started.** Nothing has been sent to LinkedIn, Indeed, Naukri, foundit or TimesJobs; each needs a business conversation, not code.
3. **Free feeds can change without notice.** There is no monitoring of per-source health beyond the search's own "Unavailable" line.
4. **Duplicates across sources** are folded by WorksLake; quality is judged by eye, not measured.

---

## 4. Internships

Dataset `internships`. Source of truth: `server/internships/sources.ts`, `providers.ts`.

| Source | Access | Status | Notes |
|---|---|---|---|
| WonderWorks companies | own | **Live** | Postings in Internships → Company |
| Unstop internships | public JSON list | **Live** · responds · terms pending | India's largest open internship list, with stated stipends (74 for "marketing" on 2026-11-01). **terms pending:** no published reuse terms, and robots.txt disallows `/api/*`; confirm with Unstop |
| Workable job board | public JSON | **Live** · responds · terms pending | Workable career sites worldwide, strong in India (Bengaluru, Pune, Noida). **terms pending:** robots.txt doesn't disallow it, but Workable's terms don't state reuse; confirm with Workable |
| Company career sites (Greenhouse, Lever, Ashby) | public API | **Live** · responds | Internship-titled roles only. Internships also asks 15 intern-heavy boards (WJ-580): Paytm, InMobi, Sarvam AI, Waymo, Jump Trading, Lyft, Point72, IMC, Pinterest, Samsara, Verkada, Sigma Computing, Scale AI, Akuna Capital, Roblox |
| SmartRecruiters career sites | public API | **Live** · responds | |
| Remotive | public API | **Live** · responds | |
| Remote OK | public API | **Live** · responds | |
| The Muse | public API (level = Internship) | **Live** · responds | |
| Himalayas | public API | **Live** · responds | |
| Arbeitnow (Praktikum) | public API | **Live** · responds | Germany |
| Jobicy | public API | **Live** · responds | |
| Adzuna India | free key | **Needs key** | `ADZUNA_APP_ID/KEY` |
| Jooble | free key | **Needs key** | `JOOBLE_API_KEY` |
| USAJOBS student internships | free key | **Needs key** | `USAJOBS_API_KEY`, `USAJOBS_EMAIL`; US only |

**Not added:** Internshala (no API or feed; its terms forbid automated access and robots.txt disallows its search and detail pages), LinkedIn (blocks automated access: a technical barrier), the AICTE and NATS internship portals (no API or feed). **Looked at, not added (WJ-580):** Sweden's JobTech "praktik" ads (open CC0 data, but few internships and Swedish-only titles), UK Find an apprenticeship API (free key; its v2 response format couldn't be checked without one, so a parser would be untested), SimplifyJobs' GitHub internship lists (no licence), Naukri (refuses automated requests: 403).

**Open issues**
1. **Detection.** "Is this an internship?" relies on the source's flag or the title; sources that don't flag it miss roles and some include false matches.
2. **Stipend and duration are often not stated** by outside postings; the app says "not stated" rather than guessing.
3. **India coverage**: Unstop and Workable now add key-less India internships; Adzuna and Jooble (key-gated) add more.
4. **AICTE/NATS** could be approached as partners if the owner wants them.

---

## 5. Teaching

Dataset `teaching`. Source of truth: `server/teaching/sources.ts`.

| Source | Access | Status | Notes |
|---|---|---|---|
| WonderWorks schools | own | **Live** | Schools, colleges and coaching centres post here |
| Adzuna India teaching jobs | free key | **Needs key** | |
| Jooble teaching jobs | free key | **Needs key** | |
| Himalayas teaching jobs | public API | **Live** | Remote and online tutoring |
| Adzuna teaching jobs — UK, US, Canada, Australia, NZ, South Africa, Singapore (`teach_adzuna_world`) | free key (same as India) | **Needs key** | Adzuna API terms; a salary is shown only when the ad states it (Adzuna's `salary_is_predicted` is never shown). A place in a search asks only its country. |
| USAJOBS teaching and education jobs (`teach_usajobs`) | free key + registered email | **Needs key** | US federal, public domain data (e.g. Bureau of Indian Education, DoD schools). Only titles that say teacher/teaching. |
| Arbetsförmedlingen JobTech, Sweden (`teach_jobtech`) | public API, no key | **Live** | CC0 (Platsbanken ads via JobSearch, occupation field Pedagogik). Contact emails and phone numbers are removed from ad text; each ad links to its own Platsbanken page. Asked only when a search names no place or a Swedish one. |

**Researched, not built**

| Option | Open/paid | Verdict |
|---|---|---|
| UDISE+ teacher counts (data.gov.in, AIKosh; Open Government Licence – India) | Open, downloads only | Context, not listings: teachers and vacancies by district. Newest sets found are 2019-20; one Rajya Sabha annexure cites 2024-25 state totals. |
| State teacher-recruitment boards | Open pages, no API | Would be per-state scraping; terms unverified. Not recommended without permission. |
| EdJoin, California school jobs (`apps/data-gateway/sources/edjoin-california-schools.json`) | Gateway crawl of public JobPosting pages | **Paused — terms pending** | Confirm EdJoin's terms allow reuse. robots.txt allows everything and lists its sitemap; pages carry JobPosting JSON-LD. Register, /test, then the owner activates. |
| TeachAway, international and ESL teaching (`.../teachaway-international.json`) | Gateway crawl of public JobPosting pages | **Paused — terms pending** | Confirm TeachAway's terms allow reuse (a recruiter: written permission may be better). robots.txt allows `/teaching-jobs-abroad/`. |
| jobs.ac.uk (university lecturers and teaching posts) (`.../jobs-ac-uk.json`) | Gateway crawl of public JobPosting pages | **Paused until Test & Activate — terms pending** | Confirm jobs.ac.uk's terms allow reuse (written permission may be better). robots.txt disallows only `/job/feedback/` and `/enhanced/fp/`. |
| K12JobSpot, SchoolSpring, eTeach UK | Open robots.txt | Checked 2026-11-01: sitemaps list no job pages with JobPosting data, so no crawl source. |
| Academic Positions, SchoolJobs | robots.txt disallows | Not built (a site that refuses us is recorded and skipped). |
| Germany BA Jobsuche | Unofficial, undocumented terms | Not built: no documented reuse rights. |
| France Travail "Offres d'emploi" | Key + signed licence, attribution | Deferred: needs the owner to accept the licence. |
| Careerjet | Key; terms to confirm | Deferred until the partner terms are read. |
| Canada Job Bank open data | Monthly CSV (OGL – Canada) | For the gateway (shared-layer session), not a live API. |
| NZ Education Gazette, Australian state boards, TES | No feed or API | Not built (would be scraping). |
| Greenhouse boards of school operators, Jobicy education | Open APIs | Tried: no teaching posts (Jobicy's are not teaching). |
| India | No open source | Best route is gateway partner uploads from schools and recruiters (shared-layer session). |
| Careers360-style vacancy estimates (~3.57 lakh vacant posts, 2025) | News analysis | Not a feed. |

**Open issues**
1. **No live Indian school-vacancy feed.** Coverage depends on Adzuna/Jooble keys and on schools posting on WonderWorks.
2. **Private schools and tutors** mostly hire through channels with no API.
3. **Minors:** the platform doc marks Teaching as a sensitive module (minors). Any outside source must not carry student data.

---

## 6. Talent & Services

Dataset `services`. Source of truth: `server/services/sources.ts`.

| Source | Access | Status | Notes |
|---|---|---|---|
| WonderWorks pros | own | **Live** | Local, visit-based work and remote projects |
| Freelancer.com experts | public directory API | **Live** · responds | Remote freelancers; public profiles only. **Terms concern, see Open issues 4** |
| OpenStreetMap businesses | open data (ODbL) via the data gateway | **Built** (2026-11-01, WJ-591); an admin registers the four definitions, tests and activates them | Local trades: plumber, electrician, AC (`hvac`), carpenter, painter, electronics repair. Four gateway definitions (`apps/data-gateway/sources/osm-services-{north,west,south,east}.json`), 24 cities, one Overpass query per city (15 km around the centre, named businesses with a `craft` tag only), collected **weekly**, read in-process by `server/services/sources.ts` and never per user search. Shows name, trade, nearest city, own website if tagged, a link to the OSM page and "© OpenStreetMap contributors" on the card and the page; **no phone or email is copied**. Owner decision 2026-11-01 (relayed by the shared-layer session): "allow OpenStreetMap business listings for services and therapists". |

**Researched**

| Option | Open/paid | Verdict |
|---|---|---|
| Upwork | GraphQL API; talent search needs the "Freelancer Profile - Read And Write Access" permission and an approved API key (support.upwork.com "Request an API key"); the developer pages returned 403 to our fetch, so its terms were not read in full. A search result says its documentation limits storing data to 24 hours and that its terms need results attributed to Upwork | Rejected unless a partnership is agreed and its terms are read: WorksLake stores what it collects. |
| Foursquare Places | Free sandbox, then pay per call (the pricing page's two free figures disagree: 10,000 calls vs 500 at $0). Rating and tip fields are Premium | **Rejected for WorksLake**: its usage guidelines allow caching only of the place id; "Pay as You Go and Sandbox customers get no caching permitted"; Enterprise only 24 hours on the device. WorksLake keeps what it collects. |
| Google Places | Not read in this pass | Rejected on the same ground as Foursquare until its caching terms are read; its terms are known to restrict storing results. |
| Houzz professionals (houzz.in) | public directory pages via the data gateway (crawl) | **Built** (2026-11-01, WJ-592); terms pending: confirm Houzz allows automated reading; an admin registers the ten definitions, tests and activates them | Design, build & renovation: interior designers, architects, design-build firms, contractors, kitchen & bath, flooring, tile & stone, landscape. Ten definitions `apps/data-gateway/sources/houzz-*.json` (16 listing pages each, 15 profiles a page, 2 s delay, daily at most, businesses only, no phone or email), read in-process by `server/services/sources.ts`, never per search. Shows name, category, city, rating and reviews if the page states them, link to the Houzz profile and "Houzz (houzz.in)". |
| WedMeGood vendors (wedmegood.com) | public vendor profiles, found from its sitemaps, via the data gateway (crawl) | **Built** (2026-11-01, WJ-593; owner: "yes, add WedMeGood"); terms pending: WedMeGood terms of use on automated access; an admin registers the four definitions, tests and activates them | New trade "Wedding & events": photographers, makeup artists, decorators, caterers, mehendi artists, planners, DJs, choreographers, priests, bartenders, entertainers, pre-wedding shoots (wear, jewellery, cards, cakes, favours, accessories and venues are left out). Four definitions `apps/data-gateway/sources/wedmegood-vendors-{1..4}.json`, one per vendor-profile sitemap (~38,000 profiles in the first), 20 profiles a run, hourly at most, 2 s delay; robots.txt (Content-Signal search=yes, ai-train=no) allows `*` and disallows `/profile/*/reviews/*`, which is never read. Trade and city come from the page's BreadcrumbList (kept by the gateway as `breadcrumb`); name, rating and review count from its LocalBusiness block; no phone, email or street. Coverage grows over days: a run reads at most 20 pages, and the first 5,000 profiles of each sitemap are reachable. |
| Geoapify Places (OSM-based) | Free 3,000 credits a day; its Places FAQ says results may be cached, stored and redistributed with attribution to OpenStreetMap (and to Geoapify on the free plan); the pricing page says the free plan may be used commercially, its terms say "with some limitations in production" | Possible: needs a free key and a call to confirm the production limit. Its trade categories (plumber, electrician) were **not** verified; the page lists `service` generally. Not built. |
| Overture Maps Places | Bulk GeoParquet on S3/Azure, no query API; per-source licences (CDLA Permissive 2.0, Apache 2.0, CC0); the Places theme names no single licence; India coverage unverified | Not built: needs a bulk-file pipeline, not an API. Worth a spike if OpenStreetMap proves thin. |
| Guru.com | Returned 403 to our fetch | Not checked. |
| PeoplePerHour | Site returned an empty page; no developer API found | Not checked. |
| Fiverr, Toptal | No public API found | Rejected. |
| Scraping services for freelancer sites (Apify and similar) | Paid per result | Rejected: terms-of-service risk, and our rule is no scraping. |

**Open issues**
4. **Freelancer.com's terms (read 2026-11-01).** Its API Terms (21 Dec 2017) say cached Data "should" be refreshed "at least every 24 hours", "for performance reasons only", and that "You may not copy or store any Data ... except to the extent permitted"; its User Agreement says "Our feedback ratings belong to us and may not be used for any purpose other than facilitating the provision of Seller Services via the Website". The directory endpoint itself is not in the documentation we could read. Today a search keeps these pros in WorksLake's warm pool and **shows their rating**. **Owner decision 2026-11-01: keep it live, terms to be confirmed by the owner later (terms pending: caching beyond 24 hours; showing ratings).**
5. **Personal data (§12.6).** Freelancer.com pros are individuals who did not opt in on WonderWorks. OpenStreetMap is businesses only, with no phone or email.
6. **Overpass.** Its wiki (read 2026-11-01) says the main instance is overloaded, that regular use should stay under 100 queries and 10 MB a day (the weekly collection is well inside that), and that "commercial use should use self-hosted or paid Overpass servers". The definitions use `overpass-api.de`; the owner picks the endpoint before activating, and the gateway source starts paused.
7. **The gateway's consent gate** is passed by `publicBusinesses: true` (services and therapists, WJ-500, #480): no `consentVerified` is claimed for OpenStreetMap.
1. **Was returning nothing at all** — fixed 2026-10-31 (see §0). It now returns the Freelancer.com pros for a search. **Nothing else is open**, so supply for local services must come from pros listing on WonderWorks.
2. **Freelancer.com data is remote work only.** Client details need OAuth and are not used.
3. **Ratings:** the Freelancer.com feed carries its own rating where it gives one; WonderWorks' reviews are separate and are not mixed with it.

---

## 7. Therapists

Dataset `therapists`. WonderWorks practitioners (`server/therapists/sources.ts`) and, once an admin registers it, OpenStreetMap practices (below).

**Built (2026-11-01, WJ-600): OpenStreetMap practices and clinics**

| Item | Detail |
|---|---|
| Source | OpenStreetMap, open data (ODbL), through the data gateway. Four definitions, `apps/data-gateway/sources/osm-therapists-{north,west,south,east}.json`, the same 24 cities as Talent & Services, one Overpass query per city (15 km around the centre), collected **weekly**, read in-process by `server/therapists/sources.ts`, never per user search. They start paused; an admin adds them from Platform → Sources → Partners & gateway → Add from catalogue, then Test & activate. |
| What it asks for | Named features tagged `healthcare=psychotherapist\|counselling\|psychologist`, or `amenity=clinic\|doctors` with a `healthcare:speciality` of psychiatry, psychotherapy, psychology or clinical psychology. |
| Practices only | The gateway admits it as `publicBusinesses` (WJ-500), claiming no opt-in. A mapped name is kept only if it carries a word for a practice (clinic, centre, counselling, psychology, wellness, foundation…); a name that is only a person's ("Dr. Anita Sharma") is left out (`isPracticeName`). This drops some real practices named after their founder, on purpose; a practitioner can list themselves. |
| Shown | Name, kind of practice, the nearest city (derived from its position, never an address), its own https website if tagged, a link to its OpenStreetMap page, and "© OpenStreetMap contributors" with the licence link on the card and the page. "Listed on OpenStreetMap". |
| Never shown or copied | Phone, email, address, fee, languages, focus, licence, qualifications, rating, "verified" or any claim. It can't be booked in WonderWorks and has no public share page. |
| Needs the owner | Terms pending: the licence (ODbL) is clear; **confirm where the weekly collection runs**. The public `overpass-api.de` says regular use should stay under 100 queries and 10 MB a day (the weekly collection is well inside that) and that commercial use should use its own or a paid server. The definitions use `overpass-api.de`; pick the endpoint before pressing Test & activate. No key. |
| Owner decisions | 2026-11-01 (relayed by the shared-layer session): "allow OpenStreetMap business listings for services and therapists"; data-source terms are confirmed later (CLAUDE.md, "Finding data sources"). |

Still not built: any register or directory of individuals; licence checks; crisis resources (legal wording first).

**India pass (2026-11-01, WJ-601): researched, nothing new built**

| Candidate | Finding | Verdict |
|---|---|---|
| National Hospital Directory, All India Health Centres Directory, Hospital Directory 2015 (data.gov.in, on AIKOSH) | Open under GODL (Government Open Data Licence – India). General hospitals and health centres (names, address, geo-code, ownership, specialisations), **not mental-health specific**; the AIKOSH page for the National Hospital Directory says frequency **Static**, file dated **2017** (9.9 MB); the health-centres directory is a 2016 snapshot (page updated 2019). `data.gov.in` itself refused connections from our build network, so its API (a free key, per its developer pages) was not tried. | Not built: stale and general; listing a 2017 hospital as a counselling option would not be genuine. Owner decision recorded on Setup to-do. |
| District Mental Health Programme (DMHP) districts | MoHFW publishes "List of Approved DMHP Districts" as a PDF by state; no per-clinic directory, no contact data, figures differ by source (743, 767 or 780 districts). | Not a source of practices. |
| Tele-MANAS (14416) cells | A helpline network, not a directory of practices; 42 to 53 cells reported inconsistently; no official per-cell list. | It is a **crisis resource**: its wording and placement wait on legal review, not built. |
| Clinic and practice sites with schema.org JSON-LD | No Indian chain of clinics with open `MedicalClinic` or `LocalBusiness` markup and permissive robots.txt was identified; the well-known directories (Practo, Psychology Today, Amaha-style listings of individuals) are individuals or forbid it. | Nothing to crawl yet. If a specific practice chain is named, the gateway's crawler can take it (practices only). |
| More OpenStreetMap cities | The cities table is shared with Talent & Services; a business is given its nearest city, so adding cities changes both modules. | Not done in a module PR: the shared-layer session owns the table. |
| `geography` on gateway definitions | Not yet read by the gateway or Setup to-do on `main`. | The osm-therapists files get `"geography": ["IN"]` once the field is supported. |

**Researched**

| Option | Open/paid | Verdict |
|---|---|---|
| India registries: RCI Central Rehabilitation Register (clinical psychologists), NMC Indian Medical Register (psychiatrists) | Public lookups, no open API or download found | Not importable. Counsellors are on no statutory register. A national database project (SocialCops with the Live Love Laugh Foundation) was described; whether it is public is unconfirmed. |
| US NPI Registry (NPPES) | Open, free API, 2,100-result cap | US only; not useful for India. |
| Commercial directories (TherapyRoute: about 1,200 India listings) | Private | Rejected: unverified, not licensed. |

**Open issues**
1. **No outside individuals.** OpenStreetMap practices only; importing individual practitioners needs licence verification, consent and the health-data compliance the platform doc requires.
2. **Searches are now kept** in the client's own account (WJ-445); consider a Clear option or expiry.

---

## 8. Co-founders

Dataset `cofounders`. WonderWorks founders only (`server/cofounders/sources.ts`).

**Researched**

| Option | Open/paid | Verdict |
|---|---|---|
| Hacker News "Who wants to be hired / Who is hiring" (Algolia API) | Open | Rejected for listings: free-text posts with contact emails; people did not list for this purpose. |
| Coresignal startup/founder data | Paid | Rejected: people who never opted in. |
| Fundable (startup, investor and people dataset; API launched 2026) | Paid | Rejected for the same reason; fine for company context only. |
| Hugging Face YC founders preview | Free preview | Rejected: partial, not licensed for this. |
| FounderDating / CoFoundersLab | No public API | Not possible. |
| GitHub public API, Product Hunt API v2 | Open (terms unverified) | Not researched in depth; same consent problem. |

**Open issues**
1. **By design, people are listed only by their own choice**, and contact is shared only when both sides are interested. No outside source fits that.
2. **Verification** of claims (past companies, roles) is not available from any open source.

---

## 9. Events & Social

Dataset `events`. Sources: WonderWorks events (`server/events/sources.ts`), the gateway's events (`works_gateway_events`: confs.tech today), developers.events, Devpost hackathons, OpenStreetMap Calendar, Devfolio, HackerEarth (the last three through the gateway), and Ticketmaster (below). The same event from two sources is listed once (title and start day). An outside event shows only what its source states, never a seat, an RSVP or an organiser the source didn't give, and links to the event's own page (`server/events/outside.ts`).

**In the code**

| Source | Status | Notes |
|---|---|---|
| WonderWorks events | **Live** | Organisers' own events, with seats and RSVP. |
| confs.tech (via the gateway, `apps/data-gateway/sources/confs-tech.json`) | **Live** once the owner activates `works_gateway_events` | MIT. About 157 upcoming tech conferences worldwide, 8 in India. |
| **Ticketmaster Discovery API** (`evt_ticketmaster`, `server/events/ticketmaster.ts`) | **Needs key** | Env `TICKETMASTER_API_KEY`, free at developer.ticketmaster.com (5,000 calls a day, 5 a second). Concerts, sport, theatre and family events in the countries Ticketmaster sells in; India coverage is thin. Terms read 2026-11-01: one call per person's search (never crawled in the background); content kept only "for reasonable periods" and removed within 24 hours on the owner's request; each event links to its own Ticketmaster page. The owner should confirm WorksLake's search-cache period (up to 24 hours) is a "reasonable period" before turning it on. |
| **OpenStreetMap Calendar** (via the gateway, `apps/data-gateway/sources/osm-calendar.json`, listed in the admin catalogue) | **Defined, not added**: the owner adds it from the catalogue after confirming the terms | Public JSON API at `osmcal.org/api/v2/events/`, no key (the site documents it for sites that show its events; robots.txt allows it). 116 upcoming mapping events worldwide on 2026-11-01 (6 in India); a cancelled event is left out. **Terms to confirm:** no data licence is stated. |
| **KonfHub** (via the gateway's crawler, `apps/data-gateway/sources/konfhub-events.json`, in the admin catalogue) | **Defined, not added**: terms pending; the owner confirms, then adds it from the catalogue, Tests and Activates | India-heavy tech and community events. robots.txt (read 2026-11-01) allows every path but /cgi-bin/ and lists its sitemap on files.konfhub.com (1,974 event pages, one path segment deep). Each event page carries schema.org Event JSON-LD: the crawler keeps its start and end dates, whether it's online, and cancelled or postponed (WJ-502). Up to 40 pages an hour, a second apart; past events are dropped. |
| **Linux Foundation Events** (via the gateway's crawler, `apps/data-gateway/sources/linux-foundation-events.json`, in the admin catalogue) | **Defined, not added**: terms pending, as above | KubeCon, Open Source Summit and the other LF events worldwide. robots.txt (read 2026-11-01) allows crawling and signals search=yes, ai-input=yes, ai-train=no. Its sitemap lists 8,814 pages; the crawler reads only the 254 event roots (`pathPattern: "/*/"`), up to 40 every 6 hours. |
| **developers.events** (`evt_developers_events`, `server/events/developersEvents.ts`) | **Paused: licence limits use**, no key | The maintainers' public `all-events.json` (README: "all the data … available publicly in JSON"; robots.txt allows it). Read directly, once every 12 hours (3.6 MB, mostly past events, dropped before it is kept; over the gateway's 2 MB limit). 797 upcoming developer conferences on 2026-11-01, 23 in India, 41 online, with each event's own page and call for papers. Only entries it marks open or virtualized are shown; cancelled, postponed and delayed ones are not. **Correction (2026-11-01):** earlier notes here and in #481 said it states no licence; its README ("License") says "The content & the data are licensed under the CC-BY-NC license", i.e. non-commercial. That is a stated limit, not just unconfirmed terms, so it stays paused for the owner to decide: confirm WonderWorks' use counts as allowed, or ask the maintainers (scraly/developers-conferences-agenda) for permission, then Activate in the admin. |
| **Devpost hackathons** (`evt_devpost`, `server/events/devpost.ts`) | **Live, terms pending**, no key | `devpost.com/api/hackathons?status[]=open` (the public JSON its own site loads; robots.txt allows it). 44 open hackathons on 2026-11-01, mostly online, nine to a page, so five requests, read once every 12 hours. Devpost states dates as one line of text ("Oct 01 - Nov 12, 2026"); `devpostRange` reads it into a first and last day and leaves an entry out when it can't (no day is guessed). Shows Devpost's own organiser, themes and prize total; each event links to the hackathon's own page. Terms to confirm: the list is public JSON but Devpost's terms don't state reuse (ask Devpost). Scholarships lists the same hackathons as projects in its own dataset. |
| **Devfolio hackathons** (via the gateway, `apps/data-gateway/sources/devfolio-hackathons.json`, in the admin catalogue) | **Defined, not added**: terms pending; the owner adds it from the catalogue, Tests and Activates | India's largest hackathon platform: 10 open hackathons on 2026-11-01 (eight in India, one online, one with no place given), with city, dates and their own `<name>.devfolio.co` page. `api.devfolio.co/api/hackathons?filter=application_open` (the JSON devfolio.co loads, no sign-in; robots.txt disallows nothing; `page=1` is required, `limit=100`). Times are UTC with the event's zone named (`timezone`, e.g. Asia/Calcutta), so Events shows the day in that zone (18:30 UTC on 27 Nov is 28 Nov in India). Real payload through the gateway's validator and mapper: 10 of 10 kept. Terms to confirm: Devfolio's terms for reuse of the list. |
| **HackerEarth challenges** (via the gateway, `apps/data-gateway/sources/hackerearth-events.json`, in the admin catalogue) | **Defined, not added**: terms pending, as above | The upcoming and ongoing hackathons in HackerEarth's public events feed (`hackerearth.com/chrome-extension/events/`; robots.txt allows it), with start and end times in India time. Two on 2026-11-01; small but India-strong. Real payload through the mapper: 2 of 2 kept. Terms to confirm: HackerEarth's terms for reuse of the list. |
| **Helsinki Linked Events** (via the gateway, `apps/data-gateway/sources/helsinki-linkedevents.json`, in the admin catalogue; WJ-573) | **Defined, not added**: terms pending; the owner adds it from the catalogue, Tests and Activates | The City of Helsinki's open events data (`api.hel.fi/linkedevents/v1/event/`, no key), licensed CC BY 4.0 per the city's developer portal and the open-data catalogues (read second-hand on 2026-11-01; images carry stricter licences and are not used). Only events with an English name, no series, no longer than 14 days (3,709 on 2026-11-01: library workshops, meetups, concerts, short exhibitions), with the venue and city, and the city's own page (`tapahtumat.hel.fi/en/events/<id>`). Times are UTC moments; the source's `timezone: "Europe/Helsinki"` (WJ-508) makes Events show the day in Helsinki. A schema.org status of EventCancelled or EventPostponed is left out. Up to 20 pages of 100 a day, a second apart, additive across runs. Real payload through the gateway's validator and mapper: 91 of 100 kept (the rest already over). **Caveat:** it is ~3,700 Finnish events in a global dataset, so an unfiltered word like "music" will list many of them; add it when that is acceptable, or once Find narrows by the person's place. **Terms to confirm:** the licence page itself, and api.hel.fi's robots.txt (unreadable from the build environment). |

**Researched, not built** (owner, 2026-11-01: any genuine public feed or page is fine unless its robots.txt or terms forbid automated access; never harvest private people's profiles)

| Option | Open/paid | Verdict |
|---|---|---|
| GDG and CNCF community events (Bevy: `gdg.community.dev/api/event/`) | Public JSON, no key; 903 live events | **robots.txt disallows `/api/`** (and asks for a 2-second crawl delay), and the gateway honours robots.txt. Not built until the owner decides whether to read it anyway or asks Google/Bevy (CNCF's site redirects to a different host). |
| Commudle (India community events), Hasgeek | robots.txt allows crawling | Commudle's event pages carry no schema.org Event data and its sitemaps sit on another host; Hasgeek's dated sitemaps were empty on 2026-11-01. Nothing to read. |
| Townscript | — | Discontinued ("Townscript and Townhall services have been discontinued"). |
| Meetup event pages | robots.txt lists its events sitemap | Event pages carry Event JSON-LD, but the site is millions of pages and its terms forbid scraping; not a fit for a polite hourly crawl. Not built. |
| Paris "Que faire à Paris" (ODbL), Brisbane City Council "What's On" (CC BY 4.0), Melbourne events, Ghent events (all open data on Opendatasoft hosts) | Open licences, no key | Not reachable from the build environment on 2026-11-01 (connections reset), so their payloads could not be read and a mapping can't be written blind. Worth testing from the gateway's admin (it runs from Vercel) once someone can read a real record. |
| NYC Parks events (Socrata) | Open | Stale: the newest event is from 2019. Rejected. |
| Wikidata events | CC0 | Thin (about 6 upcoming conferences). Not worth a source. |
| Skiddle (UK), Eventfinda (NZ), SeatGeek (US) | Free keys, terms not read | Regional; no India value. Not built. |
| Eventbrite, Meetup | No public search (Eventbrite) / Pro only (Meetup) | Not used. |
| Vihaya, AllEvents, Insider and similar | Their own products | Not data sources; scraping them is not allowed. |

**Open issues**
1. **India coverage** now comes from confs.tech, developers.events (23), Devfolio (hackathons) and HackerEarth, plus KonfHub once the owner adds it; there is still no open feed of everyday community meetups (Meetup, Commudle and Townscript are closed, empty or discontinued).
2. **Imported events carry no capacity or price we control**: RSVP is only for events posted on WonderWorks; outside ones link out.
3. **Minors:** the platform doc marks Events as sensitive for minors; age rules must come from the source.

## 9a. Scholarships & Projects (2026-11-01)

A dataset of its own (`module = 'scholarships'`), always searched worldwide. Built-in connectors in `server/scholarships/sources.ts`; every listing past its deadline, without an https official link, or asking a fee to apply is dropped (`server/scholarships/search.ts::outside`).

| Source | Status | What it gives |
| --- | --- | --- |
| **WonderWorks organisations** (`schol_wonderstar`) | Live | Scholarships and projects organisations post in a Hiring workspace, applied to on WonderWorks. |
| **Grants.gov** (`schol_grants_gov`) | Live, no key | `search2` (public, no key), eligibility "Individuals" only, titles that read as for students. Terms allow display with the notice "This product uses the Grants.gov API but is not endorsed or certified by HHS", shown on its listings. Few hits (3 on 2026-11-01). |
| **Unstop** (`schol_unstop`) | **Live, terms pending**, no key | `unstop.com/api/public/opportunity/search-result` (public JSON) for scholarships, hackathons and competitions open to students in India; 86 open on 2026-11-01. Listings it marks `isPaid` or closed for registration are left out. Terms to confirm: no published reuse terms for the API (ask Unstop). |
| **Devpost** (`schol_devpost`) | **Live, terms pending**, no key | `devpost.com/api/hackathons?status[]=open` (public JSON), open hackathons as projects with their submission deadline and prizes; 44 open on 2026-11-01. Terms to confirm: the hackathon list is public JSON but its terms don't state reuse (ask Devpost). |
| **EU Funding & Tenders: fellowships** (`schol_eu_msca`) | **Live, terms pending**, no key | The portal's search API (`api.tech.ec.europa.eu/search-api`, public key `SEDIA`), open fellowship calls only (MSCA Postdoctoral Fellowships, ERA Fellowships), each linked to its call page. Terms to confirm: Commission reuse policy (CC BY 4.0) for this endpoint. |
| **Opportunity Desk** (`schol_opportunity_desk`) | **Live, terms pending**, no key | The site's public WordPress RSS feed for scholarships and fellowships (pages 1–3): one post per opportunity, with the deadline its post states ("Deadline: December 14, 2026"); round-up posts are left out. 25 on 2026-11-01. Links go to the post, which links to the provider. Terms to confirm: reuse of post summaries (ask the site). |
| **Scholars4Dev** (`schol_scholars4dev`) | **Live, terms pending**, no key | The same for Scholars4Dev's feed (international scholarships). 20 on 2026-11-01. Terms to confirm: reuse of post summaries. |
| **Kaggle competitions** (`schol_kaggle`) | **Needs setup** | Kaggle's API (`/api/v1/competitions/list`). Owner: set `KAGGLE_USERNAME` and `KAGGLE_KEY` in Admin → Settings → API (free: kaggle.com → Settings → API → Create New Token). |
| **Partner uploads** (`works_gateway_scholarships`) | Draft until activated | A college, foundation or CSR team's list, uploaded through the gateway (§13.7). |

Looked at on the second pass (2026-11-01), not added: **LFX Mentorship** (its API answered "being upgraded", 503; re-check), **MLH** events (Cloudflare redirect on the events page; not bypassed), **NSF** program announcements RSS (programmes for institutions, not students), **DAAD** (results load through its page only), Indian state scholarship portals (no feed or API found; listings link to them).

Looked at, not added: India's **National Scholarship Portal** (no API or feed; listings link to it), **Buddy4Study**, **Fastweb** and **Scholarships.com** (no open API or feed), **Google Summer of Code** (its API returned no current programme on 2026-11-01; re-check when the 2027 programme opens), **Outreachy** (no public JSON), **DAAD** scholarship database (search only through its page; a gateway crawl candidate), **EURAXESS** (job offers, mostly positions; a gateway candidate for fellowships).

---

## 10. Buy, Sell & Rent

Dataset `marketplace`. WonderWorks listings only (`server/marketplace/sources.ts`).

**Researched**

| Option | Open/paid | Verdict |
|---|---|---|
| eBay Browse API | Sandbox open; production needs a contract and partner programme approval; results capped at 10,000 | Not a casual feed; items link to eBay for commission. Only for a deliberate partnership. |
| Craigslist (scraper services) | Paid per result, unofficial | Rejected: no official API, terms risk. |
| OLX, Mercari, Gumtree | No public API found | Not possible. |
| Open datasets of used goods or rentals | None found | — |

**Open issues**
1. **There is no open supply.** A marketplace needs its own listings, which also fits the anti-scam rules (we know who listed).
2. **Housing and payments are sensitive** in the platform doc; any outside housing listings would need verification we can't do.

---

## 11. Credentials and where they live

| Env var | Source(s) | Free? | Status on production |
|---|---|---|---|
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | Adzuna India (Jobs, part-time, Internships, Teaching) and Adzuna's 7 English-speaking countries (Teaching) | Free tier | **Unverified** |
| `JOOBLE_API_KEY` | Jooble (Internships, Teaching) | Free key | **Unverified** |
| `USAJOBS_API_KEY`, `USAJOBS_EMAIL` | USAJOBS (Internships, Teaching) | Free key | **Unverified** |
| `THEMUSE_API_KEY` | The Muse | Key optional? | **Unverified** |
| `THEIRSTACK` | TheirStack (Jobs) | **Paid** | **Unverified** |
| `TICKETMASTER_API_KEY` | Ticketmaster (Events) | Free key | **Not set** (source shows Needs setup) |
| `JOBSLAKE_ADMIN_EMAILS` | Admin portal access | — | **Unverified** |

To verify: authorise the Vercel team once (`authorize_team_access`), then read the variable *names* on the `wonderjobs` project (never the values).

---

## 12. Cross-cutting open issues

1. **Licence and terms review.** "Public API" does not mean "licensed for our use". Each source's terms on storing, caching (24 hours), combining with other sources, attribution and showing salary need a written check. Only Jobs' partner portals have that process (`docs/PARTNER_INTEGRATIONS.md`).
2. **No public page for most listings.** Share links for outside listings go to the original posting; for WonderWorks-created listings in modules other than Jobs they open the module and need sign-in (WJ-456). Public pages would help sharing and search engines.
3. **Source health.** No alert when a free feed shrinks, changes shape or starts returning nothing; the person only sees "Unavailable".
4. **Quality measurement.** Duplicates, wrong module (a job in Internships) and stale postings are checked by eye.
5. **Admin Supabase and Vercel access.** The Supabase connector sees the wrong projects and the Vercel connector needs team authorisation; both block verifying live configuration.
6. **Personal data.** Any source that carries people (HN posts, founder datasets, freelancer profiles) must be either opt-in or reduced to non-personal fields.
7. **Per-module dataset isolation** is enforced by the `module` column and tested; any new source must be registered under exactly one module.

---

## 13. Adding or changing a source — checklist

1. Check the terms in writing; note them in this file.
2. Add the definition in `server/<module>/sources.ts` (or the Jobs registry) with `secretRef` if it needs a key.
3. Add the provider and a test using a recorded sample; verify the module filter and that another module never sees the rows.
4. Show **Needs setup** and **Unavailable** honestly; no fallback data.
5. If it carries people, confirm consent; otherwise drop the personal fields.
6. Update this file, the tracker row (note the security or governance implication) and `docs/PROGRESS.md`; add the help line if users see a new source name.

---

## Sources for the research in this file

- Ticketmaster Discovery API: <https://developer.ticketmaster.com/products-and-docs/apis/getting-started/>
- UDISE+ teacher data (AIKosh): <https://aikosh.indiaai.gov.in/home/datasets/details/bhiwani_haryana_teacher_data_udise_plus_2019_20.html>; (data.gov.in): <https://community.data.gov.in/?p=113814>
- Vacancy estimate: <https://news.careers360.com/teachers-day-2025-government-schools-3-57-lakh-teaching-vacancies-udise-plus-pab-data-uttar-pradesh-lead-education-ministry/amp>
- OpenStreetMap licence and attribution: <https://osmfoundation.org/wiki/Licence_and_Legal_FAQ>
- eBay Browse API: <https://developer.ebay.com/api-docs/buy/browse/overview.html>
- NPI Registry (NPPES) overview: <https://dev.to/avabuildsdata/how-to-search-the-npi-registry-for-healthcare-providers-without-the-terrible-nppes-website-24if>
- Mental-health professional registries in India: <https://blog.socialcops.com/?p=1874>
- Freelancer.com public API notes (third-party): <https://apify.com/automation-lab/freelancer-com-freelancer-profile-scraper>
- Freelance marketplace data and Upwork access (vendor claim): <https://www.actowizsolutions.com/freelance-marketplace-data.php>
- Eventbrite public search removal (vendor claim): <https://logiover.pages.dev/guides/eventbrite-api-alternative-public-event-search/>
- Founder datasets (Coresignal): <https://datarade.ai/data-products/coresignal-startup-data-global-150k-founder-company-re-coresignal>
- FounderDating/CoFoundersLab API status: <https://providers.apievangelist.com/providers/founderdating/>
- Hacker News hiring threads via Algolia (third-party notes): <https://apify.com/obsidian937/hacker-news-intel>

Several of these are vendor pages or third-party summaries, not the provider's own terms. Treat each as a lead to confirm, not as a licence.

---

## 13. Proposed additional gateway source (not active, 2026-10-31)

PR #438 adds a separate Node.js gateway package at apps/data-gateway and an opt-in gateway source registration per module at apps/web/src/server/jobslake/gatewaySources.ts. Existing feeds, client APIs and app results remain unchanged unless the operator explicitly sets WORKSLAKE_GATEWAY_ENABLED=1, a verified public HTTPS WORKSLAKE_GATEWAY_URL, and server-only WORKSLAKE_GATEWAY_API_KEY, then runs the existing source test and activates each module separately.

All eight module datasets have an optional gateway definition (jobs, internships, teaching, services, therapists, cofounders, events and marketplace), but **none has a new approved or live upstream provider from this PR**. The gateway stores only actual permitted material, preserves provenance, and only admits sources with recorded permission, retention and redistribution rights. Therapists/cofounders/services/marketplace additionally require consent verification. WorksLake does not scrape portals itself and its existing source restrictions remain unchanged.

Gateway endpoints are versioned separately from WorksLake Protocol v1 and present a compatibility JSON response using WorksLake's existing field mapper. The gateway runs out of band. Until production-grade persistence, queueing, rate limiting and rights review are complete this should be considered staging-ready MVP only. Details: [WORKSLAKE_EXTERNAL_DATA_GATEWAY.md](WORKSLAKE_EXTERNAL_DATA_GATEWAY.md) and [gateway README](../apps/data-gateway/README.md).

### 13.1 Gateway pilot: first source checks (2026-10-31)

Run with the gateway's own fetcher and robots check, from the sandbox. Nothing was stored from the two ineligible sources. Permission evidence is what each site says itself; it is recorded on the source (`apps/data-gateway/sources/*.json`) and is the admin's to confirm before activation.

| Candidate | Module | Robots | Permission found | Result |
|---|---|---|---|---|
| We Work Remotely RSS (`/remote-jobs.rss`) | Jobs | Allowed | Written, on its feed page: "Anyone can use the feed, all we ask is that you attribute the links back to We Work Remotely." | **Eligible.** Tested end to end on a local gateway: 99 items, 98 valid (company read from its "Company: Title" format, region as location, remote-only), searched, module-isolated (0 in Internships), plain text only. Definition: `sources/we-work-remotely.json`. **Live in the gateway since 2026-10-31** (production check: registered paused → test 99 found / 98 valid → activated → collected 98; Jobs search returns them, Internships 0, plain text only). Attribution to We Work Remotely must show wherever a listing does. |
| Working Nomads API (`/api/exposed_jobs/`) | Jobs | Allowed | None found (no API page; terms bar commercial exploitation of the service) | `do_not_use` until Working Nomads confirms reuse in writing. |
| Jobspresso RSS (`/feed/?post_type=job_listing`) | Jobs | **Disallows the path** | n/a | `do_not_use`. The gateway refuses it. |

Still open from §11: Teaching, Events, Services and the other modules have no eligible source found yet; Events (Ticketmaster) needs a key, Teaching needs a school or recruitment-notice source with written permission.

### 13.2 Gateway hosting: in the app (2026-10-31)

The gateway is served from the WonderWorks app itself, in the same Vercel project and the same Supabase as WorksLake (owner, 2026-10-31: "deploy at the same location as WorksLake"). No second project and no separate host.

- **API:** `https://jobs.wonderapps.biz/v1/...` (`app/v1/[...path]/route.ts`), the same handler code as the standalone service (`apps/data-gateway/src/handler.mjs`). Its own keys and limits; description at `/v1/openapi.json`.
- **State:** `wonderjobs.gateway_state` (migration 0044), three small rows (core, listings, usage) written with a version check, so concurrent requests never overwrite each other and a search never rewrites the listings row.
- **Collection:** Vercel Cron `/api/cron/gateway-collect`, daily at 04:30 IST (the project's cron plan allows once a day). It fetches only sources an administrator tested and activated; robots and permission are checked on every fetch.
- **Off by default:** `/v1` answers 503 and the cron does nothing until `GATEWAY_ADMIN_TOKEN` and `GATEWAY_CURSOR_SECRET` are set. WorksLake reads it only when `WORKSLAKE_GATEWAY_ENABLED=1` (with `WORKSLAKE_GATEWAY_URL` and `WORKSLAKE_GATEWAY_API_KEY`), and each module's gateway source starts as a Draft.
- **Rate limit** is per instance (in memory), so on several serverless instances the effective limit is higher than the setting; a shared limiter remains a follow-up before any external consumer is given a key.

### 13.3 Production state (2026-10-31, checked from outside)

- `https://jobs.wonderapps.biz/v1/health` → 200, `storage: supabase`. No key / bad key / wrong admin token → 401.
- Secrets set in Vercel (Production, Sensitive): `GATEWAY_ADMIN_TOKEN`, `GATEWAY_CURSOR_SECRET`, `WORKSLAKE_GATEWAY_API_KEY` (key `key_b0f0dc4475f841c3a3b0e516`, all eight modules; rotate with `/v1/admin/keys/<id>/rotate`). Plain: `WORKSLAKE_GATEWAY_URL=https://jobs.wonderapps.biz`, `WORKSLAKE_GATEWAY_ENABLED=1`.
- Gateway source `src_c5853af63a0ea4f22734a0c8` (We Work Remotely, Jobs): **active**, 98 listings, collected daily at 04:30 IST.
- WorksLake: the eight gateway sources (`works_gateway_<module>`) show in Platform → WorksLake → Sources as **Draft**. Candidates see nothing from the gateway until a platform admin tests and activates one there (Jobs first). That step needs the owner's own sign-in; it cannot be done by a service.
- Attribution: WorksLake shows the gateway source's name on these listings; each one's link goes to its page on weworkremotely.com, which is what WWR asks for. A per-listing source name needs a mapping field WorksLake does not have yet.

### 13.4 Crawler and the second source sweep (2026-10-31)

**Crawler** (`apps/data-gateway/src/crawl.mjs`, `kind: "crawl"`): for sites that publish schema.org listings **and permit reuse**. Sitemap or index-page discovery, same host and path only, robots.txt rules and Crawl-delay honoured (≥ 1 s between pages), ≤ 50 pages and < 45 s per run, resumes where the last run stopped, adds to earlier finds. No eligible site needs it yet; it is ready for a site that grants permission in writing (`permission: "granted_in_writing"`).

**Sweep:** 18 candidates checked for written reuse permission and robots (owner asked to "populate the sources").

| Source | Module | Result |
|---|---|---|
| UK DfE Teaching Vacancies API | Teaching | **Eligible** (Open Government Licence v3; no fee for hiring respondents). Registered `src_25a770183ca8f0cc9d12dbcd`, tested 100/100, **active on the gateway**, 100 listings (newest page). UK schools only, and all school roles, not just teachers. WorksLake's Teaching gateway source is still Draft: activating it is the owner's call. Definition: `sources/uk-teaching-vacancies.json`. |
| Canada Job Bank open data | Jobs | Eligible (OGL-Canada) but monthly CSV and Canada-only; needs a CSV reader. Not added. |
| confs.tech conference data | Events | Eligible (MIT) but items have no organiser and no posting date; the gateway needs event fields (start/end date) first. Not added. |
| Careerjet publisher API (has India) | Jobs | Needs a free publisher key; terms to confirm on sign-up. |
| Ticketmaster Discovery | Events | Needs a free key; India coverage unconfirmed. |
| OpenStreetMap | Services/Marketplace | **Superseded 2026-11-01:** the owner allowed OpenStreetMap business listings for Services (and Therapists): businesses only, with the credit, weekly collection, no phone or email. See §6. Marketplace stays out. |
| developers.events | Events | CC-BY-NC (non-commercial): not usable. |
| Hasgeek, Meetup, Reed API, Puducherry recruitment, Etsy | various | Terms or robots forbid crawling or reproduction. |
| NCS, data.gov.in NCS, UPSC RSS, AICTE internships, Findwork, Mobilizon, AllEvents | various | No reuse statement, no usable feed, or unreachable. |

**India:** no Indian source with explicit open reuse was found for jobs, internships or teaching. Indian government sites set reuse per site; a school, college or employer that gives written permission can be added with the crawler.

### 13.5 All locations, hourly runs and the admin page (2026-10-31)

- **No location limit** (owner): sources anywhere are taken when their terms permit reuse; listings keep their own place.
- **Paged APIs** (`json_api` with `nextPath`, e.g. `links.next`): a run reads up to `maxPagesPerRun` pages a second apart, only on the source's host, and the next run carries on; finds are added to earlier runs'. UK Teaching Vacancies is re-registered this way to cover all ~66 pages (~6,500 vacancies) instead of the newest 100.
- **Hourly:** GitHub Actions (`.github/workflows/gateway-collect.yml`) calls `/api/cron/gateway-collect` every hour (Vercel's plan allows daily crons only); each source still runs on its own interval.
- **Admin page:** Platform → WorksLake → Sources → **Gateway** (`/platform/jobs-lake/gateway`): listings held per module, active sources, runs and records collected in the last 24 h, each source's status, listings, last/next run and crawl progress, the newest 100 runs (tests, collections, failures with their code), WorksLake's calls today, and **Collect now** per active source (audited).
- **Still not added:** Canada Job Bank (monthly CSV well over the 2 MB fetch limit; needs a streaming CSV reader) and confs.tech (no organiser field; needs event fields). Careerjet and Ticketmaster need free keys.

### 13.6 Events through the gateway (2026-11-01)

- **Event support:** mapping keys `attr.<name>` keep a source's own extra fields (an event's start/end date, city, country, online, call-for-papers) as stated; `organizationOptional` lets a source give no organiser rather than have one invented; `dropPastAfter: "endDate"` leaves out events that are over (not counted against quality); `extraUrls` (≤ 60, same host) make one source of a dataset split into files; `requestDelayMs` (250–5000) sets the pause between them. An event's date is never used as a posting date.
- **confs.tech** (MIT, `sources/confs-tech.json`): 52 topic files for 2026–2027. Dry run 2026-11-01: 52 read in 20 s, **157 upcoming conferences**, 100% valid (468 past and 70 cross-listed repeats dropped); 8 in India, 13 online-only. Collected daily.
- **For modules:** `server/gateway/listings.ts::gatewayListings(module, { query, places })` gives a module its active, unexpired gateway listings with their attributes and source names, in process. The Events module (its own session) decides how to show them.
- A collection pass stops starting new sources after 35 s; the rest stay due for the next pass.

### 13.7 Partner uploads (2026-11-01)

- **Who:** a partner that gave written permission (an association, a cooperative, a placement cell). Admin → Platform → WorksLake → Gateway → **Add a partner**: name, https website, module, the permission and where it's kept. People modules (Therapists, Co-founders, Services, Marketplace) also need the partner's confirmation that every person opted in.
- **The file:** CSV or JSON (array or `{ items }`), ≤2 MB, ≤5,000 rows, one template (**Download the template**): `id, title, organization, url, town, region, country, description, posted_at, organization_url`, plus any `attr_<name>` column kept as the listing's own field (e.g. `attr_starts_at` for an event). `title` and `url` (https) are required; `id` defaults to the url.
- **Upload:** **Upload list** on the partner's row in Sources. Rows are checked like any source's records; only an upload where ≥90% of rows read well replaces the partner's listings (repeats and past items aside). Otherwise nothing changes and the first five problems are shown. A partner refreshes its list by uploading again.
- **Serving:** registered paused; **Activate** after a good upload. Its listings flow into its module through the module's WorksLake gateway source like any other gateway listing. The scheduler never fetches an upload source.


### 13.8 Adding a reviewed source from the catalogue (2026-11-01)

The reviewed source files in `apps/data-gateway/sources/*.json` (confs.tech, OpenStreetMap Calendar, UK Teaching Vacancies, We Work Remotely) are listed on Platform → Sources → Partners & gateway → **Add from catalogue**. **Add** registers one paused (as `register.mjs` would, without handling the admin token); **Test & activate** on its row in Sources runs the gateway's test and turns it on when it passes. A module session that adds a source file also adds it to `server/gateway/catalogue.ts` (a test checks every file is listed). OpenStreetMap Calendar (osmcal.org) documents an integration API and robots allows it, but states no data licence: the owner confirms before activating.

