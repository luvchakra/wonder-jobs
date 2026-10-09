/**
 * Admin-configured connectors that aren't a known ATS: a JSON API with a response mapping, an
 * RSS/Atom feed, a page with schema.org JobPosting structured data, or a tool on an MCP server.
 * Every request goes through `safeFetch` (SSRF-guarded, time- and size-limited). All of them end in
 * the same RawPosting → normalization → provenance pipeline as every other source (spec §46).
 */
import { createHash } from "node:crypto";
import { applyMapping, toIsoDate, type MappingResult, type ResponseMapping } from "@/domain/jobslake/mapping";
import type { ConnectorAuth, PartnerConnection } from "@/domain/jobslake/partners";
import { htmlToText, type RawPosting } from "@/services/jobs/normalize";
import type { SearchCriteria } from "@/server/jobs/providers";
import { safeFetch } from "./safeFetch";

export interface JsonApiConfig {
  endpoint: string;
  /** Query-string parameter the source searches by (e.g. `q`). Empty = fetch everything and match locally. */
  queryParam?: string;
  locationParam?: string;
  /** Header the credential goes in, e.g. `Authorization` or `X-API-Key`. */
  credentialHeader?: string;
  /** Prefix before the secret, e.g. `Bearer `. */
  credentialPrefix?: string;
  /** Richer auth (API key header / bearer / key in the URL / OAuth 2.0 client credentials). Wins over `credentialHeader`. */
  auth?: ConnectorAuth;
  mapping: ResponseMapping;
}

export interface FeedConfig {
  url: string;
  defaultEmployer?: string;
  /** Partner feeds: how the credential is sent, and optional search/location parameters. */
  auth?: ConnectorAuth;
  queryParam?: string;
  locationParam?: string;
}

export interface StructuredConfig {
  url: string;
}

export interface McpConfig {
  endpoint: string;
  toolName: string;
  queryArgument: string;
  locationArgument?: string;
  credentialHeader?: string;
  credentialPrefix?: string;
  mapping: ResponseMapping;
}

export interface CustomFetchResult {
  raws: RawPosting[];
  /** Present for mapped sources, so the Test step can show field coverage. */
  mapping?: MappingResult;
  /** The first item, as the source sent it — for the mapping editor's sample preview. Never includes credentials. */
  sample?: unknown;
}

function authHeaders(header: string | undefined, prefix: string | undefined, secret: string | undefined): Record<string, string> {
  return header && secret ? { [header]: `${prefix ?? ""}${secret}` } : {};
}

const isEmployerUrl = (u: string) => !/(adzuna|indeed|linkedin|naukri|foundit|monster|monsterindia|timesjobs|glassdoor|jooble)\./i.test(u);

/* ----------------------------------------------------------------- auth */

const needsSetup = (message: string) => Object.assign(new Error(message), { code: "SOURCE_NEEDS_SETUP" });

type OAuth2 = Extract<ConnectorAuth, { type: "oauth2" }>;
/** Access tokens, in this server process's memory only — never stored, logged or returned. */
const tokens = new Map<string, { token: string; expiresAt: number }>();
const pendingTokens = new Map<string, Promise<string>>();
/** A token is renewed this long before it expires, so a request never goes out with one about to lapse. */
const TOKEN_SKEW_MS = 60_000;
/** When the token endpoint doesn't say how long a token lasts. */
const DEFAULT_TOKEN_TTL_MS = 5 * 60_000;

// Keyed by a hash that includes the secret, so a replaced client secret never reuses the old token.
const tokenKey = (a: OAuth2, secret: string) => createHash("sha256").update(`${a.tokenUrl}|${a.clientId}|${a.scope ?? ""}|${a.clientAuth ?? "basic"}|${secret}`).digest("hex");

async function requestToken(a: OAuth2, secret: string, timeoutMs: number): Promise<{ token: string; expiresAt: number }> {
  const form = new URLSearchParams({ grant_type: "client_credentials" });
  if (a.scope) form.set("scope", a.scope);
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  if ((a.clientAuth ?? "basic") === "basic") headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(a.clientId)}:${encodeURIComponent(secret)}`).toString("base64")}`;
  else {
    form.set("client_id", a.clientId);
    form.set("client_secret", secret);
  }
  // No redirects: the client secret is only ever sent to the token URL the admin entered.
  const res = await safeFetch(a.tokenUrl, { method: "POST", body: form.toString(), headers, timeoutMs, maxBytes: 64 * 1024, maxRedirects: 0 });
  // The response body is never quoted: a token endpoint may echo what it was sent.
  if (res.status === 400 || res.status === 401 || res.status === 403) throw needsSetup(`The token endpoint rejected the client credentials (${res.status})`);
  if (res.status >= 400) throw new Error(`The token endpoint responded ${res.status}`);
  let body: { access_token?: unknown; expires_in?: unknown };
  try {
    body = JSON.parse(res.text);
  } catch {
    throw new Error("The token endpoint didn't return JSON");
  }
  if (typeof body.access_token !== "string" || !body.access_token) throw new Error("The token endpoint returned no access token");
  const ttl = Number(body.expires_in);
  return { token: body.access_token, expiresAt: Date.now() + (Number.isFinite(ttl) && ttl > 0 ? ttl * 1000 : DEFAULT_TOKEN_TTL_MS) };
}

/** OAuth 2.0 client credentials (RFC 6749 §4.4): one token per client, reused until shortly before it expires. */
export async function oauth2Token(a: OAuth2, secret: string, timeoutMs = 10_000): Promise<string> {
  const key = tokenKey(a, secret);
  const hit = tokens.get(key);
  if (hit && hit.expiresAt - TOKEN_SKEW_MS > Date.now()) return hit.token;
  // Concurrent searches share one token request.
  let pending = pendingTokens.get(key);
  if (!pending) {
    pending = requestToken(a, secret, timeoutMs)
      .then((t) => {
        tokens.set(key, t);
        return t.token;
      })
      .finally(() => pendingTokens.delete(key));
    pendingTokens.set(key, pending);
  }
  return pending;
}

/** Drop a token the partner refused, so the next call asks for a new one. */
export function forgetOAuth2Token(a: OAuth2, secret: string) {
  tokens.delete(tokenKey(a, secret));
}

/** Tests only. */
export function __clearTokenCache() {
  tokens.clear();
  pendingTokens.clear();
}

interface ResolvedAuth {
  headers: Record<string, string>;
  query: Record<string, string>;
}

/** Where the secret goes for one request. Throws "needs setup" when there's no secret to send. */
async function resolveAuth(a: ConnectorAuth, secret: string | undefined, timeoutMs: number): Promise<ResolvedAuth> {
  if (!secret) throw needsSetup("The partner credential is missing.");
  switch (a.type) {
    case "header":
      return { headers: { [a.header]: `${a.prefix ?? ""}${secret}` }, query: {} };
    case "bearer":
      return { headers: { authorization: `Bearer ${secret}` }, query: {} };
    case "query":
      return { headers: {}, query: { [a.param]: secret } };
    case "oauth2":
      return { headers: { authorization: `Bearer ${await oauth2Token(a, secret, timeoutMs)}` }, query: {} };
  }
}

interface GetTarget {
  endpoint: string;
  queryParam?: string;
  locationParam?: string;
  auth?: ConnectorAuth;
  /** Header auth for admin-added JSON APIs (kept as it was). */
  credentialHeader?: string;
  credentialPrefix?: string;
}

/** One authenticated GET; an OAuth token the source refuses is renewed once. */
async function authedGet(t: GetTarget, c: SearchCriteria | undefined, secret: string | undefined, timeoutMs: number) {
  const call = async () => {
    const auth = t.auth ? await resolveAuth(t.auth, secret, timeoutMs) : { headers: authHeaders(t.credentialHeader, t.credentialPrefix, secret), query: {} };
    const url = new URL(t.endpoint);
    if (t.queryParam && c?.query) url.searchParams.set(t.queryParam, c.query);
    if (t.locationParam && c?.locations[0]) url.searchParams.set(t.locationParam, c.locations[0]);
    for (const [k, v] of Object.entries(auth.query)) url.searchParams.set(k, v);
    return safeFetch(url.toString(), { timeoutMs, headers: auth.headers });
  };
  const res = await call();
  if (res.status === 401 && t.auth?.type === "oauth2" && secret) {
    forgetOAuth2Token(t.auth, secret);
    return call();
  }
  return res;
}

/** Defence in depth: whatever went wrong, the message that leaves here never contains the secret. */
function scrubbed(e: unknown, secret: string | undefined): unknown {
  if (!secret || secret.length < 4 || !(e instanceof Error)) return e;
  const forms = [secret, encodeURIComponent(secret), new URLSearchParams({ k: secret }).toString().slice(2)];
  if (!forms.some((f) => e.message.includes(f))) return e;
  const message = forms.reduce((m, f) => m.split(f).join("••••"), e.message);
  return Object.assign(new Error(message), { name: e.name, code: (e as { code?: string }).code });
}

function fromMapped(result: MappingResult): RawPosting[] {
  return result.items
    .filter((i) => i.title && i.applyUrl)
    .map((i) => ({
      externalId: i.sourceJobId || i.applyUrl,
      title: i.title,
      company: i.employer,
      location: i.location,
      remote: i.remote ?? /remote/i.test(i.location),
      description: i.description,
      postedAt: toIsoDate(i.postedAt),
      applyUrl: i.applyUrl,
      salaryMin: i.salaryMin ?? null,
      salaryMax: i.salaryMax ?? null,
      currency: i.currency ?? null,
      employerSite: isEmployerUrl(i.applyUrl),
    }));
}

/* ------------------------------------------------------------ JSON API */

export async function fetchJsonApi(cfg: JsonApiConfig, c: SearchCriteria, secret?: string, timeoutMs = 10_000): Promise<CustomFetchResult> {
  const res = await authedGet(cfg, c, secret, timeoutMs);
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`The source rejected the credentials (${res.status})`), { code: "SOURCE_NEEDS_SETUP" });
  if (res.status >= 400) throw new Error(`The source responded ${res.status}`);
  let json: unknown;
  try {
    json = JSON.parse(res.text);
  } catch {
    throw new Error("The source didn't return JSON");
  }
  const mapping = applyMapping(json, cfg.mapping);
  return { raws: fromMapped(mapping), mapping, sample: firstItem(json, cfg.mapping.itemsPath) };
}

function firstItem(json: unknown, path: string) {
  const parts = path ? path.split(".") : [];
  let cur: unknown = json;
  for (const p of parts) cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[p] : undefined;
  return Array.isArray(cur) ? cur[0] : undefined;
}

/* ---------------------------------------------------------------- feeds */

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<(?:[a-z]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[a-z]+:)?${name}>`, "i"));
  return m ? m[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1").trim() : "";
};
const attr = (xml: string, name: string, a: string) => xml.match(new RegExp(`<${name}\\b[^>]*\\b${a}="([^"]+)"`, "i"))?.[1] ?? "";

/**
 * RSS 2.0 `<item>`, Atom `<entry>`, and the common XML job-feed `<job>` element (title, url,
 * company, city/state/country, date, referencenumber). Deliberately small: title, link,
 * description, date, id, employer, location.
 */
export function parseFeed(xml: string, defaultEmployer?: string): RawPosting[] {
  const blocks = [...xml.matchAll(/<(item|entry|job)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  return blocks
    .map((b) => {
      const link = tag(b, "link") || attr(b, "link", "href") || tag(b, "url") || tag(b, "applyurl");
      const title = htmlToText(tag(b, "title"));
      const company = htmlToText(tag(b, "company") || tag(b, "employer") || tag(b, "author") || tag(b, "name")) || defaultEmployer || "";
      const place = [tag(b, "city"), tag(b, "state"), tag(b, "country")].filter(Boolean).join(", ");
      return {
        externalId: tag(b, "guid") || tag(b, "id") || tag(b, "referencenumber") || link,
        title,
        company,
        location: htmlToText(tag(b, "location") || tag(b, "region") || place),
        description: tag(b, "description") || tag(b, "summary") || tag(b, "content") || tag(b, "encoded"),
        postedAt: toIsoDate(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "date") || tag(b, "dateposted")),
        applyUrl: link,
        employerSite: isEmployerUrl(link),
      };
    })
    .filter((r) => r.title && /^https?:\/\//.test(r.applyUrl));
}

export async function fetchFeed(cfg: FeedConfig, timeoutMs = 10_000, secret?: string, c?: SearchCriteria): Promise<CustomFetchResult> {
  const res = cfg.auth ? await authedGet({ endpoint: cfg.url, queryParam: cfg.queryParam, locationParam: cfg.locationParam, auth: cfg.auth }, c, secret, timeoutMs) : await safeFetch(cfg.url, { timeoutMs });
  if (res.status === 401 || res.status === 403) throw needsSetup(`The feed rejected the credentials (${res.status})`);
  if (res.status >= 400) throw new Error(`The feed responded ${res.status}`);
  if (!/<(rss|feed)\b/i.test(res.text) && !/<job\b/i.test(res.text)) throw new Error("That URL isn't an RSS, Atom or XML job feed");
  const raws = parseFeed(res.text, cfg.defaultEmployer);
  return { raws, sample: raws[0] ? { title: raws[0].title, link: raws[0].applyUrl } : undefined };
}

/* ------------------------------------------------------- partner portals */

/**
 * A partner portal's own API or feed, exactly as its partnership hands it over: an endpoint, a
 * delivery format and a credential. Same pipeline as every other custom source — JSON goes through
 * the response mapping, XML through the feed parser — and when the partner takes no search
 * parameters the full feed is filtered locally (`finish` → matchesQuery / matchesLocations).
 */
export async function fetchPartner(conn: PartnerConnection, c: SearchCriteria, secret: string | undefined, timeoutMs = 12_000): Promise<CustomFetchResult> {
  try {
    if (conn.format === "json_api") return await fetchJsonApi({ endpoint: conn.endpoint, queryParam: conn.queryParam, locationParam: conn.locationParam, auth: conn.auth, mapping: conn.mapping ?? { itemsPath: "", fields: {} } }, c, secret, timeoutMs);
    return await fetchFeed({ url: conn.endpoint, defaultEmployer: conn.defaultEmployer, auth: conn.auth, queryParam: conn.queryParam, locationParam: conn.locationParam }, timeoutMs, secret, c);
  } catch (e) {
    throw scrubbed(e, secret);
  }
}

/* ---------------------------------------------------- structured data */

type Ld = Record<string, unknown>;
const asArr = <T,>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const s = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

function jobPostings(node: unknown): Ld[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(jobPostings);
  const n = node as Ld;
  const types = asArr(n["@type"] as string | string[]);
  return [...(types.includes("JobPosting") ? [n] : []), ...jobPostings(n["@graph"]), ...(n.itemListElement ? asArr(n.itemListElement as Ld[]).flatMap((x) => jobPostings((x as Ld).item ?? x)) : [])];
}

/** schema.org JobPosting from a page's JSON-LD — structured data the employer publishes for machines. */
export function parseJobPostingLd(html: string, pageUrl: string): RawPosting[] {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const postings = scripts.flatMap((txt) => {
    try {
      return jobPostings(JSON.parse(txt.trim()));
    } catch {
      return [];
    }
  });
  return postings.map((p) => {
    const org = (p.hiringOrganization ?? {}) as Ld;
    const locs = asArr(p.jobLocation as Ld | Ld[]).map((l) => {
      const a = ((l as Ld).address ?? {}) as Ld;
      return [s(a.addressLocality), s(a.addressRegion), s((a.addressCountry as Ld)?.name ?? a.addressCountry)].filter(Boolean).join(", ");
    });
    const remote = s(p.jobLocationType).toUpperCase() === "TELECOMMUTE";
    const salary = ((p.baseSalary as Ld)?.value ?? {}) as Ld;
    const url = s(p.url) || pageUrl;
    return {
      externalId: s((p.identifier as Ld)?.value ?? p.identifier) || url,
      title: htmlToText(s(p.title)),
      company: s(org.name),
      companyDomain: s(org.sameAs) ? new URL(s(org.sameAs)).hostname.replace(/^www\./, "") : undefined,
      location: [locs.filter(Boolean).join(" · "), remote ? "Remote" : ""].filter(Boolean).join(" · "),
      remote,
      description: s(p.description),
      postedAt: toIsoDate(s(p.datePosted)),
      applyUrl: url,
      salaryMin: Number(salary.minValue ?? salary.value) || null,
      salaryMax: Number(salary.maxValue ?? salary.value) || null,
      currency: s((p.baseSalary as Ld)?.currency) || null,
      employerSite: isEmployerUrl(url),
    };
  });
}

export async function fetchStructured(cfg: StructuredConfig, timeoutMs = 10_000): Promise<CustomFetchResult> {
  const res = await safeFetch(cfg.url, { timeoutMs });
  if (res.status >= 400) throw new Error(`The page responded ${res.status}`);
  const raws = parseJobPostingLd(res.text, res.finalUrl).filter((r) => r.title && /^https?:\/\//.test(r.applyUrl));
  if (!raws.length) throw new Error("No schema.org JobPosting data found on that page");
  return { raws, sample: { title: raws[0].title, company: raws[0].company, url: raws[0].applyUrl } };
}

/* ------------------------------------------------------------------ MCP */

function parseRpc(contentType: string, text: string): { result?: unknown; error?: { message?: string } } {
  if (/text\/event-stream/i.test(contentType)) {
    const data = text
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim());
    for (const d of data.reverse()) {
      try {
        const msg = JSON.parse(d);
        if (msg.result !== undefined || msg.error) return msg;
      } catch {
        /* keep looking */
      }
    }
    return { error: { message: "No JSON-RPC response in the event stream" } };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: "The MCP server didn't return JSON-RPC" } };
  }
}

/**
 * Calls one tool on a remote MCP server over Streamable HTTP (initialize → initialized →
 * tools/call). MCP is only a transport: it doesn't grant permission to the data behind it (§45).
 */
export async function fetchMcp(cfg: McpConfig, c: SearchCriteria, secret?: string, timeoutMs = 12_000): Promise<CustomFetchResult> {
  const base = { ...authHeaders(cfg.credentialHeader, cfg.credentialPrefix, secret), accept: "application/json, text/event-stream" };
  const init = await safeFetch(cfg.endpoint, { method: "POST", timeoutMs, headers: base, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "JobsLake", version: "1.0" } } }) });
  if (init.status === 401 || init.status === 403) throw Object.assign(new Error(`The MCP server rejected the credentials (${init.status})`), { code: "SOURCE_NEEDS_SETUP" });
  const initMsg = parseRpc(init.contentType, init.text);
  if (init.status >= 400 || initMsg.error) throw new Error(`MCP initialize failed: ${initMsg.error?.message ?? init.status}`);
  const session = init.headers.get("mcp-session-id");
  const headers = { ...base, ...(session ? { "mcp-session-id": session } : {}) };
  await safeFetch(cfg.endpoint, { method: "POST", timeoutMs, headers, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }).catch(() => undefined);
  const args: Record<string, string> = { [cfg.queryArgument]: c.query };
  if (cfg.locationArgument && c.locations[0]) args[cfg.locationArgument] = c.locations[0];
  const call = await safeFetch(cfg.endpoint, { method: "POST", timeoutMs, headers, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: cfg.toolName, arguments: args } }) });
  const msg = parseRpc(call.contentType, call.text);
  if (call.status >= 400 || msg.error) throw new Error(`MCP tool call failed: ${msg.error?.message ?? call.status}`);
  const result = (msg.result ?? {}) as { structuredContent?: unknown; content?: { type: string; text?: string }[]; isError?: boolean };
  if (result.isError) throw new Error(`The MCP tool reported an error: ${result.content?.find((x) => x.type === "text")?.text?.slice(0, 160) ?? "unknown"}`);
  let payload: unknown = result.structuredContent;
  if (payload === undefined) {
    const text = result.content?.find((x) => x.type === "text")?.text ?? "";
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("The MCP tool didn't return JSON job data");
    }
  }
  const mapping = applyMapping(payload, cfg.mapping);
  return { raws: fromMapped(mapping), mapping, sample: firstItem(payload, cfg.mapping.itemsPath) };
}
