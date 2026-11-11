/**
 * Prospect data for administrators (WJ-815, docs/PROSPECT_DATA_API.md): the settings that let an outside product
 * (WonderArk) read the stored prospect datasets, its API keys, the sources those datasets hold and this month's use.
 * Every change runs through the gateway's own administrator routes, so its checks and audit trail apply.
 */
import { PROSPECT_DATASETS, PROSPECT_SCOPES } from "../../../../data-gateway/src/core.mjs";
import { prospectSettings } from "../../../../data-gateway/src/prospects.mjs";
import { adminCall } from "./admin";
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
  /** Sources bound to a prospect dataset. */
  sources: { id: string; name: string; datasets: string[]; live: boolean; outside: boolean; termsPending: boolean; rows: number; lastSuccessAt: string | null }[];
  /** This calendar month (UTC), per consumer and per tenant: requests and paid units, never what was searched. */
  usage: { month: string; consumers: { consumerId: string; searches: number; results: number; paidUnits: number; tenants: { tenant: string; searches: number; paidUnits: number }[] }[] };
}

type Src = { id: string; attribution?: string; datasets?: string[]; enabled?: boolean; externalRedistributionAllowed?: boolean; permissionEvidence?: string; lastSuccessAt?: string | null };
type Key = { id: string; prefix: string; consumerId: string; createdAt: string; scopes: string[]; revokedAt: string | null; expiresAt: string | null };
type Use = { day: string; consumerId: string; route: string; tenant?: string; count?: number; results?: number; units?: number };

export async function prospectAdminView(now = new Date()): Promise<ProspectAdminView> {
  const hosted = hostedGateway();
  const month = now.toISOString().slice(0, 7);
  const empty: ProspectAdminView = { configured: false, gatewayUrl: "", allowExternalConsumers: false, forcedOn: false, quotas: { search: 0, paid: 0 }, paidPlatformCap: 0, keys: [], sources: [], usage: { month, consumers: [] } };
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
    sources: read.sources.map((x) => ({ id: x.id, name: String(x.attribution ?? x.id), datasets: x.datasets ?? [], live: x.enabled === true, outside: x.externalRedistributionAllowed === true, termsPending: /terms (pending|to confirm)/i.test(String(x.permissionEvidence ?? "")), rows: counts.bySource[x.id] ?? 0, lastSuccessAt: x.lastSuccessAt ?? null })).sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name)),
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
