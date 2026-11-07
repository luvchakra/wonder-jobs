import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { crawlRecords, LONG_CRAWL_LIMITS, nextDelay, parseSitemap, readOrder } from "../src/crawl.mjs";
import { decoded, parseRobots, parseStructured, readBody, retryAfterMs } from "../src/collect.mjs";
import { validateSource } from "../src/core.mjs";

const base = { url: "https://jobs.example.org/sitemap.xml", kind: "crawl", discover: "sitemap", pathPrefix: "/jobs/", modules: ["teaching"], permission: "granted_in_writing", permissionEvidence: "Written permission from the site owner on file", termsReviewed: true, redistributionAllowed: true, robotsReviewed: true, maxPagesPerRun: 3 };
const job = (n) => `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Teacher " + n, hiringOrganization: { name: "School" }, jobLocation: { address: { addressLocality: "Pune" } }, description: "Teach " + n, datePosted: "2026-11-01", url: "https://jobs.example.org/jobs/" + n })}</script>`;
const H = "https://jobs.example.org/jobs/";

test("a sitemap's <lastmod> is read per URL, and a sitemap without <url> wrappers still lists its pages", () => {
  const xml = `<urlset><url><loc>${H}a</loc><lastmod>2026-11-01</lastmod></url><url><loc>${H}b</loc></url><url><loc>${H}c</loc><lastmod>2026-11-05T10:00:00Z</lastmod></url></urlset>`;
  const s = parseSitemap(xml);
  assert.deepEqual(s.urls, [H + "a", H + "b", H + "c"]);
  assert.equal(s.lastmod.get(H + "a"), Date.parse("2026-11-01"));
  assert.equal(s.lastmod.has(H + "b"), false);
  assert.deepEqual(parseSitemap(`<urlset><loc>${H}x</loc></urlset>`).urls, [H + "x"]);
});

test("pages new or changed since the watermark are read first, newest first; the rest carry on from the cursor", () => {
  const t = ["a", "b", "c", "d"].map((x) => H + x);
  const lm = new Map([[H + "a", 10], [H + "b", 50], [H + "c", 40], [H + "d", 5]]);
  assert.deepEqual(readOrder(t, lm, 20, 2), { order: [H + "b", H + "c", H + "d", H + "a"], fresh: 2 });
  assert.deepEqual(readOrder(t, lm, NaN, 1).order, [H + "b", H + "c", H + "d", H + "a"]);
  assert.deepEqual(readOrder(t, null, 20, 3).order, [H + "d", H + "a", H + "b", H + "c"]);
});

test("the wait between pages follows the site's answer time, never under its floor, and doubles (or obeys Retry-After) on 429", () => {
  assert.equal(nextDelay(1000, 1000, { latencyMs: 200 }), 1000);
  assert.equal(nextDelay(1000, 1000, { latencyMs: 3000 }), 2000);
  assert.equal(nextDelay(2000, 1000, { backoff: true }), 4000);
  assert.equal(nextDelay(2000, 1000, { backoff: true, retryAfterMs: 9000 }), 9000);
  assert.equal(nextDelay(20000, 1000, { backoff: true }), 30000);
  assert.equal(retryAfterMs("5"), 5000);
  assert.equal(retryAfterMs(new Date(Date.UTC(2026, 0, 1, 0, 0, 30)).toUTCString(), Date.UTC(2026, 0, 1)), 30000);
  assert.equal(retryAfterMs("soon"), null);
});

function site(pages, { lastmod = {}, fail = {} } = {}) {
  const calls = [];
  const sitemap = `<urlset>${pages.map((p) => `<url><loc>${H}${p}</loc>${lastmod[p] ? `<lastmod>${lastmod[p]}</lastmod>` : ""}</url>`).join("")}</urlset>`;
  let clock = 0;
  return {
    calls,
    deps: {
      robots: async () => parseRobots("User-agent: *\nAllow: /"),
      get: async (url) => {
        calls.push(url);
        if (url.endsWith("sitemap.xml")) return sitemap;
        const n = url.split("/").pop();
        if (fail[n]) { const e = new Error("busy"); e.upstream = fail[n]; e.retryAfterMs = 4000; throw e; }
        return job(n);
      },
      sleep: async (ms) => { clock += ms; calls.push("sleep:" + ms); },
      now: () => clock,
    },
  };
}

test("a crawl reads changed pages first and moves its watermark once all of them are read", async () => {
  const src = validateSource({ ...base, maxPagesPerRun: 2 });
  const s = site(["a", "b", "c", "d"], { lastmod: { a: "2026-11-01", b: "2026-11-06", c: "2026-11-02", d: "2026-11-07" } });
  const r = await crawlRecords({ ...src, crawlWatermark: "2026-11-03T00:00:00.000Z", crawlCursor: 0 }, s.deps);
  assert.deepEqual(s.calls.filter((c) => c.includes("/jobs/")), [H + "d", H + "b"]);
  assert.equal(r.crawl.fresh, 2);
  assert.equal(r.crawl.cursor, 0);
  assert.equal(r.crawl.watermark, new Date("2026-11-07").toISOString());
});

test("a long run (the runner) reads several times more pages; a short one keeps the serverless caps", async () => {
  const pages = Array.from({ length: 40 }, (_, i) => "p" + i);
  const src = validateSource({ ...base, maxPagesPerRun: 5 });
  const short = site(pages);
  assert.equal((await crawlRecords(src, { ...short.deps, budgetMs: 30_000 })).crawl.read, 5);
  const long = site(pages);
  assert.equal((await crawlRecords(src, { ...long.deps, budgetMs: 20 * 60_000 })).crawl.read, 5 * LONG_CRAWL_LIMITS.pageScale);
});

test("two 429s in a row slow the crawl down and end the run early", async () => {
  const src = validateSource({ ...base, maxPagesPerRun: 5 });
  const s = site(["a", "b", "c", "d"], { fail: { a: 429, b: 429 } });
  const r = await crawlRecords(src, s.deps);
  assert.equal(r.crawl.backedOff, true);
  assert.equal(r.crawl.read, 2);
  assert.ok(r.crawl.delayMs >= 4000);
});

test("a listing page's ItemList gives every listing on it", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "ItemList", itemListElement: [1, 2].map((i) => ({ "@type": "ListItem", position: i, item: { "@type": "JobPosting", title: "Role " + i, hiringOrganization: "Acme", url: "https://x.example/" + i } })) })}</script>`;
  assert.deepEqual(parseStructured(html).map((r) => r.title), ["Role 1", "Role 2"]);
});

test("a compressed response (gzip, brotli, or a .gz sitemap file) is read as text, within the size limit", async () => {
  const text = "<urlset>" + "x".repeat(5000) + "</urlset>";
  const res = (buf, enc) => Object.assign(Readable.from([buf]), { headers: enc ? { "content-encoding": enc } : {} });
  const read = (r, url, maxBytes = 1e6) => readBody(decoded(r, new URL(url)), { maxBytes, abort: () => {} });
  assert.equal(await read(res(gzipSync(text), "gzip"), "https://a.example/s.xml"), text);
  assert.equal(await read(res(brotliCompressSync(text), "br"), "https://a.example/s.xml"), text);
  assert.equal(await read(res(gzipSync(text)), "https://a.example/sitemap.xml.gz"), text);
  await assert.rejects(read(res(gzipSync(text), "gzip"), "https://a.example/s.xml", 100), /size limit/);
});
