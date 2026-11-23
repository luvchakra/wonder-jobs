// WJ-847: Facebook, Instagram and LinkedIn pages found through Brave Search. Only outlets are kept, never a person's
// profile; Facebook, Instagram and LinkedIn themselves are never called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { facebook, instagram, linkedin, statedAudience, statedNumber, MIN_INSTAGRAM_FOLLOWERS } from "../src/providers/social-search.mjs";
import { publishedEmail } from "../src/providers/shared.mjs";

const PLAN = { kind: "channel", query: "parenting", categoryWords: [], channelTypes: [], locations: [{ text: "Bangalore", country: "IN", lat: null, lon: null }], languages: [], minAudience: null, employeeRanges: [], industries: [] };

function ctxFor(results, { more = false, calls = [] } = {}) {
  return {
    keys: { BRAVE_SEARCH_API_KEY: "brave-SECRET" }, size: 20, token: null, now: Date.parse("2026-11-22T00:00:00Z"), signal: undefined, calls,
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (!url.startsWith("https://api.search.brave.com/")) throw new Error("only Brave Search may be called: " + url);
      return new Response(JSON.stringify({ query: { more_results_available: more }, web: { results } }), { status: 200 });
    },
  };
}

test("reads stated numbers and audiences", () => {
  assert.equal(statedNumber("12K"), 12_000);
  assert.equal(statedNumber("1.2M"), 1_200_000);
  assert.equal(statedNumber("3,456"), 3456);
  assert.equal(statedNumber("lots"), null);
  assert.deepEqual(statedAudience("Parenting Bangalore. 5.2K members", ["members"]), { value: 5200, unit: "members" });
  assert.equal(statedAudience("No numbers here", ["followers"]), null);
});

test("Facebook keeps pages and public groups that state an audience, never a person", async () => {
  const calls = [];
  const { items } = await facebook.search(PLAN, ctxFor([
    { url: "https://www.facebook.com/groups/blrparents/", title: "Bangalore Parents Network | Facebook", description: "Public group · 48K members" },
    { url: "https://www.facebook.com/HappyKidsBLR", title: "Happy Kids Bangalore - Facebook", description: "Happy Kids. 12,345 likes · 200 talking about this." },
    { url: "https://www.facebook.com/profile.php?id=1000123", title: "A Person", description: "1.2K followers" },
    { url: "https://www.facebook.com/some.person", title: "Some Person", description: "Some Person has 450 friends on Facebook" },
    { url: "https://www.facebook.com/people/Someone/100/", title: "Someone", description: "300 followers" },
    { url: "https://www.facebook.com/NoNumbersPage", title: "No numbers", description: "A page about kids" },
    { url: "https://evil.example/groups/x", title: "Fake", description: "10K members" },
  ], { calls }));
  assert.deepEqual(items.map((i) => [i.name, i.url, i.channelType, i.audience?.value]), [
    ["Bangalore Parents Network", "https://www.facebook.com/groups/blrparents/", "community", 48000],
    ["Happy Kids Bangalore", "https://www.facebook.com/HappyKidsBLR/", "organisation", 12345],
  ]);
  assert.equal(items[0].source.termsPending, true);
  const asked = new URL(calls[0].url);
  assert.equal(asked.searchParams.get("q"), "site:facebook.com parenting Bangalore");
  assert.equal(calls[0].init.headers["x-subscription-token"], "brave-SECRET");
});

test("Instagram keeps only accounts that state at least the follower floor", async () => {
  const { items } = await instagram.search(PLAN, ctxFor([
    { url: "https://www.instagram.com/momsofblr/", title: "Moms of Bangalore (@momsofblr) • Instagram photos and videos", description: "25K Followers, 300 Following, 1,200 Posts - See Instagram photos and videos from Moms of Bangalore (@momsofblr)" },
    { url: "https://www.instagram.com/someone_small/", title: "Someone (@someone_small)", description: `${MIN_INSTAGRAM_FOLLOWERS - 1} Followers, 200 Following` },
    { url: "https://www.instagram.com/p/Cabc123/", title: "A post", description: "50K Followers" },
    { url: "https://www.instagram.com/explore/tags/parenting/", title: "#parenting", description: "1M posts" },
    { url: "https://www.instagram.com/nonumbers/", title: "No numbers", description: "See photos" },
  ]));
  assert.deepEqual(items.map((i) => [i.name, i.url, i.audience]), [["Moms of Bangalore", "https://www.instagram.com/momsofblr/", { value: 25000, unit: "followers", asOf: "2026-11-22" }]]);
});

test("LinkedIn keeps company and showcase pages, never a member's profile", async () => {
  const { items, next } = await linkedin.search(PLAN, ctxFor([
    { url: "https://in.linkedin.com/company/acme-schools", title: "Acme Schools | LinkedIn", description: "Acme Schools | 3,210 followers on LinkedIn." },
    { url: "https://www.linkedin.com/showcase/acme-parents/", title: "Acme Parents - LinkedIn", description: "Showcase page" },
    { url: "https://www.linkedin.com/in/some-person/", title: "Some Person - Teacher", description: "500+ connections" },
    { url: "https://www.linkedin.com/posts/acme_activity-1", title: "A post", description: "" },
    { url: "https://www.linkedin.com/company/acme-schools/jobs/", title: "Acme Schools jobs | LinkedIn", description: "" },
  ], { more: true }));
  assert.deepEqual(items.map((i) => [i.name, i.url, i.audience?.value ?? null]), [
    ["Acme Schools", "https://www.linkedin.com/company/acme-schools/", 3210],
    ["Acme Parents", "https://www.linkedin.com/showcase/acme-parents/", null],
  ]);
  assert.equal(next, "1");
});

test("a later page is asked by offset, and the offset never passes Brave's limit", async () => {
  const calls = [];
  const ctx = { ...ctxFor([], { more: true, calls }), token: "9" };
  const { next } = await facebook.search(PLAN, ctx);
  assert.equal(new URL(calls[0].url).searchParams.get("offset"), "9");
  assert.equal(next, null);
});

test("nothing is asked without words to search for", async () => {
  const ctx = ctxFor([]);
  const out = await linkedin.search({ ...PLAN, query: "", categoryWords: [], locations: [] }, ctx);
  assert.deepEqual(out, { items: [], next: null });
  assert.equal(ctx.calls.length, 0);
});

// WJ-870 (owner, 2026-11-23): an enquiry address is returned only where the page wrote one in its own profile text.
test("a published address is read from the page's own text, and nothing is guessed", async () => {
  const { items } = await instagram.search(PLAN, ctxFor([
    { url: "https://www.instagram.com/momsofblr/", title: "Moms of Bangalore (@momsofblr)", description: "25K Followers, 300 Following - Collabs: Hello@MomsOfBlr.in. See Instagram photos" },
    { url: "https://www.instagram.com/tidyhome/", title: "Tidy Home (@tidyhome)", description: "12K Followers, 10 Following, 90 Posts" },
  ]));
  assert.deepEqual(items.map((i) => [i.name, i.contactEmail, i.contactEmailSource]), [
    ["Moms of Bangalore", "hello@momsofblr.in", "profile text in the search result"],
    ["Tidy Home", null, null],
  ]);
});

test("publishedEmail keeps a real address and drops look-alikes", () => {
  assert.equal(publishedEmail("Write to Press@Example-Studio.co.uk for features."), "press@example-studio.co.uk");
  assert.equal(publishedEmail("first a@b.io then c@d.io"), "a@b.io");
  for (const text of ["no address here", "noreply@studio.com", "me@example.com", "logo@2x.png", "user at site dot com", "@handle", "", null, 42]) {
    assert.equal(publishedEmail(text), null, String(text));
  }
});
