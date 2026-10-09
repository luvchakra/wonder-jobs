/**
 * Partner job portals (LinkedIn, Indeed, Naukri, foundit, TimesJobs): what JobsLake knows about each
 * before a partnership exists, and the pure rules a partner connection has to satisfy.
 *
 * None of these portals has an open job-search API. Access comes from a signed partnership or
 * data-licensing agreement, after which the portal hands over an endpoint and credentials. So a
 * preset only pre-fills what is publicly known (name, geography, where its partner programme is
 * documented) — never an endpoint, a field name or a response shape we haven't been given.
 * Scraping them is not an option (scraper governance, spec §46).
 */
import { checkDestination } from "./ssrf";
import type { ResponseMapping } from "./mapping";

export type PartnerId = "linkedin" | "indeed" | "naukri" | "foundit" | "timesjobs";
export type PartnerFormat = "json_api" | "feed";
export type PartnerAuthType = "header" | "bearer" | "query" | "oauth2";

/** How the credential reaches the partner. The secret itself is never part of this. */
export type ConnectorAuth =
  /** An API key in a header the partner names, e.g. `X-API-Key`, with an optional prefix. */
  | { type: "header"; header: string; prefix?: string }
  /** `Authorization: Bearer <token>`. */
  | { type: "bearer" }
  /** The key as a query-string parameter, e.g. `?api_key=…`. */
  | { type: "query"; param: string }
  /** OAuth 2.0 client credentials: the stored secret is the client secret; the client id isn't secret. */
  | { type: "oauth2"; tokenUrl: string; clientId: string; scope?: string; clientAuth?: "basic" | "body" };

export interface PartnerConnection {
  format: PartnerFormat;
  /** https only; checked against the SSRF policy when saved and again at every request. */
  endpoint: string;
  /** Query-string name the partner searches by. Empty = a full feed that JobsLake filters locally. */
  queryParam?: string;
  locationParam?: string;
  auth: ConnectorAuth;
  /** JSON API only: where the jobs are and which field is which (domain/jobslake/mapping.ts). */
  mapping?: ResponseMapping;
  /** Feed only: the employer when an item doesn't name one. */
  defaultEmployer?: string;
}

/** The admin's statement, at activation, that a signed agreement permits this use. */
export interface PartnerAgreement {
  confirmedBy: string;
  confirmedAt: string;
  /** Contract id, ticket or note the admin gave — free text, optional. */
  reference?: string;
}

export interface PartnerPreset {
  id: PartnerId;
  name: string;
  geography: string[];
  /** Where the partner programme is documented, only when we're sure it exists. */
  docsUrl?: string;
  /** The partner programme's own name, when there is a public one. */
  programme?: string;
  /** Format the admin form starts on; the partner's own spec decides. */
  format: PartnerFormat;
  /** Pre-selected only when the portal's partner APIs publicly document it. */
  authType?: PartnerAuthType;
  /** One line shown above the form. */
  hint: string;
}

const CONTACT = "No public partner API spec — ask their business development / data partnerships team for the endpoint, format and credentials, then enter them here.";

export const PARTNER_PRESETS: PartnerPreset[] = [
  {
    id: "linkedin",
    name: "LinkedIn",
    geography: ["global"],
    programme: "LinkedIn Talent Solutions partner programme",
    docsUrl: "https://learn.microsoft.com/linkedin/talent/",
    format: "json_api",
    authType: "oauth2",
    hint: "LinkedIn's partner APIs use OAuth 2.0 client credentials. Its public partner APIs post jobs into LinkedIn; reading listings needs a separate data agreement — enter the endpoint they give you.",
  },
  {
    id: "indeed",
    name: "Indeed",
    geography: ["global"],
    programme: "Indeed partner programme",
    docsUrl: "https://docs.indeed.com/",
    format: "json_api",
    authType: "oauth2",
    hint: "Indeed's partner APIs use OAuth 2.0 client credentials. Its public partner APIs send jobs to Indeed; the old Publisher search API is closed — enter the endpoint a data agreement gives you.",
  },
  { id: "naukri", name: "Naukri", geography: ["IN"], format: "json_api", hint: CONTACT },
  { id: "foundit", name: "foundit", geography: ["IN"], format: "json_api", hint: CONTACT },
  { id: "timesjobs", name: "TimesJobs", geography: ["IN"], format: "json_api", hint: CONTACT },
];

export const partnerPreset = (sourceId: string): PartnerPreset | undefined => PARTNER_PRESETS.find((p) => `partner_${p.id}` === sourceId);

export const PARTNER_STATUS_REASON = "Needs a partner agreement and credentials";

export const AUTH_LABEL: Record<PartnerAuthType, string> = {
  header: "API key in a header",
  bearer: "Bearer token",
  query: "API key in the URL",
  oauth2: "OAuth 2.0 client credentials",
};

export const FORMAT_LABEL: Record<PartnerFormat, string> = { json_api: "JSON API", feed: "XML / RSS feed" };

/** Headers a partner credential may never be put in — they'd change the request itself. */
const RESERVED_HEADERS = new Set(["host", "content-length", "content-type", "transfer-encoding", "connection", "cookie", "user-agent", "accept"]);

export interface ConnectionIssue {
  field: string;
  problem: string;
}

/**
 * The semantic checks a partner connection must pass before it's stored (the shape is checked by
 * the admin API's schema). Every URL goes through the SSRF policy: https only, public hostnames.
 */
export function checkPartnerConnection(c: PartnerConnection): ConnectionIssue[] {
  const issues: ConnectionIssue[] = [];
  const url = (field: string, v: string) => {
    const d = checkDestination(v);
    if (!d.ok) issues.push({ field, problem: d.reason });
  };
  url("endpoint", c.endpoint);
  if (c.format === "json_api" && !c.mapping) issues.push({ field: "mapping", problem: "A JSON API needs a response mapping." });
  const a = c.auth;
  if (a.type === "header" && RESERVED_HEADERS.has(a.header.toLowerCase())) issues.push({ field: "auth.header", problem: `${a.header} can't carry a credential.` });
  if (a.type === "query" && (a.param === c.queryParam || a.param === c.locationParam)) issues.push({ field: "auth.param", problem: "The key parameter must differ from the search and location parameters." });
  if (a.type === "oauth2") url("auth.tokenUrl", a.tokenUrl);
  if (c.queryParam && c.queryParam === c.locationParam) issues.push({ field: "locationParam", problem: "The location parameter must differ from the search parameter." });
  return issues;
}

export type PartnerStep = "connection" | "credential" | "test" | "agreement";

export interface PartnerReadiness {
  /** The first step still to do, or null when it's active. */
  next: PartnerStep | null;
  checks: { step: PartnerStep; label: string; ok: boolean; detail?: string }[];
}

/** The path from "Do not use" to Active, as a checklist computed from what's actually stored. */
export function partnerReadiness(s: { connection?: PartnerConnection; credentialPresent: boolean; lastTest?: { ok: boolean; at: string }; agreement?: PartnerAgreement; active: boolean }, now = Date.now()): PartnerReadiness {
  const fresh = !!s.lastTest?.ok && now - Date.parse(s.lastTest.at) < 24 * 3_600_000;
  const checks: PartnerReadiness["checks"] = [
    { step: "connection", label: "Partner endpoint saved", ok: !!s.connection, detail: s.connection ? `${FORMAT_LABEL[s.connection.format]} · ${AUTH_LABEL[s.connection.auth.type]}` : undefined },
    { step: "credential", label: "Credential stored (encrypted)", ok: s.credentialPresent },
    { step: "test", label: "Passing test in the last 24 hours", ok: fresh || s.active },
    { step: "agreement", label: "Signed agreement confirmed", ok: !!s.agreement && s.active, detail: s.agreement ? `by ${s.agreement.confirmedBy}` : "Confirmed when you activate" },
  ];
  return { next: s.active ? null : (checks.find((c) => !c.ok)?.step ?? null), checks };
}
