import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPublicUrl, robotsAllowed, parseFeed, parseStructured, decodeEntities } from "../src/collect.mjs";

test("collector forbids private, IP, local and non-HTTPS destinations", () => {
  for (const url of ["http://example.org", "https://127.0.0.1/x", "https://[::1]/x", "https://localhost/x", "https://internal.local/x", "https://user:pass@example.org/x", "https://example.org:444/x"]) assert.throws(() => checkPublicUrl(url));
  assert.equal(checkPublicUrl("https://careers.example.org/jobs").hostname, "careers.example.org");
});
test("robots policy selects named agent then longest rule", () => {
  const rules = "User-agent: *\nDisallow: /\n\nUser-agent: WorksLakeGateway\nDisallow: /private\nAllow: /private/public\n";
  assert.equal(robotsAllowed(rules, "/jobs"), true);
  assert.equal(robotsAllowed(rules, "/private/sensitive"), false);
  assert.equal(robotsAllowed(rules, "/private/public/opportunities"), true);
});
test("RSS and Atom extract actual provided fields without fabrication", () => {
  const rss = '<rss><channel><item><guid>a</guid><title>Math teacher</title><company>School A</company><link>https://example.org/a</link><pubDate>2026-10-30</pubDate><description>Teach maths</description></item></channel></rss>';
  const got = parseFeed(rss);
  assert.equal(got.length, 1);
  assert.equal(got[0].organization, "School A");
  assert.equal(got[0].publishedAt, "2026-10-30");
  const atom = '<feed><entry><title>Developer</title><link href="https://example.org/b" /><updated>2026-10-30</updated></entry></feed>';
  assert.equal(parseFeed(atom)[0].canonicalUrl, "https://example.org/b");
});
test("schema.org JSON-LD parser ignores unstructured scripts", () => {
  const html = '<script type="application/ld+json">{"@type":"JobPosting","title":"Engineer","hiringOrganization":{"name":"Example"},"url":"https://example.org/jobs/1","datePosted":"2026-10-30"}</script><script type="application/ld+json">oops</script>';
  const result = parseStructured(html);
  assert.equal(result.length, 1);
  assert.equal(result[0].organization, "Example");
  assert.equal(decodeEntities("&lt;b&gt;Test&amp;more&lt;/b&gt;"), "<b>Test&more</b>");
});
import { robotsPattern } from "../src/collect.mjs";
test("robots rules honour * and $ and never block more than they say", () => {
  const rules = "User-agent: *\nDisallow: /*.pdf$\nDisallow: /search?\nDisallow: /admin/*/secret\n";
  assert.equal(robotsAllowed(rules, "/jobs"), true);
  assert.equal(robotsAllowed(rules, "/files/cv.pdf"), false);
  assert.equal(robotsAllowed(rules, "/files/cv.pdf.html"), true);
  assert.equal(robotsAllowed(rules, "/search?q=x"), false);
  assert.equal(robotsAllowed(rules, "/admin/a/secret"), false);
  assert.equal(robotsAllowed(rules, "/admin/a/open"), true);
  assert.equal(robotsAllowed("User-agent: *\nDisallow: /a\nAllow: /a", "/a"), true, "equally specific: Allow wins");
  assert.ok(robotsPattern("/a.b").test("/a.b") && !robotsPattern("/a.b").test("/axb"), "dots are literal");
});
import { pinnedLookup } from "../src/collect.mjs";
test("the pinned lookup answers in the shape the caller asked for", () => {
  const pin = { address: "93.184.216.34", family: 4 };
  pinnedLookup(pin)("example.org", { all: true }, (err, list) => { assert.equal(err, null); assert.deepEqual(list, [{ address: pin.address, family: 4 }]); });
  pinnedLookup(pin)("example.org", {}, (err, address, family) => { assert.equal(err, null); assert.equal(address, pin.address); assert.equal(family, 4); });
});
