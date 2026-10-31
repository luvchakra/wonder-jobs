import { createGateway, type Gateway } from "../../../../data-gateway/src/handler.mjs";
import { SupabaseGatewayStore } from "./store";

/**
 * The hosted gateway (owner, 2026-10-31): the same API code as apps/data-gateway, served from this app at `/v1/...` and
 * collected by a daily Vercel Cron, with its state in Supabase. It answers 503 until GATEWAY_ADMIN_TOKEN and
 * GATEWAY_CURSOR_SECRET are set, so shipping this code turns nothing on.
 */
const g = globalThis as unknown as { __wlGateway?: { gateway: Gateway; store: SupabaseGatewayStore } };

export function hostedGateway(): { gateway: Gateway; store: SupabaseGatewayStore } | null {
  const env = process.env;
  if (!env.GATEWAY_ADMIN_TOKEN || !env.GATEWAY_CURSOR_SECRET) return null;
  if (!g.__wlGateway) {
    const store = new SupabaseGatewayStore();
    g.__wlGateway = { store, gateway: createGateway({ store, env: { ...env, GATEWAY_COLLECTORS_ENABLED: "1" }, storage: "supabase" }) };
  }
  return g.__wlGateway;
}
