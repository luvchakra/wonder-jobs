/**
 * data.gov.in's company master data as a live provider of businesses (WJ-824; docs/PROSPECT_DATA_API.md, A3). India's
 * Open Government Data platform serves the Ministry of Corporate Affairs' company master data as resource
 * 4dbe5667-7b6b-41d7-82af-211562424d9a: GET api.data.gov.in/resource/<id>?api-key=…&format=json&offset=&limit=
 * &filters[<field>]=<value>, answering { records: [...], total, count, offset }. Fields: CIN, CompanyName,
 * CompanyROCcode, CompanyCategory, CompanySubCategory, CompanyClass, CompanyRegistrationdate_date,
 * Registered_Office_Address, Listingstatus, CompanyStatus, CompanyStateCode, nic_code,
 * CompanyIndustrialClassification. Filters are exact keyword matches (names are stored in capitals); there is no
 * free-text search.
 *
 * Read second-hand on 2026-11-12: data.gov.in and api.data.gov.in refused or did not answer the build network (403,
 * 503, connection reset), so the resource id, fields and filter behaviour come from open-source clients that call it
 * (github.com/StephenAbbott/opencheck, mca_india.py, and others). Licence: Government Open Data License – India (GODL),
 * which asks for attribution ("Contains Ministry of Corporate Affairs company master data"). Terms pending: the
 * platform's API terms and the attribution wording, and whether the resource is current (owner decision
 * `prospects-data-gov-in`). A search asks for active companies whose registered name is the query; an industry given
 * as a NIC code is passed as one; a place narrows by the state or registered address.
 */
import { blankBusiness, callJson, count, list, str } from "./shared.mjs";

export const RESOURCE = "4dbe5667-7b6b-41d7-82af-211562424d9a";
const ENDPOINT = "https://api.data.gov.in/resource/" + RESOURCE;
const CATALOG = "https://www.data.gov.in/catalog/company-master-data";
/** A value the register leaves empty ("NA", "-", "NULL"). */
const empty = (v) => typeof v !== "string" || /^\s*(na|n\/a|nil|null|-)?\s*$/i.test(v);
const field = (v, max) => (empty(v) ? null : str(v, max));

function business(r, at) {
  const cin = typeof r?.CIN === "string" ? r.CIN.trim().toUpperCase() : "";
  const name = field(r?.CompanyName, 200);
  if (!/^[A-Z0-9-]{8,25}$/.test(cin) || !name) return null;
  const registered = field(r.CompanyRegistrationdate_date, 20);
  const kind = [field(r.CompanyClass, 60), field(r.CompanyCategory, 80)].filter(Boolean).join(" ");
  return {
    ...blankBusiness(), id: "data_gov_in_" + cin, name,
    industry: field(r.CompanyIndustrialClassification, 120),
    // What the register states, in its words: the company's class and category, when it was registered, its CIN.
    description: [kind, registered ? "registered " + registered : null, "CIN " + cin].filter(Boolean).join(", "),
    location: { ...blankBusiness().location, text: field(r.Registered_Office_Address, 180), region: field(r.CompanyStateCode, 80), country: "IN" },
    source: { id: "data_gov_in", provider: "data_gov_in", name: "Ministry of Corporate Affairs company master data (data.gov.in)", url: CATALOG, termsPending: true },
    observedAt: at,
  };
}

export default {
  id: "data_gov_in", label: "data.gov.in company master data", kinds: ["business"], paid: false, units: 0, coverage: ["IN"], attribution: "Contains Ministry of Corporate Affairs company master data (data.gov.in, GODL – India)", termsPending: true,
  cost: "free",
  keys: ["DATA_GOV_IN_API_KEY"], maxPage: 100, defaultCacheHours: 24,
  async search(plan, ctx) {
    const offset = ctx.token && /^\d{1,6}$/.test(ctx.token) ? Number(ctx.token) : 0;
    const nic = (plan.industries ?? []).find((x) => /^\d{2,5}$/.test(x.trim()));
    // The register matches whole names only, so the query is the name; without one, only a NIC code can narrow it.
    if (!plan.query && !nic) return { items: [], next: null };
    const u = new URL(ENDPOINT);
    u.search = new URLSearchParams({ "api-key": ctx.keys.DATA_GOV_IN_API_KEY, format: "json", offset: String(offset), limit: String(ctx.size), "filters[CompanyStatus]": "Active", ...(plan.query ? { "filters[CompanyName]": plan.query.replace(/\s+/g, " ").trim().toUpperCase() } : {}), ...(nic ? { "filters[nic_code]": nic.trim() } : {}) }).toString();
    const answer = await callJson(ctx, u, { headers: { accept: "application/json", "user-agent": "WorksLakeGateway/1.0" } });
    const at = new Date(ctx.now).toISOString();
    const records = list(answer?.records);
    const places = plan.locations.map((l) => l.text?.toLowerCase()).filter(Boolean);
    const items = records.map((r) => business(r, at)).filter(Boolean)
      .filter((b) => !places.length || places.some((p) => `${b.location.region ?? ""} ${b.location.text ?? ""}`.toLowerCase().includes(p)));
    const total = count(answer?.total);
    const more = records.length >= ctx.size && (total === null || offset + records.length < total);
    return { items, next: more ? String(offset + records.length) : null };
  },
};
