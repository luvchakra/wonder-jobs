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

const pro = (n) => `<html><script type="application/ld+json">{"@context":"https://schema.org","@type":"HomeAndConstructionBusiness","@id":"https://www.houzz.in/professionals/interior-designers/studio-${n}-pf~${n}","name":"Studio ${n}","url":"https://www.houzz.in/professionals/interior-designers/studio-${n}-pf~${n}","description":"Interiors for homes","telephone":"+91 98000 00000","email":"a@b.in","image":"https://x/y.jpg","address":{"streetAddress":"12 MG Road","addressLocality":"Pune","addressRegion":"Maharashtra","postalCode":"411001","addressCountry":"IN"},"aggregateRating":{"ratingValue":"4.8","reviewCount":"23"},"geo":{"latitude":"18.52","longitude":"73.85"},"areaServed":{"name":"Pune"},"hasOfferCatalog":{"name":"3D Rendering, Bathroom Design"},"sameAs":["http://old.example","https://studio${n}.in/?utm_source=houzz&x=1"]}</script></html>`;

test("a business page keeps what it says about itself, never its phone, email, street or postcode", async () => {
  const { businessRecord, parseStructured } = await import("../src/collect.mjs");
  const [r] = parseStructured(pro(7));
  assert.equal(r.title, "Studio 7");
  assert.equal(r.organization, "Studio 7");
  assert.equal(r.location, "Pune, Maharashtra");
  assert.deepEqual(r.attributes, { lat: 18.52, lon: 73.85, rating: 4.8, reviews: 23, areaServed: "Pune", services: "3D Rendering, Bathroom Design", website: "https://studio7.in/?x=1" });
  const all = JSON.stringify(r);
  for (const leak of ["98000", "a@b.in", "MG Road", "411001", "y.jpg"]) assert.ok(!all.includes(leak), leak);
  assert.equal(businessRecord({ name: "X", url: "https://x.in", geo: { latitude: "999", longitude: "1" } }).attributes.lat, undefined, "impossible coordinates dropped");
});

test("a links crawl pools the links of its extra index pages, same host and robots only", async () => {
  const dir = "https://www.houzz.in/professionals/interior-designers/probr0-bo~t_1";
  const src = { url: dir, kind: "crawl", discover: "links", pathPrefix: "/professionals/interior-designers/", extraUrls: [dir + "?fi=15", "https://evil.example/x"], modules: ["services"], permission: "terms_permit", permissionEvidence: "Terms pending: Houzz terms of use", termsReviewed: true, redistributionAllowed: true, robotsReviewed: true, publicBusinesses: true, maxPagesPerRun: 5 };
  assert.throws(() => validateSource(src), /HTTPS on the source's own host/);
  const ok = validateSource({ ...src, extraUrls: [dir + "?fi=15"] });
  const link = (n) => `<a href="/professionals/interior-designers/studio-${n}-pf~${n}">x</a>`;
  const calls = [];
  const r = await crawlRecords(ok, {
    robots: async () => parseRobots("User-agent: *\nDisallow: /professionals/s/"),
    get: async (url) => { calls.push(url); if (url === dir) return link(1) + link(2); if (url === dir + "?fi=15") return link(3); return pro(url.split("~").pop()); },
    sleep: async () => {},
    now: () => 0,
  });
  assert.equal(r.crawl.pages, 3, "links from both index pages");
  assert.deepEqual(r.results.map((x) => x.title).sort(), ["Studio 1", "Studio 2", "Studio 3"]);
  assert.ok(calls.includes(dir + "?fi=15"));
});

test("a business keeps its page's breadcrumb trail (without Home), not the site's own Organization block", async () => {
  const { parseStructured } = await import("../src/collect.mjs");
  const page = `<html>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"The Site","email":"info@site.in","telephone":"+91-1"}]}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","url":"https://site.in/profile/Makeovers-9","name":"The Makeovers","address":{"@type":"PostalAddress","addressLocality":"Bandra, Mumbai","streetAddress":"1 Road"},"aggregateRating":{"ratingValue":"5","reviewCount":4}}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home"},{"@type":"ListItem","position":2,"name":"Vendors"},{"@type":"ListItem","position":3,"name":"Bridal Makeup  Artists "},{"@type":"ListItem","position":4,"item":{"name":"Bridal Makeup Artists Mumbai"}}]}</script></html>`;
  const recs = parseStructured(page);
  assert.equal(recs.length, 1, "the site's Organization is not a record");
  assert.equal(recs[0].title, "The Makeovers");
  assert.equal(recs[0].attributes.breadcrumb, "Vendors > Bridal Makeup Artists > Bridal Makeup Artists Mumbai");
  const all = JSON.stringify(recs);
  for (const leak of ["info@site.in", "+91-1", "1 Road"]) assert.ok(!all.includes(leak), leak);
  assert.equal(parseStructured(page.replace(/BreadcrumbList/, "Thing"))[0].attributes.breadcrumb, undefined, "no trail, no attribute");
});

test("a sitemap source reads a big sitemap (up to 12 MB) while pages keep the default cap", async () => {
  const asked = [];
  const src = validateSource({ url: "https://site.in/", kind: "crawl", discover: "sitemap", sitemap: "https://site.in/sitemaps/profiles.xml", pathPrefix: "/profile/", pathPattern: "/profile/*", modules: ["services"], permission: "terms_permit", permissionEvidence: "terms pending: x", termsReviewed: true, redistributionAllowed: true, robotsReviewed: true, publicBusinesses: true, maxPagesPerRun: 1 });
  const get = async (u, o) => { asked.push([u, o?.maxBytes]); return u.endsWith(".xml") ? `<urlset><url><loc>https://site.in/profile/A-1</loc></url></urlset>` : `<html></html>`; };
  await crawlRecords(src, { get, robots: async () => ({ rules: [], crawlDelay: null, sitemaps: [] }), sleep: async () => {}, now: () => 0 }).catch(() => {});
  assert.deepEqual(asked[0], ["https://site.in/sitemaps/profiles.xml", 12_000_000]);
  assert.equal(asked[1]?.[1], undefined, "a page is read with the default cap");
});

test("a sitemap index may list child sitemaps on another host of the same site; http children are read over https", async () => {
  const { childSitemaps, siteOf } = await import("../src/crawl.mjs");
  assert.equal(siteOf("crawlsitemap-v2.workindia.in"), "workindia.in");
  assert.equal(siteOf("www.bbc.co.uk"), "bbc.co.uk");
  const got = childSitemaps(["http://crawlsitemap-v2.workindia.in/jobs-1.xml", "https://crawlsitemap-v2.workindia.in/jobs-1.xml", "https://evil.example.com/s.xml", "http://crawlsitemap.workindia.in:8080/x.xml"], "https://crawlsitemap.workindia.in/sitemap.xml", "www.workindia.in", []);
  assert.deepEqual(got, ["https://crawlsitemap-v2.workindia.in/jobs-1.xml"]);
});

test("sitemapOrder newest reads the last children of a sitemap index (dated sitemaps), newest first", async () => {
  const dated = Array.from({ length: 9 }, (_, i) => `https://events.example.org/sitemap-2026-10-2${i}.xml`);
  const index = `<sitemapindex>${dated.map((u) => `<sitemap><loc>${u}</loc></sitemap>`).join("")}</sitemapindex>`;
  const src = { url: "https://events.example.org/sitemap.xml", kind: "crawl", discover: "sitemap", sitemapOrder: "newest", pathPrefix: "/e/", modules: ["events"], permission: "terms_permit", permissionEvidence: "Terms pending: reuse terms", termsReviewed: true, redistributionAllowed: true, robotsReviewed: true, organizationOptional: true, maxPagesPerRun: 1 };
  assert.throws(() => validateSource({ ...src, sitemapOrder: "random" }), /sitemapOrder/);
  const read = [];
  await crawlRecords(validateSource(src), {
    robots: async () => parseRobots("User-agent: *\nAllow: /"),
    get: async (url) => { read.push(url); if (url === src.url) return index; if (url.includes("sitemap-")) return `<urlset><url><loc>https://events.example.org/e/${url.slice(-6, -4)}</loc></url></urlset>`; return "<html></html>"; },
    sleep: async () => {},
    now: () => 0,
  });
  assert.deepEqual(read.filter((u) => u.includes("sitemap-")), dated.slice(-5).reverse());
});
