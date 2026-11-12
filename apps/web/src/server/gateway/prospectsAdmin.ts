/**
 * Prospect data for administrators (WJ-815, docs/PROSPECT_DATA_API.md): the settings that let an outside product
 * (WonderArk) read the stored prospect datasets, its API keys, the sources those datasets hold and this month's use.
 * Every change runs through the gateway's own administrator routes, so its checks and audit trail apply.
 */
import { PROSPECT_DATASETS, PROSPECT_SCOPES } from "../../../../data-gateway/src/core.mjs";
import { prospectSettings } from "../../../../data-gateway/src/prospects.mjs";
import { LIVE_PROVIDERS, providerReady } from "../../../../data-gateway/src/providers/index.mjs";
import { providerKeys } from "./prospectHooks";
import { adminCall, registerFromCatalogue, setGatewaySource } from "./admin";
import { CATALOGUE } from "./catalogue";
import { syncCatalogueDefinitions } from "./catalogueSync";
import { hostedGateway } from "./index";
import { gatewayUrl } from "./secrets";

/** The one outside consumer provisioned (the gateway's README: "Production limitations"). */
export const PROSPECT_CONSUMER = "wonderark";

export interface ProspectAdminView {
  /** The gateway runs on this deployment. */
  configured: boolean;
  /** Where the outside product reaches it: the address to set as its WORKSLAKE_GATEWAY_URL. */
  gatewayUrl: string;
  allowExternalConsumers: boolean;
  /** The old deployment variable is set, so the switch here cannot turn outside consumers off. */
  forcedOn: boolean;
  quotas: { search: number; paid: number };
  paidPlatformCap: number;
  /** Live keys of the outside consumer (never the secret). */
  keys: { id: string; prefix: string; createdAt: string; scopes: string[] }[];
  /**
   * Sources bound to a prospect dataset. `state`: "not_added" (a reviewed catalogue file not registered yet; `id` is
   * its file name), "waiting" (added, nothing delivered or its last delivery failed), "ready" (a good delivery, not
   * serving yet), "live". `own` is true for a source that feeds only prospect data, which this card adds and activates;
   * a source that also feeds a module is managed on that module's card.
   */
  sources: { id: string; name: string; datasets: string[]; state: "not_added" | "waiting" | "ready" | "live"; own: boolean; live: boolean; outside: boolean; termsPending: boolean; rows: number; lastSuccessAt: string | null }[];
  /** Live providers (WJ-822): asked only when a search names one. "Needs setup" until its key is on Admin → Keys. */
  providers: { id: string; label: string; kinds: string[]; paid: boolean; ready: boolean; termsPending: boolean; cacheHours: number; keys: string[] }[];
  /** This calendar month (UTC), per consumer and per tenant: requests and paid units, never what was searched. */
  usage: { month: string; consumers: { consumerId: string; searches: number; results: number; paidUnits: number; tenants: { tenant: string; searches: number; paidUnits: number }[] }[] };
}

type Src = { id: string; url?: string; attribution?: string; modules?: string[]; datasets?: string[]; enabled?: boolean; externalRedistributionAllowed?: boolean; permissionEvidence?: string; lastSuccessAt?: string | null; lastTest?: { ok?: boolean; at?: string } };
const termsPending = (evidence: unknown) => /terms (pending|to confirm)/i.test(String(evidence ?? ""));
type Key = { id: string; prefix: string; consumerId: string; createdAt: string; scopes: string[]; revokedAt: string | null; expiresAt: string | null };
type Use = { day: string; consumerId: string; route: string; tenant?: string; count?: number; results?: number; units?: number };

export async function prospectAdminView(now = new Date()): Promise<ProspectAdminView> {
  const hosted = hostedGateway();
  const month = now.toISOString().slice(0, 7);
  const empty: ProspectAdminView = { configured: false, gatewayUrl: "", allowExternalConsumers: false, forcedOn: false, quotas: { search: 0, paid: 0 }, paidPlatformCap: 0, keys: [], sources: [], providers: [], usage: { month, consumers: [] } };
  if (!hosted) return empty;
  // Opening the card applies the reviewed files' current outside-use flags, so what it shows is what will be served.
  await syncCatalogueDefinitions().catch(() => undefined);
  const forcedOn = process.env.GATEWAY_ALLOW_EXTERNAL_CONSUMERS === "1";
  const read = await hosted.store.read((s) => {
    const settings = prospectSettings(s);
    const sources = (s.sources as Src[]).filter((x) => (x.datasets ?? []).length);
    const keys = (s.keys as Key[]).filter((k) => !k.revokedAt && (!k.expiresAt || Date.parse(k.expiresAt) > now.getTime()) && k.scopes.some((sc) => PROSPECT_SCOPES.includes(sc)) && k.consumerId !== "workslake");
    const usage = (s.usage as Use[]).filter((u) => u.tenant && String(u.day).startsWith(month) && String(u.route).startsWith("/v1/prospects/"));
    return { settings, sources: structuredClone(sources), keys: keys.map((k) => ({ id: k.id, prefix: k.prefix, createdAt: k.createdAt, scopes: [...k.scopes] })), usage: structuredClone(usage) };
  });
  const counts = await hosted.store.listings.counts(read.sources.map((x) => ({ sourceId: x.id, modules: (x.datasets ?? []).filter((d) => PROSPECT_DATASETS.includes(d)) })));
  // Whether each live provider's key is set; a value is never read into the view.
  const liveKeys = await providerKeys().catch(() => ({}) as Record<string, string | undefined>);
  const consumers = new Map<string, ProspectAdminView["usage"]["consumers"][number]>();
  for (const u of read.usage) {
    const c = consumers.get(u.consumerId) ?? { consumerId: u.consumerId, searches: 0, results: 0, paidUnits: 0, tenants: [] };
    const searches = u.route === "/v1/prospects/search" ? (u.count ?? 0) : 0;
    c.searches += searches;
    c.results += u.results ?? 0;
    c.paidUnits += u.units ?? 0;
    let t = c.tenants.find((x) => x.tenant === u.tenant);
    if (!t) c.tenants.push((t = { tenant: u.tenant!, searches: 0, paidUnits: 0 }));
    t.searches += searches;
    t.paidUnits += u.units ?? 0;
    consumers.set(u.consumerId, c);
  }
  for (const c of consumers.values()) c.tenants.sort((x, y) => y.searches - x.searches || x.tenant.localeCompare(y.tenant));
  return {
    configured: true,
    gatewayUrl: gatewayUrl(),
    allowExternalConsumers: forcedOn || read.settings.allowExternalConsumers,
    forcedOn,
    quotas: read.settings.quotas,
    paidPlatformCap: read.settings.paidPlatformCap,
    keys: read.keys,
    sources: [
      ...read.sources.map((x) => ({ id: x.id, name: String(x.attribution ?? x.id), datasets: x.datasets ?? [], state: x.enabled === true ? ("live" as const) : x.lastTest?.ok ? ("ready" as const) : ("waiting" as const), own: !(x.modules ?? []).length, live: x.enabled === true, outside: x.externalRedistributionAllowed === true, termsPending: termsPending(x.permissionEvidence), rows: counts.bySource[x.id] ?? 0, lastSuccessAt: x.lastSuccessAt ?? null })).sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name)),
      // Reviewed prospect-only sources in the catalogue that are not registered yet.
      ...Object.entries(CATALOGUE)
        .filter(([, def]) => !((def.modules as string[] | undefined) ?? []).length && ((def.datasets as string[] | undefined) ?? []).length && !read.sources.some((x) => x.url === def.url))
        .map(([file, def]) => ({ id: file, name: String(def.attribution ?? file), datasets: def.datasets as string[], state: "not_added" as const, own: true, live: false, outside: def.externalRedistributionAllowed === true, termsPending: termsPending(def.permissionEvidence), rows: 0, lastSuccessAt: null })),
    ],
    providers: LIVE_PROVIDERS.map((p) => ({ id: p.id, label: p.label, kinds: [...p.kinds], paid: p.paid, ready: providerReady(p, liveKeys), termsPending: p.termsPending, cacheHours: read.settings.providerCacheHours[p.id] ?? p.defaultCacheHours, keys: [...p.keys] })),
    usage: { month, consumers: [...consumers.values()].sort((a, b) => b.searches - a.searches) },
  };
}

/** Lets (or stops letting) an outside product hold keys. Stopping does not revoke a key already issued; Revoke does. */
export function setOutsideConsumers(on: boolean) {
  return adminCall("/v1/admin/settings", { allowExternalConsumers: on });
}

/** A tenant's monthly allowance (free searches, paid units) and the platform's paid cap. */
export function setProspectQuotas(input: { search?: number; paid?: number; paidPlatformCap?: number }) {
  const quotas = { ...(input.search !== undefined ? { search: input.search } : {}), ...(input.paid !== undefined ? { paid: input.paid } : {}) };
  return adminCall("/v1/admin/settings", { ...(Object.keys(quotas).length ? { quotas } : {}), ...(input.paidPlatformCap !== undefined ? { paidPlatformCap: input.paidPlatformCap } : {}) });
}

/** Issues the outside product's key with the five prospect scopes and no module scope. The secret is returned once. */
export function issueProspectKey() {
  return adminCall("/v1/admin/keys", { consumerId: PROSPECT_CONSUMER, scopes: [...PROSPECT_SCOPES] });
}

/** Revokes one of the outside product's keys: it stops working within seconds. */
export async function revokeProspectKey(keyId: string) {
  const hosted = hostedGateway();
  // Only a prospect key can be revoked from this card; WorksLake's own keys are not its to touch.
  const mine = hosted ? await hosted.store.read((s) => (s.keys as Key[]).some((k) => k.id === keyId && k.consumerId !== "workslake" && k.scopes.some((sc) => PROSPECT_SCOPES.includes(sc)))) : false;
  if (!mine) return { status: 404, body: { error: { code: "NOT_FOUND", message: "No such prospect key" } } as Record<string, unknown> };
  return adminCall(`/v1/admin/keys/${encodeURIComponent(keyId)}/revoke`, {});
}

/** Adds a reviewed prospect-only source from the catalogue (paused, like any catalogue source). */
export function addProspectSource(file: string) {
  const def = CATALOGUE[file];
  const prospectOnly = !!def && !((def.modules as string[] | undefined) ?? []).length && ((def.datasets as string[] | undefined) ?? []).length > 0;
  if (!prospectOnly) return Promise.resolve({ status: 404, body: { error: { code: "NOT_FOUND", message: "No such prospect source in the catalogue" } } as Record<string, unknown> });
  return registerFromCatalogue(file);
}

/** Starts or stops serving a prospect-only source. Activating needs a good delivery in the last day (the gateway's rule). */
export async function setProspectSource(sourceId: string, action: "activate" | "pause") {
  const hosted = hostedGateway();
  // Only a source that feeds prospect data alone: one that also feeds a module is managed on that module's card.
  const mine = hosted ? await hosted.store.read((s) => (s.sources as Src[]).some((x) => x.id === sourceId && !(x.modules ?? []).length && (x.datasets ?? []).length > 0)) : false;
  if (!mine) return { status: 404, body: { error: { code: "NOT_FOUND", message: "No such prospect source" } } as Record<string, unknown> };
  return setGatewaySource(sourceId, action);
}
