import type { GatewayState } from "./core.mjs";

/** What the gateway needs from wherever its state lives (a file, or Supabase). */
export interface GatewayStore {
  read<T>(fn: (state: GatewayState) => T): Promise<T>;
  change<T>(fn: (state: GatewayState) => T): Promise<T>;
  lazy(fn: (state: GatewayState) => void): void;
  flush(): Promise<unknown>;
}
export interface CollectOutcome { sourceId: string; ok: boolean; code?: string; discovered?: number; valid?: number }
export interface Gateway {
  handle(request: Request): Promise<Response>;
  /** Collects every active source that is due; a source feeding only `skipModules` waits. */
  collectDue(budgetMs?: number, skipModules?: string[]): Promise<CollectOutcome[]>;
  /** Collects one active source now (or only tests it). Throws with a `code` when it can't. */
  collectOne(sourceId: string, testOnly?: boolean): Promise<{ ok: boolean; discovered: number; valid: number; crawl?: unknown }>;
}
export function createGateway(options: { store: GatewayStore; env?: Record<string, string | undefined>; storage?: string }): Gateway;
/** The one country a source covers (its geography, or its site's country domain), or null. */
export function sourceCountry(source: { geography?: string[]; url?: string }): string | null;
/** The place with its country after it, unless it already names it. */
export function withCountry(location: string, code: string | null): string;
