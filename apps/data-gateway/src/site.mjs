/**
 * An organisation's own website, read for what it publishes about itself (WJ-818, docs/PROSPECT_DATA_API.md, A4): the
 * home page and at most one contact or about page, for schema.org Organization / LocalBusiness data, a published phone
 * and a generic mailbox. Every request goes through the gateway's own safe fetch (HTTPS only, public addresses only,
 * the address pinned, no redirect to another host), robots.txt is honoured, and nothing a page says is ever followed
 * as an instruction: it is text, returned as plain text.
 *
 * Organisations only. A person is never read: no named person's mailbox (only role mailboxes and ones named like the
 * site), and only a company's LinkedIn page, never a profile.
 */
import { plainText } from "./core.mjs";
import { PAGE_ACCEPT, robotsAllowed, safeGet } from "./collect.mjs";

export const SITE_PAGE_BYTES = 600_000;
export const SITE_BUDGET_MS = 9000;
const ROLE = new Set(["info", "contact", "contactus", "sales", "support", "hello", "enquiry", "enquiries", "inquiry", "inquiries", "admin", "office", "service", "services", "care", "customercare", "customerservice", "mail", "email", "team", "accounts", "booking", "bookings", "orders", "marketing", "business", "help", "helpdesk", "reception", "frontdesk", "connect", "reach", "corporate", "india"]);
const ROLE_PREFIX = ["info", "sales", "support", "contact", "enquiry", "care", "admin", "office"];
const ORG_TYPE = /(organization|business|corporation|store|company|contractor|service|agency|ngo|restaurant|hotel|clinic|school|dealer|professional)$/i;

/** A host as a bare domain: lower case, no "www.". "" when it isn't one. */
export function cleanDomain(value) {
  const v = String(value ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0];
  // A name that only resolves inside a network (.internal, .local and the like) is never an organisation's site.
  if (/\.(internal|local|localhost|localdomain|lan|home|corp|intranet|arpa)$/.test(v)) return "";
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(v) && v.length <= 120 ? v : "";
}

/** Whether an address reads as the organisation's own mailbox: a role address, or one named like its site. Never a person's. */
export function organisationMailbox(email, domain) {
  const e = String(email ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{3,120}\.[a-z]{2,}$/.test(e)) return false;
  const local = e.split("@")[0].replace(/[^a-z0-9]/g, "");
  if (!local) return false;
  if (ROLE.has(local) || ROLE_PREFIX.some((r) => local.startsWith(r) || local.endsWith(r))) return true;
  const label = String(domain ?? "").split(".")[0].replace(/[^a-z0-9]/g, "");
  return label.length >= 5 && (local.includes(label) || (local.length >= 5 && label.includes(local)));
}

const text = (v, max) => { const t = plainText(typeof v === "string" || typeof v === "number" ? String(v) : ""); return t ? t.slice(0, max) : null; };
const phoneOf = (v) => { const t = text(v, 40); return t && t.replace(/\D/g, "").length >= 7 && t.replace(/\D/g, "").length <= 15 && /^[+\d][\d\s().-]+$/.test(t) ? t : null; };
const attr = (tag, name) => { const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag); return m ? (m[1] ?? m[2] ?? "") : ""; };

/** Every schema.org node in a page's JSON-LD blocks, flattened (a block that isn't valid JSON is skipped). */
function ldNodes(html) {
  const out = [];
  const walk = (n, depth) => {
    if (!n || depth > 4 || out.length > 200) return;
    if (Array.isArray(n)) { for (const x of n.slice(0, 50)) walk(x, depth + 1); return; }
    if (typeof n !== "object") return;
    out.push(n);
    if (n["@graph"]) walk(n["@graph"], depth + 1);
  };
  for (const m of String(html).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    if (m[1].length > 200_000) continue;
    try { walk(JSON.parse(m[1]), 0); } catch { /* not JSON: nothing is read from it */ }
  }
  return out;
}

/**
 * What one page states about the organisation: its description, phone, own mailbox, company LinkedIn page and where it
 * is based. `links` are the page's same-site contact or about pages, for the one further page that may be read.
 */
export function siteFacts(html, pageUrl, domain) {
  const page = String(html ?? "").slice(0, SITE_PAGE_BYTES);
  const facts = { description: null, phone: null, email: null, linkedinUrl: null, hq: null };
  const org = ldNodes(page).find((n) => [n["@type"]].flat().some((t) => typeof t === "string" && ORG_TYPE.test(t)));
  if (org) {
    facts.description = text(org.description, 600);
    facts.phone = phoneOf([org.telephone].flat()[0]) ?? phoneOf(org.contactPoint && [org.contactPoint].flat()[0]?.telephone);
    const mail = [org.email].flat().map((e) => String(e ?? "").replace(/^mailto:/i, "").trim().toLowerCase()).find((e) => organisationMailbox(e, domain));
    if (mail) facts.email = mail;
    const address = [org.address].flat()[0];
    if (address && typeof address === "object") {
      const country = typeof address.addressCountry === "object" ? address.addressCountry?.name : address.addressCountry;
      const parts = [address.addressLocality, address.addressRegion, country].map((p) => text(p, 60)).filter(Boolean);
      if (parts.length) facts.hq = [...new Set(parts)].join(", ");
    }
    const same = [org.sameAs].flat().find((u) => typeof u === "string" && /^https:\/\/([a-z]+\.)?linkedin\.com\/company\/[\w%.-]+\/?$/i.test(u.trim()));
    if (same) facts.linkedinUrl = same.trim();
  }
  if (!facts.description) {
    for (const m of page.matchAll(/<meta\b[^>]*>/gi)) if (/^(description|og:description)$/i.test(attr(m[0], "name") || attr(m[0], "property"))) { facts.description = text(attr(m[0], "content"), 600); if (facts.description) break; }
  }
  const mailboxes = new Set(facts.email ? [facts.email] : []);
  const links = [];
  for (const m of page.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(m[0], "href").trim();
    if (/^tel:/i.test(href)) { if (!facts.phone) facts.phone = phoneOf(decodeURIComponent(href.slice(4)).replace(/\s+/g, " ")); continue; }
    if (/^mailto:/i.test(href)) { const e = href.slice(7).split("?")[0].trim().toLowerCase(); if (organisationMailbox(e, domain)) mailboxes.add(e); continue; }
    if (!facts.linkedinUrl && /^https:\/\/([a-z]+\.)?linkedin\.com\/company\/[\w%.-]+\/?$/i.test(href)) { facts.linkedinUrl = href; continue; }
    if (links.length >= 3 || !href || /^(#|javascript:|data:)/i.test(href)) continue;
    try {
      const u = new URL(href, pageUrl);
      if (u.protocol === "https:" && u.hostname === new URL(pageUrl).hostname && /(contact|about|reach-us|get-in-touch)/i.test(u.pathname) && u.pathname.length <= 80) { u.hash = ""; u.search = ""; if (!links.includes(u.toString())) links.push(u.toString()); }
    } catch { /* not a link */ }
  }
  if (!facts.email && mailboxes.size) facts.email = [...mailboxes][0];
  return { facts, mailboxes: [...mailboxes].slice(0, 5), links };
}

const within = (promise, ms) => new Promise((resolve, reject) => { const t = setTimeout(() => reject(Object.assign(new Error("Timed out"), { code: "SOURCE_TIMEOUT" })), ms); promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); }); });

/**
 * Reads an organisation's site: robots.txt first (a site that disallows us is not read; one with no robots.txt is),
 * then the home page, then one contact or about page when the home page links to one. Two pages at most. Returns the
 * fields found, each with the page it came from, and the organisation's own mailboxes; `status` says why nothing was
 * read ("robots", "unavailable"). `get` is the gateway's safe fetch (tests pass their own).
 */
export async function readOrganisationSite(domainInput, { get = safeGet, now = () => Date.now(), budgetMs = SITE_BUDGET_MS } = {}) {
  const domain = cleanDomain(domainInput);
  if (!domain) return { status: "unavailable", fields: {}, mailboxes: [], pages: [] };
  const started = now();
  const left = () => Math.max(500, budgetMs - (now() - started));
  const none = (status) => ({ status, fields: {}, mailboxes: [], pages: [] });
  // robots.txt first, on the bare name or on www (whichever answers is the site's host for everything after). No
  // robots.txt (404) means no rules; one that can't be read means the site is not read at all.
  let host = null, robots = "", blocked = false;
  for (const h of [domain, "www." + domain]) {
    try {
      robots = await within(get(`https://${h}/robots.txt`, { origin: h, maxBytes: 128_000, redirects: 0, partial: true }), Math.min(2500, left()));
      host = h;
      break;
    } catch (e) {
      if (e?.code === "UNSAFE_URL" || e?.code === "UNSAFE_DESTINATION") return none("unavailable");
      if (e?.upstream === 404 || e?.upstream === 410) { host = h; robots = ""; break; }
      if (e?.upstream) blocked = true;
    }
  }
  if (!host) return none(blocked ? "robots" : "unavailable");
  if (!robotsAllowed(robots, "/")) return none("robots");
  let home;
  try { home = await within(get(`https://${host}/`, { origin: host, maxBytes: SITE_PAGE_BYTES, redirects: 2, accept: PAGE_ACCEPT, partial: true }), Math.min(4500, left())); }
  catch { return none("unavailable"); }
  const homeUrl = `https://${host}/`;
  const first = siteFacts(home, homeUrl, domain);
  const fields = {}, mailboxes = new Map(first.mailboxes.map((m) => [m, homeUrl]));
  for (const [k, v] of Object.entries(first.facts)) if (v) fields[k] = { value: v, url: homeUrl };
  const pages = [homeUrl];
  const next = first.links.find((u) => robotsAllowed(robots, new URL(u).pathname));
  const missing = ["description", "phone", "email", "linkedinUrl", "hq"].some((k) => !fields[k]);
  if (next && missing && left() > 1200) {
    try {
      const second = siteFacts(await within(get(next, { origin: host, maxBytes: SITE_PAGE_BYTES, redirects: 1, accept: PAGE_ACCEPT, partial: true }), Math.min(3500, left())), next, domain);
      pages.push(next);
      for (const [k, v] of Object.entries(second.facts)) if (v && !fields[k]) fields[k] = { value: v, url: next };
      for (const m of second.mailboxes) if (!mailboxes.has(m)) mailboxes.set(m, next);
    } catch { /* the home page's facts stand */ }
  }
  return { status: "ok", fields, mailboxes: [...mailboxes].map(([email, url]) => ({ email, url })).slice(0, 5), pages };
}
