/** The gateway's state, as the store holds it. The collector and the API read and change it; nothing else does. */
export interface GatewayState {
  version: 1;
  sources: Record<string, unknown>[];
  listings: Record<string, unknown>[];
  consumers: Record<string, unknown>[];
  keys: Record<string, unknown>[];
  usage: Record<string, unknown>[];
  audits: Record<string, unknown>[];
  runs: Record<string, unknown>[];
  /** Prospect data settings (outside consumers, tenant quotas, the paid cap); absent ones take their defaults. */
  settings?: Record<string, unknown>;
}
export function initial(): GatewayState;

/** A gateway listing as search returns it (attributes hold a source's extra fields, e.g. an event's dates). */
export interface GatewayListing {
  id: string;
  module: string;
  sourceId: string;
  sourceName: string;
  sourceMethod: string;
  title: string;
  organization: string;
  location: string;
  description: string;
  canonicalUrl: string;
  publishedAt: string | null;
  observedAt: string;
  expiresAt: string;
  remote: boolean;
  attributes: Record<string, string | number | boolean>;
  status: string;
  /** A prospect dataset row's search tokens (category and contact marks); module listings have none. */
  tokens?: string;
}
export interface GatewaySearchResult {
  requestId: string;
  module: string;
  results: GatewayListing[];
  nextCursor: string | null;
  metadata: { totalReturned: number; matched: number; sourceCount: number; cacheStatus: string; asOf: string };
}
export function search(
  state: GatewayState,
  consumer: { id: string; consumerId: string; scopes: string[] },
  payload: { module: string; query?: string; locations?: string[]; limit?: number; cursor?: string },
  secret: string,
): GatewaySearchResult;
export const MODULES: readonly string[];
/** Prospect datasets (organisations, public outlets): served only by /v1/prospects/, never a module. */
export const PROSPECT_DATASETS: readonly string[];
export const PROSPECT_SCOPES: readonly string[];
/** What a listing is searched by: its words, plus a dataset row's tokens. */
export function listingText(listing: GatewayListing): string;
/** A prospect search's token filters: every `all` token, and one token of each `anyOf` group. */
export function matchesTokens(text: string, plan: { anyOf?: string[][]; all?: string[] }): boolean;
/** Copies a reviewed definition's outside-use flag, dataset bindings and evidence onto a registered source; returns the changed fields. */
export function reconcileSource(stored: Record<string, unknown>, definition: Record<string, unknown>): string[];
export const RECONCILED_FIELDS: readonly string[];
/** SHA-256 hex of an API key: how the gateway stores and finds keys. */
export function digestKey(key: string): string;

export interface SearchPlan { module: string; query: string; locations: string[]; limit: number; offset: number; fingerprint: string; sourceIds: string[] }
export function searchPlan(state: GatewayState, consumer: { id: string; consumerId: string; scopes: string[] }, payload: { module: string; query?: string; locations?: string[]; limit?: number; cursor?: string }, secret: string): SearchPlan;

export function queryWords(query: string): string[];
export function matchesWords(text: string, query: string): boolean;
/** Throws a 401 unless the header carries the admin token. */
export function requireAdmin(header: string | null | undefined, adminToken: string | undefined): void;
/** The API key record a request's Bearer key belongs to (live, not expired); throws a 401 otherwise. */
export function requireConsumer(store: { read<T>(fn: (state: any) => T): Promise<T> }, header: string | null | undefined): Promise<{ id: string; consumerId: string; scopes: string[] }>;
/** Throws unless the key may read the module. */
export function checkScope(key: { scopes: string[] }, module: string): void;
/** Text with email addresses, phone numbers and messaging handles removed (sources of people's public posts). */
export function scrubContacts(text: string): string;
/** Adds an entry to the audit trail, kept to its newest entries. */
export function pushAudit(state: GatewayState, entry: Record<string, unknown>): void;
