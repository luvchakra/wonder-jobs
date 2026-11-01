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
| Therapists · "counselling" | 1 result | Only WonderWorks' own practitioners exist; no outside source by design. |
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
| **Jobs** | 16 outside (15 free, 1 paid) plus WonderWorks employers; 5 partner portals not in use | Yes (15) | TheirStack (paid); LinkedIn, Indeed, Naukri, foundit, TimesJobs (agreement) | Credentials on production unverified; partner portals not started |
| **Internships** | 11 outside | Yes (all 11; 3 need a free key) | none | Same credentials; quality of "internship" detection varies by source |
| **Teaching** | 3 | Yes | none | No live-vacancy feed for Indian schools; coverage thin |
| **Talent & Services** | 1 | Yes | none | Nothing else is open; supply must come from WonderWorks pros |
| **Therapists** | 0 | — | — | Deliberately none: licence verification and health-data rules first |
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
| SmartRecruiters career sites | ATS | official public API | **Live** · responds | Swiggy, Freshworks, Bosch, Continental, Delivery Hero |
| JazzHR career sites | ATS | public feeds | **Live** | HackerEarth, Ebizon, ProcDNA and more |
| The Muse | aggregator | public API | **Live** · responds | Key env `THEMUSE_API_KEY` is read; check whether it is required or only raises limits |
| Jobicy | aggregator | public API | **Live** · responds | Salary where disclosed |
| Remote OK | aggregator | public API | **Live** · responds | Latest 100 per search |
| Himalayas | aggregator | public API | **Live** · responds | Newest postings scanned |
| Himalayas part-time | aggregator | public API | **Live** | Part Time mode |
| Freelancer.com gigs | aggregator | public API | **Live** · responds | Gig mode; client not named publicly |
| Remotive | aggregator | public API | **Off by default** · responds | Public feed exposes only a handful of listings |
| Arbeitnow | aggregator | public API | **Off by default** · responds | Europe-focused |
| Adzuna India | aggregator | official API, free tier | **Needs key** | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` |
| Adzuna India part-time | aggregator | same keys | **Needs key** | Part Time mode |
| TheirStack | aggregator | **licensed, paid per job** | **Needs key** | `THEIRSTACK`; asked only when free sources fall short |
| LinkedIn, Indeed, Naukri, foundit, TimesJobs | portals | partner API | **Do not use** | None has an open search API; see `docs/PARTNER_INTEGRATIONS.md` for who to contact and what to ask |

### Options not built

| Option | Open/paid | Verdict |
|---|---|---|
| Hacker News "Who is hiring" via Algolia API | Open | Researched. Free, no key; posts hold contact emails (personal data) and terms are unclear. Low value for India. |
| USAJOBS (all federal jobs) | Open, key | Already used for Internships only; Jobs would add US federal roles. |
| Jooble | Free key | Already used for Internships and Teaching; not in Jobs. Worth adding for India coverage if terms allow (check). |
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
| Company career sites (Greenhouse, Lever, Ashby) | public API | **Live** · responds | Internship-titled roles only |
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

**Not available (no open API):** Internshala, LinkedIn, the AICTE and NATS internship portals. Their stipend and duration cannot be read.

**Open issues**
1. **Detection.** "Is this an internship?" relies on the source's flag or the title; sources that don't flag it miss roles and some include false matches.
2. **Stipend and duration are often not stated** by outside postings; the app says "not stated" rather than guessing.
3. **India coverage** rests on Adzuna and Jooble, both key-gated and unverified in production.
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
| Germany BA Jobsuche | Unofficial, undocumented terms | Not built: no documented reuse rights. |
| France Travail "Offres d'emploi" | Key + signed licence, attribution | Deferred: needs the owner to accept the licence. |
| jobs.ac.uk (higher education) | Feeds exist, no explicit reuse permission | Not built; ask them for written permission. |
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
| Freelancer.com experts | public directory API | **Live** · responds | Remote freelancers; public profiles only |

**Researched**

| Option | Open/paid | Verdict |
|---|---|---|
| Upwork | Partner-only (per a data vendor; RSS closed 2024) | Rejected unless a partnership is agreed. |
| Fiverr, Toptal | No public API found | Rejected. |
| Scraping services for freelancer sites (Apify and similar) | Paid per result | Rejected: terms-of-service risk, and our rule is no scraping. |

**Open issues**
1. **Was returning nothing at all** — fixed 2026-10-31 (see §0). It now returns the Freelancer.com pros for a search. **Nothing else is open**, so supply for local services must come from pros listing on WonderWorks.
2. **Freelancer.com data is remote work only.** Client details need OAuth and are not used.
3. **Ratings:** the Freelancer.com feed carries its own rating where it gives one; WonderWorks' reviews are separate and are not mixed with it.

---

## 7. Therapists

Dataset `therapists`. WonderWorks practitioners only (`server/therapists/sources.ts`).

**Researched**

| Option | Open/paid | Verdict |
|---|---|---|
| India registries: RCI Central Rehabilitation Register (clinical psychologists), NMC Indian Medical Register (psychiatrists) | Public lookups, no open API or download found | Not importable. Counsellors are on no statutory register. A national database project (SocialCops with the Live Love Laugh Foundation) was described; whether it is public is unconfirmed. |
| US NPI Registry (NPPES) | Open, free API, 2,100-result cap | US only; not useful for India. |
| Commercial directories (TherapyRoute: about 1,200 India listings) | Private | Rejected: unverified, not licensed. |

**Open issues**
1. **By design, no outside listings.** Importing health professionals needs licence verification, consent and the health-data compliance the platform doc requires.
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

Dataset `events`. Sources: WonderWorks events (`server/events/sources.ts`), the gateway's events (`works_gateway_events`: confs.tech today), developers.events, OpenStreetMap Calendar, and Ticketmaster (below). The same event from two sources is listed once (title and start day). An outside event shows only what its source states, never a seat, an RSVP or an organiser the source didn't give, and links to the event's own page (`server/events/outside.ts`).

**In the code**

| Source | Status | Notes |
|---|---|---|
| WonderWorks events | **Live** | Organisers' own events, with seats and RSVP. |
| confs.tech (via the gateway, `apps/data-gateway/sources/confs-tech.json`) | **Live** once the owner activates `works_gateway_events` | MIT. About 157 upcoming tech conferences worldwide, 8 in India. |
| **Ticketmaster Discovery API** (`evt_ticketmaster`, `server/events/ticketmaster.ts`) | **Needs key** | Env `TICKETMASTER_API_KEY`, free at developer.ticketmaster.com (5,000 calls a day, 5 a second). Concerts, sport, theatre and family events in the countries Ticketmaster sells in; India coverage is thin. Terms read 2026-11-01: one call per person's search (never crawled in the background); content kept only "for reasonable periods" and removed within 24 hours on the owner's request; each event links to its own Ticketmaster page. The owner should confirm WorksLake's search-cache period (up to 24 hours) is a "reasonable period" before turning it on. |
| **OpenStreetMap Calendar** (`evt_osm_calendar`, `server/events/osmCalendar.ts`) | **Paused: terms pending**, no key | Public JSON API at `osmcal.org/api/v2/events/` (robots.txt allows it; the site documents it for sites that show its events). Read directly, once every 6 hours. 116 upcoming mapping events worldwide on 2026-11-01 (6 in India); a cancelled event is left out. Terms to confirm: the site documents a public API for showing its events but states no data licence. Replaces the gateway definition `osm-calendar.json`, which was removed so the events are not listed twice. |
| **developers.events** (`evt_developers_events`, `server/events/developersEvents.ts`) | **Paused: terms pending**, no key | The maintainers' public `all-events.json` (README: "all the data … available publicly in JSON"; robots.txt allows it). Read directly, once every 12 hours (3.6 MB, mostly past events, dropped before it is kept; over the gateway's 2 MB limit). 797 upcoming developer conferences on 2026-11-01, 23 in India, 41 online, with each event's own page and call for papers. Only entries it marks open or virtualized are shown; cancelled, postponed and delayed ones are not. Terms to confirm: the list is published as public JSON but has no licence file (ask the maintainers, scraly/developers-conferences-agenda). |

**Researched, not built** (owner, 2026-11-01: any genuine public feed or page is fine unless its robots.txt or terms forbid automated access; never harvest private people's profiles)

| Option | Open/paid | Verdict |
|---|---|---|
| KonfHub (konfhub.com) and the Linux Foundation events site | robots.txt allows crawling; each event page carries schema.org Event JSON-LD | **Worth adding once the gateway's `crawl` kind keeps an Event's start/end/online/cancelled fields as attributes** (today only JSON sources keep them) and can be limited to event pages. KonfHub is India-heavy. Not built: needs a gateway change. |
| Devpost hackathons (`devpost.com/api/hackathons`) | Public JSON, robots allows all | Dates are display text ("Dec 19, 2026 - Jan 18, 2027") and its terms were not read. Not built. |
| Paris "Que faire à Paris" (ODbL), Brisbane City Council "What's On" (CC BY 4.0), Melbourne events (open data) | Open licences, no key | Not reachable from the build environment (connections reset), so their payloads could not be read or the mapping tested. Worth testing from the gateway's admin (it runs from Vercel). |
| NYC Parks events (Socrata) | Open | Stale: the newest event is from 2019. Rejected. |
| Wikidata events | CC0 | Thin (about 6 upcoming conferences). Not worth a source. |
| Skiddle (UK), Eventfinda (NZ), SeatGeek (US) | Free keys, terms not read | Regional; no India value. Not built. |
| Eventbrite, Meetup | No public search (Eventbrite) / Pro only (Meetup) | Not used. |
| Vihaya, AllEvents, Insider and similar | Their own products | Not data sources; scraping them is not allowed. |

**Open issues**
1. **No India-strong open events feed** beyond confs.tech and OSM Calendar's few.
2. **Imported events carry no capacity or price we control**: RSVP is only for events posted on WonderWorks; outside ones link out.
3. **Minors:** the platform doc marks Events as sensitive for minors; age rules must come from the source.

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
| OpenStreetMap | Services/Marketplace | Open licence, but places mapped by others are not providers who opted in. Not for Services. |
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

