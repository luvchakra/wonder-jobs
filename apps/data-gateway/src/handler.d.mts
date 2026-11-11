import type { GatewayState } from "./core.mjs";

/** What the gateway needs from wherever its state lives (a file, or Supabase). */
export interface GatewayStore {
  read<T>(fn: (state: GatewayState) => T): Promise<T>;
  change<T>(fn: (state: GatewayState) => T): Promise<T>;
  lazy(fn: (state: GatewayState) => void): void;
  flush(): Promise<unknown>;
}
export interface CollectOutcome { sourceId: string; ok: boolean; code?: string; discovered?: number; valid?: number }
export type CollectProgress = { type: "due"; ids: string[] } | { type: "start"; sourceId: string } | ({ type: "done" } & CollectOutcome);
export interface Gateway {
  handle(request: Request): Promise<Response>;
  /** Collects every active source that is due; a source feeding only `skipModules` waits. */
  /** `floorMinutes`: no source collected more often than this (the scheduled run's budget). */
  /** `onProgress`: the due sources once, then each source's start and outcome, as they happen. */
  collectDue(budgetMs?: number, skipModules?: string[], floorMinutes?: number, onProgress?: ((e: CollectProgress) => void) | null): Promise<CollectOutcome[]>;
  /** Collects one active source now (or only tests it). Throws with a `code` when it can't. */
  collectOne(sourceId: string, testOnly?: boolean, budgetMs?: number): Promise<{ ok: boolean; discovered: number; valid: number; crawl?: unknown }>;
}
/** One fact the host's company directory holds about an organisation, with where it came from. */
export interface CompanyFactEntry { field: "industry" | "employeeRange" | "hq"; value: string; source: { provider: string; name: string; url?: string | null; termsPending?: boolean }; observedAt?: string | null }
/** What the host adds to the prospect routes. */
export interface ProspectHooks {
  /** What the company directory knows about an organisation, cheapest and most reliable first; [] when nothing. */
  companyFacts?(q: { domain: string; name: string }): Promise<CompanyFactEntry[]>;
  /** Tests only: a stand-in for reading the organisation's own site. */
  readSite?(domain: string): Promise<{ status: string; fields: Record<string, { value: string; url: string }>; mailboxes: { email: string; url: string }[]; pages: string[] }>;
}
export function createGateway(options: { store: GatewayStore; env?: Record<string, string | undefined>; storage?: string; prospectHooks?: ProspectHooks }): Gateway;
/** The one country a source covers (its geography, or its site's country domain), or null. */
export function sourceCountry(source: { geography?: string[]; url?: string }): string | null;
/** The place with its country after it, unless it already names it. */
export function withCountry(location: string, code: string | null): string;
