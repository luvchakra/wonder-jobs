import { test } from "node:test";
import assert from "node:assert/strict";
import { crawlRecords, crawlTargets, pageLinks, parseSitemap } from "../src/crawl.mjs";
import { parseRobots } from "../src/collect.mjs";
import { validateSource } from "../src/core.mjs";

const job = (n) => `<html><script type="application/ld+json">{"@type":"JobPosting","title":"Teacher ${n}","hiringOrganization":{"name":"School ${n}"},"datePosted":"2026-10-30","jobLocation":{"address":{"addressLocality":"Pune"}}}</script></html>`;
const base = { url: "https://jobs.example.org/sitemap.xml", kind: "crawl", discover: "sitemap", pathPrefix: "/jobs/", modules: ["teaching"], permission: "granted_in_writing", permissionEvidence: "Written permission from the site owner on file", termsReviewed: true, redistributionAllowed: true, robotsReviewed: true, maxPagesPerRun: 3 };

function site(pages, extra = {}) {
  const calls = [];
  const sitemap = `<urlset>${pages.map((p) => `<url><loc>https://jobs.example.org${p}</loc></url>`).join("")}<url><loc>https://other.example.com/jobs/x</loc></url></urlset>`;
  const files = { "https://jobs.example.org/sitemap.xml": sitemap, ...extra };
  return {
    calls,
    deps: {
      robots: async () => parseRobots("User-agent: *\nDisallow: /jobs/private\nCrawl-delay: 2"),
      get: async (url) => { calls.push(url); if (files[url]) return files[url]; const n = url.split("/").pop(); return job(n); },
      sleep: async (ms) => { calls.push("sleep:" + ms); },
      now: () => 0,
    },
  };
}

test("a crawl validates only with discovery, a path and a robots review", () => {
  assert.throws(() => validateSource({ ...base, robotsReviewed: false }), /Robots review/);
  assert.throws(() => validateSource({ ...base, discover: "everything" }), /discover/);
  assert.throws(() => validateSource({ ...base, maxPagesPerRun: 500 }), /maxPagesPerRun/);
  assert.throws(() => validateSource({ ...base, crawlDelayMs: 10 }), /crawlDelayMs/);
  const ok = validateSource(base);
  assert.equal(ok.kind, "crawl");
  assert.equal(ok.pathPrefix, "/jobs/");
  assert.equal(ok.enabled, false, "starts paused");
});

test("targets stay on the source's host, under its path, allowed by robots, once each", () => {
  const rules = parseRobots("User-agent: *\nDisallow: /jobs/private").rules;
  const got = crawlTargets(["https://jobs.example.org/jobs/1", "https://jobs.example.org/jobs/1#top", "http://jobs.example.org/jobs/2", "https://jobs.example.org/about", "https://jobs.example.org/jobs/private/3", "https://evil.example.com/jobs/4", "https://jobs.example.org:8443/jobs/5"], base, rules);
  assert.deepEqual(got, ["https://jobs.example.org/jobs/1"]);
});

test("a run reads its share politely and the next run carries on", async () => {
  const s = site(["/jobs/1", "/jobs/2", "/jobs/3", "/jobs/4", "/jobs/5", "/jobs/private/9"]);
  const src = validateSource(base);
  const first = await crawlRecords(src, s.deps);
  assert.equal(first.crawl.pages, 5, "the private path and the other host are left out");
  assert.equal(first.crawl.read, 3);
  assert.equal(first.crawl.delayMs, 2000, "robots' Crawl-delay is longer than the source's, so it wins");
  assert.ok(s.calls.filter((c) => c === "sleep:2000").length >= 3, "it waits before every page");
  assert.equal(first.valid, 3);
  assert.equal(first.merge, true);
  assert.ok(!s.calls.some((c) => String(c).includes("other.example.com") || String(c).includes("private")));
  const second = await crawlRecords({ ...src, crawlCursor: first.crawl.cursor }, s.deps);
  const titles = second.results.map((r) => r.title).sort();
  assert.deepEqual(titles, ["Teacher 1", "Teacher 4", "Teacher 5"], "carries on, then wraps round");
  assert.equal(second.results[0].canonicalUrl.startsWith("https://jobs.example.org/jobs/"), true, "a record without a URL takes its page's");
});

test("a sitemap index is followed on the same host only", async () => {
  const index = "<sitemapindex><sitemap><loc>https://jobs.example.org/sm-1.xml</loc></sitemap><sitemap><loc>https://evil.example.com/sm.xml</loc></sitemap></sitemapindex>";
  const child = "<urlset><url><loc>https://jobs.example.org/jobs/7</loc></url></urlset>";
  const s = site([], { "https://jobs.example.org/sitemap.xml": index, "https://jobs.example.org/sm-1.xml": child });
  const r = await crawlRecords(validateSource(base), s.deps);
  assert.equal(r.crawl.pages, 1);
  assert.equal(r.results[0].title, "Teacher 7");
  assert.ok(!s.calls.includes("https://evil.example.com/sm.xml"));
});

test("an index page's links can be the way in", async () => {
  const s = site([], { "https://jobs.example.org/careers": '<a href="/jobs/11">a</a><a href="https://jobs.example.org/jobs/12#x">b</a><a href="mailto:x@y.z">c</a>' });
  const r = await crawlRecords(validateSource({ ...base, url: "https://jobs.example.org/careers", discover: "links" }), s.deps);
  assert.equal(r.crawl.pages, 2);
  assert.deepEqual(pageLinks('<a href="/a">x</a>', "https://h.example.org/b/"), ["https://h.example.org/a"]);
  assert.deepEqual(parseSitemap("<urlset><url><loc>https://h.example.org/a?b=1&amp;c=2</loc></url></urlset>").urls, ["https://h.example.org/a?b=1&c=2"]);
});

test("a run stops before its time is up", async () => {
  let t = 0;
  const s = site(["/jobs/1", "/jobs/2", "/jobs/3"]);
  const r = await crawlRecords(validateSource({ ...base, maxPagesPerRun: 3 }), { ...s.deps, now: () => t, sleep: async (ms) => { t += ms + 20000; } , budgetMs: 45000 });
  assert.ok(r.crawl.read < 3, "fewer pages than allowed when the budget runs out");
});

const event = (n, extra = "") => `<html><script type="application/ld+json">{"@type":"Event","name":"Conf ${n}","organizer":{"name":"Org ${n}"},"startDate":"2026-12-03","endDate":"2026-12-04","eventAttendanceMode":"https://schema.org/MixedEventAttendanceMode","location":[{"@type":"VirtualLocation","url":"https://x.example"},{"@type":"Place","name":"Hall","address":{"addressLocality":"Bengaluru"}}]${extra}}</script></html>`;
const events = { url: "https://events.example.org/", kind: "crawl", discover: "sitemap", sitemap: "https://files.example-cdn.org/sitemap.xml", pathPattern: "/*/", modules: ["events"], permission: "terms_permit", permissionEvidence: "Terms pending: robots allows crawling", termsReviewed: true, redistributionAllowed: true, robotsReviewed: true, organizationOptional: true, maxPagesPerRun: 5 };

function eventSite(robots) {
  const calls = [];
  const sitemap = `<urlset>${["/conf-a/", "/conf-b/", "/conf-a/schedule/", "/about/team"].map((p) => `<url><loc>https://events.example.org${p}</loc></url>`).join("")}</urlset>`;
  return {
    calls,
    deps: {
      robots: async () => parseRobots(robots),
      get: async (url, opts) => { calls.push([url, opts?.origin]); if (url === events.sitemap) return sitemap; if (url.endsWith("/conf-b/")) return event("b", ',"eventStatus":"https://schema.org/EventCancelled"'); return event("a"); },
      sleep: async () => {},
      now: () => 0,
    },
  };
}

test("an event crawl keeps the event's dates, online and cancelled, and reads only pages matching its pattern", async () => {
  const { calls, deps } = eventSite("User-agent: *\nAllow: /\nSitemap: https://files.example-cdn.org/sitemap.xml");
  const r = await crawlRecords(validateSource(events), deps);
  assert.deepEqual(calls.slice(1).map((c) => c[0]), ["https://events.example.org/conf-a/", "https://events.example.org/conf-b/"], "subpages and other paths are skipped");
  assert.equal(calls[0][1], "files.example-cdn.org", "the sitemap is read from its own host only");
  const byTitle = Object.fromEntries(r.results.map((i) => [i.title, i]));
  assert.deepEqual(byTitle["Conf a"].attributes, { startDate: "2026-12-03", endDate: "2026-12-04", online: true });
  assert.equal(byTitle["Conf a"].location, "Bengaluru");
  assert.equal(byTitle["Conf b"].attributes.cancelled, true);
});

test("a sitemap on another host is refused unless the site's robots.txt lists it", async () => {
  const { calls, deps } = eventSite("User-agent: *\nAllow: /");
  await assert.rejects(crawlRecords(validateSource(events), deps), /robots\.txt doesn't list it/);
  assert.equal(calls.length, 0, "nothing is fetched");
  assert.throws(() => validateSource({ ...events, discover: "links" }), /needs discover: sitemap/);
  assert.throws(() => validateSource({ ...events, sitemap: "http://files.example-cdn.org/s.xml" }), /HTTPS/);
  assert.throws(() => validateSource({ ...events, pathPattern: "events/*" }), /pathPattern/);
});

test("pathMatcher: * is one segment, ** is anything", async () => {
  const { pathMatcher } = await import("../src/crawl.mjs");
  assert.ok(pathMatcher("/*/").test("/kubecon/"));
  assert.ok(!pathMatcher("/*/").test("/kubecon/program/"));
  assert.ok(pathMatcher("/e/**").test("/e/a/b"));
});
