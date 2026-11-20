import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, scrubContacts, validateSource, ApiError } from "../src/core.mjs";

const base = { url: "https://hn.algolia.com/api/v1/search_by_date?query=cofounder", kind: "json_api", modules: ["cofounders"], permission: "terms_permit", permissionEvidence: "terms pending: confirm Hacker News terms for reuse", termsReviewed: true, redistributionAllowed: true, itemsPath: "hits", mapping: { id: "objectID", title: "title", applyUrl: "https://news.ycombinator.com/item?id={objectID}" }, retentionHours: 24 };

test("a public-posts source for Co-founders is allowed only with contact scrubbing, and only for Co-founders", () => {
  assert.doesNotThrow(() => validateSource({ ...base, publicPosts: true, scrubContacts: true, organizationOptional: true }));
  assert.throws(() => validateSource({ ...base, publicPosts: true }), (e) => e instanceof ApiError && e.status === 400 && /scrubContacts/.test(e.message));
  assert.throws(() => validateSource({ ...base, modules: ["services"], publicPosts: true, scrubContacts: true }), (e) => e instanceof ApiError && e.status === 403);
  assert.throws(() => validateSource({ ...base, modules: ["cofounders", "jobs"], publicPosts: true, scrubContacts: true }), (e) => e instanceof ApiError && e.status === 403);
});

test("Co-founders still needs verified opt-in unless the source is public posts or company listings; companies are for Co-founders only", () => {
  assert.throws(() => validateSource({ ...base }), (e) => e instanceof ApiError && e.status === 403);
  assert.doesNotThrow(() => validateSource({ ...base, publicCompanies: true }));
  assert.throws(() => validateSource({ ...base, modules: ["therapists"], publicCompanies: true }), (e) => e instanceof ApiError && e.status === 403);
  assert.throws(() => validateSource({ ...base, publicPosts: "yes", scrubContacts: true }), (e) => e instanceof ApiError);
});

test("scrubContacts removes email addresses, phone numbers and messaging handles, and keeps dates and ranges", () => {
  assert.equal(scrubContacts("Reach me at jane.doe@example.com or jane [at] example [dot] com"), "Reach me at or");
  assert.equal(scrubContacts("Call +91 98765 43210 now"), "Call now");
  assert.equal(scrubContacts("Posted 2026-11-05, built 2019-2024, 3 co-founders"), "Posted 2026-11-05, built 2019-2024, 3 co-founders");
  assert.ok(!/telegram|@raj/i.test(scrubContacts("Telegram: @raj_builds, looking for a CTO")));
  assert.match(scrubContacts("Looking for a technical co-founder in fintech"), /technical co-founder in fintech/);
});

test("a normalised public post carries no contact details in its title or text", () => {
  const src = { ...base, id: "src_x", attribution: "Hacker News", organizationOptional: true, publicPosts: true, scrubContacts: true, mapping: { ...base.mapping, description: "story_text", postedAt: "created_at", "attr.handle": "author" } };
  const n = normalize(src, { objectID: "1", title: "Ask HN: Looking for a co-founder (email me: a@b.co)", story_text: "<p>I build payments. Telegram: @raj_x. Phone +91 98765 43210.</p>", created_at: "2026-11-05T10:00:00Z", author: "raj" }, "cofounders");
  const all = JSON.stringify(n);
  assert.ok(!/a@b\.co|98765|@raj_x/.test(all), all);
  assert.equal(n.attributes.handle, "raj");
  assert.equal(n.canonicalUrl, "https://news.ycombinator.com/item?id=1");
});
