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
  collectDue(): Promise<CollectOutcome[]>;
}
export function createGateway(options: { store: GatewayStore; env?: Record<string, string | undefined>; storage?: string }): Gateway;
