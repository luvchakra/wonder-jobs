/** The gateway's state, as the store holds it. The collector and the API read and change it; nothing else does. */
export interface GatewayState {
  version: 1;
  sources: Record<string, unknown>[];
  listings: Record<string, unknown>[];
  consumers: Record<string, unknown>[];
  keys: Record<string, unknown>[];
  usage: Record<string, unknown>[];
  audits: Record<string, unknown>[];
}
export function initial(): GatewayState;
