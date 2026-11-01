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
