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
