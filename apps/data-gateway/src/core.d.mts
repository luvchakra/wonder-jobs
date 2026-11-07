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
