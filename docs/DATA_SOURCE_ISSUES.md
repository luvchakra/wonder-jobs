# Data import sources: issues, priorities and fixes

Checked 2026-11-05 (≈19:30 IST) against the live data:
- the gateway's 63 sources (`gateway_state`);
- the last 11 import runs (`wj.importruns`);
- 7 days of WorksLake run history (`jobslake_runs`);
- the GitHub Actions history of the scheduled collection.

Some failing sources were also fetched directly from here to reproduce the failure.

**Priority levels:**
- **P0:** most sources are affected, or no new listings arrive.
- **P1:** one source or one module is broken.
- **P2:** cleanup or a small loss.
- **P3:** watch it.

**Status:** **Fixed** (merged), **Fixing** (in the open PR), **Open**, or **Blocked on owner**.

## Summary

| # | Priority | Issue | Status | Who |
|---|---|---|---|---|
| 1 | P0 | The scheduled collection collects only 2–3 of ~15 due sources per run; most live sources are 1–3 days overdue | Fixing (WJ-725) | — |
| 2 | P0 | GitHub skips most of the 3-hourly scheduled triggers (about 3 a day happen, not 8) | Fixing (1 makes each trigger count); an extra trigger is optional | Owner (optional) |
| 3 | P1 | A source's Test fails for keyword APIs (Jooble: "responded 400") | Fixing (WJ-725) | — |
| 4 | P1 | Linked Events Helsinki failing since Nov 1 (INVALID_SOURCE) | Fixing (WJ-725) | — |
| 5 | P1 | We Work Remotely all-jobs feed: "Feed too large" | Fixed (#665); takes effect on its next collection | — |
| 6 | P1 | USAJOBS Test: "needs credentials" although keys were set | Fixed (#663) | Owner: press Test again |
| 7 | P1 | The gateway's WorksLake sources sometimes get "508 Loop Detected" during the Find refresh | Open: logging added (WJ-725); cause not yet confirmed | — |
| 8 | P2 | Houzz (10 sources) and WedMeGood (4) refuse our server | Blocked: the sites block us; can't fix | Owner: Dismiss |
| 9 | P2 | Duplicate gateway sources: Teaching Vacancies ×2, WedMeGood ×4, both pointing at the same URL | Open | Owner: Pause the extras |
| 10 | P2 | TheirStack: out of API credits on all 3 keys | Blocked on owner | Owner |
| 11 | P2 | Adzuna (Teaching, worldwide) answers 429 (rate limit) | Open: Teaching session | Teaching session |
| 12 | P2 | Hasgeek: Test found 0 listings; not live | Open: Events session | Events session |
| 13 | P2 | Old jobs.ac.uk sitemap source (disabled) still listed | Blocked on owner | Owner: Dismiss |
| 14 | P3 | Lever boards: an occasional 12 s timeout | Watch | — |
| 15 | P3 | Jobicy: one 400 in 78 runs | Watch | — |
| 16 | — | Keys not yet set (sources wait as "Needs setup") | Blocked on owner | Owner |

## Details

### 1. P0: the scheduled collection only reaches 2–3 sources a run (Fixing)

**What we saw:** every recent run collected 2–3 of the 14–17 sources that were due:
- "15 due · 2 collected · 1 failed" (11-05 11:29);
- "16 due · 2 collected" (11-04 23:31);
- "17 due · 1 collected" (11-04 20:01).

As a result, many live sources were last collected days ago:
- the 10 OpenStreetMap sources, KonfHub and Linux Foundation Events: Nov 2;
- TeachAway and apna.co (internships): Nov 1;
- HackerEarth, District and osmcal: Nov 2–3.

This is the main reason few new listings arrive despite many new sources.

**Root cause:** one call has 60 s on Vercel. Collection gets 25 s of it, so the Find refresh and the run's record still fit. Each source needs 8–20 s (crawl delays, several pages), so a call reaches only 2–3. The rest were marked "deferred" and waited for the next trigger, which was hours away.

**Fix (WJ-725):** when a call runs out of time with sources still due, it starts the next call and returns. The chain carries on until nothing is due, or for at most 20 calls.
- A chain is recorded as one run on Sources → Import ("N collected over K calls") and sends one email.
- Each call keeps the 60 s limit and the per-source 6-hour floor (`domain/gateway/budget.ts`), so a source is still never collected more often than that.

### 2. P0: GitHub skips most scheduled triggers (Fixing; an extra trigger is optional)

**What we saw:** `gateway-collect.yml` is set to run every 3 hours (8 a day), but GitHub ran it only about 3 times a day:
- Nov 4: 01:38, 11:32, 20:00;
- Nov 5: 01:46, 11:28.

Vercel's daily cron at 23:00 UTC is the only other trigger. GitHub documents that scheduled runs may be delayed or dropped under load.

**Fix:** with #1, every trigger that does fire collects everything that is due, so 3–4 triggers a day cover each source's 6-hour floor most of the time.

**Optional, on you:** to make it reliable, add a free external scheduler that calls the collection every 3 hours:
- **Address:** `https://jobs.wonderapps.biz/api/cron/gateway-collect`.
- **Header:** `Authorization: Bearer <CRON_SECRET>`.
- **Example service:** cron-job.org.

Only you can do this, because it needs the CRON_SECRET value. Calls that arrive close together are safe: a call right after another does nothing.

### 3. P1: Test fails for keyword APIs (Fixing)

**What we saw:** Jooble's Test failed with "jooble.org responded 400", although its key works.

**Root cause:** a source's Test searched with no words. Jooble, and any API that requires keywords, refuses an empty search. Real searches always send words, so searches were fine.

**Fix (WJ-725):** Test still tries no words first, so sources that passed behave exactly as before. If that fails or finds nothing, it tries once more with a plain word for the module ("engineer" for Jobs, "teacher" for Teaching, and so on: `core.ts::TEST_QUERY`). Gateway-fed sources are still tested with no words.

### 4. P1: Linked Events Helsinki failing since Nov 1 (Fixing)

**What we saw:**
- `INVALID_SOURCE` on every run since 11-01; its last success was 11-01 18:27.
- Fetched directly from here, the API answers fine and gives 1,271 valid events.
- Its saved place in the list was "page 10" of a list that starts *today*. That list shrinks as days pass, and a page past the end answers 404.

**Root cause (likely):** the source reads a few pages per run and carries on from the saved page next time. When the saved page no longer exists (or answers with something that isn't the list), the run failed, and kept failing, because the saved page never changed.

**Fix (WJ-725):** a run whose saved page fails starts again from page one, once. This applies to every paged API, not just Helsinki (`collect.mjs::pagedRecords`, tested).

### 5. P1: We Work Remotely "Feed too large" (Fixed, #665)

The gateway now reads any RSS/Atom feed up to its 2 MB limit and keeps every complete item, instead of refusing the whole feed. The all-jobs source recovers on its next collection. Its listings overlap the 11 category feeds; WorksLake stores each job once.

### 6. P1: USAJOBS "needs credentials" (Fixed, #663)

A source's Test now reads the keys set on Admin → Keys first.

**On you:** press **Test again** on USAJOBS.

### 7. P1: "508 Loop Detected" on the gateway's WorksLake sources (Open)

**What we saw:** 2–4 of the 12–27 runs of each `works_gateway_<module>` source in 7 days failed with "The source responded 508". They clustered at the Find refresh after an import: 11-05 06:13 hit every module, 11:29 hit Teaching.

**What we know:**
- These sources read the gateway inside this app. The call should be answered in-process (`safeFetch.ts::inProcessGateway`), never over HTTP.
- The settings (`WORKSLAKE_GATEWAY_URL` = `https://jobs.wonderapps.biz`, gateway tokens set) make that path apply.
- A 508 means a call did go over HTTP to the app itself. Why isn't confirmed yet: Vercel keeps logs for only an hour, and these happened earlier.

**Done (WJ-725):** the next 508 logs where the call went, and a missing gateway configuration is logged. Once it shows up in the logs, the cause can be fixed.

**Impact:** that module's refresh misses the gateway's new listings until the next one.

### 8. P2: Houzz and WedMeGood refuse our server (Blocked: can't fix)

**What we saw:**
- The one enabled Houzz source fails with "Robots.txt didn't load" (the site blocks our server).
- 9 more Houzz category sources and 4 WedMeGood sources were never activated, for the same reason.

We never get past an IP block (our rule), so there's nothing to fix in code. These move to **Archived** on their own after 3 failed tries (WJ-721).

**On you:** press **Dismiss** on them on Sources → Import to clear them now.

### 9. P2: duplicate gateway sources (Open; on you)

| Source | Copies | Note |
|---|---|---|
| Teaching Vacancies (DfE, UK) | 2 | Same API URL. One holds 824 listings, the other 100; each is collected separately. |
| WedMeGood | 4 | Same homepage; all blocked anyway (see 8). |
| apna.co | 2 | One for Jobs and one for Internships: different modules, so **not** a duplicate. |

**On you:** on Sources → Import → Teaching, open Details on the Teaching Vacancies row that holds 100 listings and press **Pause**. A guard against adding the same URL twice for the same module is a small follow-up.

### 10. P2: TheirStack out of credits (Blocked on owner)

"TheirStack: out of API credits on all 3 key(s)" on 11-04.

**On you:** top up the credits, add a new key on Admin → Keys, or pause the source. It's an On-search source, so searches simply skip it until then.

### 11. P2: Adzuna 429 for Teaching (Open: Teaching session)

`teach_adzuna_world`: 3 of 5 runs answered 429, Adzuna's rate limit. It probably asks too many countries in one search. Fewer countries per search, or a pause between calls, should fix it. This goes to the Teaching session.

### 12. P2: Hasgeek found 0 (Open: Events session)

Its last Test reached the site but found no listings in the format the gateway reads, so it isn't live. The Events session owns its catalogue entry.

### 13. P2: old jobs.ac.uk sitemap source (Blocked on owner)

It's disabled; the new search-page source is live and healthy.

**On you:** **Dismiss** the old one on Sources → Import → Teaching.

### 14–15. P3: occasional timeouts

- Lever: 3 timeouts in 42 runs.
- Jobicy: one 400 in 78 runs.

No action unless they grow.

### 16. Keys not yet set (Blocked on owner)

Each of these appears on Admin → Keys and waits as "Needs setup" until its key is set:

| Key | Module |
|---|---|
| ReliefWeb app name | Jobs |
| Find an apprenticeship key | Jobs/Internships |
| OpenAgenda key | Events |
| Flipkart affiliate id + token | Marketplace |
| eBay client id + secret | Marketplace |
| Simpler.Grants key | Scholarships |
| clist key | Events |
| CQC / NHS keys | Therapists |

## What's blocking on you

1. **Press Test again on USAJOBS** (#6).
2. **Dismiss** the Houzz, WedMeGood and old jobs.ac.uk rows (#8, #13). They also archive on their own after 3 failures.
3. **Pause** the duplicate Teaching Vacancies source with 100 listings (#9).
4. **TheirStack**: top up, replace the key, or pause (#10).
5. **Keys** in #16, whenever you want those sources.
6. *Optional:* an external scheduler every 3 hours for reliable collection (#2).

## Further work noted

- Guard against adding a gateway source whose URL a source in the same module already uses (#9).
- Find the 508's cause from the new log line (#7).
- Teaching: Adzuna fan-out (#11). Events: Hasgeek (#12).
