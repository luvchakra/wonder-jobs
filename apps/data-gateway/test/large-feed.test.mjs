import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { fetchRecords, parseFeed, readBody } from "../src/collect.mjs";

// A feed bigger than the gateway's 2 MB read is cut at the limit, not refused (2026-11-05: We Work Remotely's all-jobs
// feed failed as "Feed too large"): its newest items come first, and the item the cut lands in is left out.
const item = (i) => `<item><guid>job-${i}</guid><title>Acme: Engineer ${i}</title><link>https://example.com/jobs/${i}</link><description>${"x".repeat(200)}</description><pubDate>Wed, 05 Nov 2026 10:00:00 GMT</pubDate></item>`;

test("a feed past the limit is read up to it, keeping only whole items", async () => {
  const res = new PassThrough();
  let aborted = false;
  const body = readBody(res, { maxBytes: 1000, partial: true, abort: () => { aborted = true; } });
  res.write("<rss><channel>" + item(1) + item(2));
  res.write(item(3) + item(4) + item(5));
  const text = await body;
  assert.equal(Buffer.byteLength(text), 1000);
  assert.equal(aborted, true, "the rest isn't downloaded");
  const items = parseFeed(text);
  assert.ok(items.length >= 2 && items.length < 5);
  assert.deepEqual(items.map((i) => i.id), items.map((_, n) => `job-${n + 1}`));
});

test("without partial (JSON, pages) a response past the limit is still refused", async () => {
  const res = new PassThrough();
  const body = readBody(res, { maxBytes: 100, abort: () => {} });
  res.write("x".repeat(150));
  await assert.rejects(body, (e) => e.code === "TOO_LARGE");
});

test("a response under the limit is read whole", async () => {
  const res = new PassThrough();
  const body = readBody(res, { maxBytes: 10_000, partial: true, abort: () => {} });
  res.end("<rss>" + item(1) + "</rss>");
  assert.equal(parseFeed(await body).length, 1);
});

test("only an RSS source asks for a partial read", async () => {
  const asked = [];
  const source = { id: "src_x", kind: "rss", url: "https://example.com/feed.rss", termsReviewed: true, redistributionAllowed: true, permission: "terms_permit", modules: ["jobs"], attribution: "X", requiredFields: ["title", "canonicalUrl"] };
  await fetchRecords(source, { get: async (u, opts) => { asked.push(opts); return "<rss>" + item(1) + "</rss>"; } }).catch(() => {});
  assert.deepEqual(asked[0], { partial: true });
});
