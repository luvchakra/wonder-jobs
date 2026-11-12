/**
 * Apollo (WJ-824, WJ-825; docs/PROSPECT_DATA_API.md, A3 and A4). Its API reference, read on 2026-11-12, key in the
 * x-api-key header on every call:
 * - Organization Search (docs.apollo.io/reference/organization-search): POST api/v1/mixed_companies/search with
 *   q_organization_keyword_tags[], organization_locations[], organization_num_employees_ranges[] ("250,500"), page and
 *   per_page (at most 100) as query parameters; 1 credit a page. Answers { organizations: [...], pagination: { page,
 *   per_page, total_entries, total_pages } }. The documented organisation fields are id, name, website_url,
 *   primary_domain, phone, primary_phone { number }, linkedin_url and links; location and industry are not documented
 *   for this route, so they are read only when present.
 * - People API Search (docs.apollo.io/reference/people-api-search): POST api/v1/mixed_people/api_search with
 *   person_titles[] and q_organization_domains_list[]; no credits; returns ids, titles and has_email, never an email.
 * - People Enrichment (docs.apollo.io/reference/people-enrichment): POST api/v1/people/match?id=…; 1 credit a person
 *   for an email; reveal_personal_emails stays false, so only a work email can come back.
 * - Organization Enrichment (docs.apollo.io/reference/organization-enrichment): GET api/v1/organizations/enrich?domain=;
 *   1 credit; answers { organization: { industry, short_description, phone, linkedin_url, city, state, country, ... } }.
 *
 * Terms pending: Apollo's API terms (apollo.io/terms/api, read 2026-11-12) license the API "solely for your internal
 * business purposes", forbid sharing or distributing it, and ask for Apollo's approval before it is integrated into a
 * product. Passing its answers to WonderArk needs that approval (owner decision `prospects-apollo`). Nothing Apollo
 * returns is stored; a person is never cached, logged or written anywhere.
 */
import { blankBusiness, callJson, count, countryOf, hostOf, httpsUrl, list, placeOf, str, wordsOf } from "./shared.mjs";

const API = "https://api.apollo.io/api/v1/";
const regionNames = (() => { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; } })();
const headers = (ctx) => ({ accept: "application/json", "content-type": "application/json", "cache-control": "no-cache", "x-api-key": ctx.keys.APOLLO_API_KEY });
/** A URL with Apollo's array parameters (`name[]=a&name[]=b`). */
function withParams(path, params) {
  const u = new URL(API + path);
  for (const [k, v] of Object.entries(params)) for (const x of Array.isArray(v) ? v : [v]) if (x !== null && x !== undefined && x !== "") u.searchParams.append(Array.isArray(v) ? k + "[]" : k, String(x));
  return u;
}
/** "11-50", "11,50" or "11 - 50" as Apollo's "11,50"; anything else is not sent. */
export const employeeRangeParam = (r) => { const m = /^\s*(\d{1,7})\s*[-,–]\s*(\d{1,7})\s*$/.exec(r); return m && Number(m[1]) <= Number(m[2]) ? m[1] + "," + m[2] : null; };
const phoneOf = (o) => str(o?.primary_phone?.number, 60) ?? str(o?.sanitized_phone, 60) ?? str(o?.phone, 60);

function business(o, at) {
  const name = str(o?.name, 200);
  if (typeof o?.id !== "string" || !/^[\w-]{6,64}$/.test(o.id) || !name) return null;
  const website = httpsUrl(o.website_url);
  const domain = typeof o.primary_domain === "string" && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(o.primary_domain) ? o.primary_domain.toLowerCase().replace(/^www\./, "") : website ? hostOf(website) : null;
  const city = str(o.city, 80), region = str(o.state, 80), countryName = str(o.country, 80);
  return {
    ...blankBusiness(), id: "apollo_" + o.id, name, website, domain, phone: phoneOf(o),
    industry: str(o.industry, 120),
    location: { ...blankBusiness().location, text: [city, region, countryName].filter(Boolean).join(", ") || null, city, region, country: countryName && /^[A-Za-z]{2}$/.test(countryName) ? countryName.toUpperCase() : null, postcode: str(o.postal_code, 12) },
    source: { id: "apollo", provider: "apollo", name: "Apollo", url: website, termsPending: true },
    observedAt: at,
  };
}

/** Named people at one organisation, by title (free: no email comes back). Ids and titles only. */
export async function apolloPeople(ctx, { domain, titles, size }) {
  const u = withParams("mixed_people/api_search", { person_titles: titles, q_organization_domains_list: [domain], page: 1, per_page: Math.max(1, Math.min(25, size)) });
  const answer = await callJson(ctx, u, { method: "POST", headers: headers(ctx), body: "{}" });
  return list(answer?.people).filter((p) => typeof p?.id === "string" && /^[\w-]{6,64}$/.test(p.id) && p.has_email !== false).map((p) => ({ id: p.id, title: str(p.title, 160) }));
}

/** One person's work email at `domain` (1 credit when Apollo has one), or null. A personal email is never asked for. */
export async function apolloReveal(ctx, id, domain) {
  const u = withParams("people/match", { id, reveal_personal_emails: "false", reveal_phone_number: "false" });
  const answer = await callJson(ctx, u, { method: "POST", headers: headers(ctx), body: "{}" });
  const p = answer?.person;
  const email = typeof p?.email === "string" ? p.email.trim().toLowerCase() : "";
  const at = email.lastIndexOf("@");
  // Only an address at the organisation's own domain (or one under it) is a work email for this lookup.
  if (at < 1 || !/^[^\s@]{1,64}@[a-z0-9.-]{3,190}$/.test(email)) return null;
  const host = email.slice(at + 1);
  if (host !== domain && !host.endsWith("." + domain)) return null;
  return {
    firstName: str(p.first_name, 80), lastName: str(p.last_name, 80), title: str(p.title, 160), email,
    emailStatus: p.email_status === "verified" ? "verified" : "unverified",
    linkedinUrl: httpsUrl(p.linkedin_url) && /(^|\.)linkedin\.com$/.test(hostOf(p.linkedin_url) ?? "") ? httpsUrl(p.linkedin_url) : null,
  };
}

/** An organisation's facts for enrich (1 credit), as { field: value }; a field Apollo does not state is left out. */
export async function apolloOrganisation(ctx, domain) {
  const u = withParams("organizations/enrich", { domain });
  const answer = await callJson(ctx, u, { headers: headers(ctx) });
  const o = answer?.organization;
  if (!o || typeof o !== "object") return {};
  const linkedin = httpsUrl(o.linkedin_url);
  const hq = [str(o.city, 80), str(o.state, 80), str(o.country, 80)].filter(Boolean).join(", ");
  // Apollo states a head count, not a band; a head count is never turned into one (as for the directory).
  return Object.fromEntries(Object.entries({
    industry: str(o.industry, 120), description: str(o.short_description, 600), phone: phoneOf(o),
    linkedinUrl: linkedin && /(^|\.)linkedin\.com$/.test(hostOf(linkedin) ?? "") ? linkedin : null, hq: hq || null,
  }).filter(([, v]) => v !== null));
}

export default {
  id: "apollo", label: "Apollo", kinds: ["business"], paid: true, units: 1, coverage: ["global"], attribution: "Apollo", termsPending: true,
  cost: "1 paid unit a search page, an enrichment or a contact's email",
  keys: ["APOLLO_API_KEY"], maxPage: 100, defaultCacheHours: 24,
  async search(plan, ctx) {
    const country = countryOf(plan), place = placeOf(plan);
    const countryName = country ? (regionNames?.of(country) ?? null) : null;
    const page = ctx.token && /^\d{1,3}$/.test(ctx.token) ? Number(ctx.token) : 1;
    const tags = [...new Set([plan.query, ...plan.categoryWords].filter(Boolean))].slice(0, 5);
    const u = withParams("mixed_companies/search", {
      q_organization_keyword_tags: tags.length ? tags : [wordsOf(plan)],
      organization_locations: [place ? [place, countryName].filter(Boolean).join(", ") : countryName].filter(Boolean),
      organization_num_employees_ranges: (plan.employeeRanges ?? []).map(employeeRangeParam).filter(Boolean),
      page, per_page: ctx.size,
    });
    const answer = await callJson(ctx, u, { method: "POST", headers: headers(ctx), body: "{}" });
    const at = new Date(ctx.now).toISOString();
    const pages = count(answer?.pagination?.total_pages);
    return { items: list(answer?.organizations).map((o) => business(o, at)).filter(Boolean), next: pages !== null && page < Math.min(pages, 500) ? String(page + 1) : null };
  },
};
