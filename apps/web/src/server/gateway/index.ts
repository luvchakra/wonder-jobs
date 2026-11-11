import { createGateway, type Gateway } from "../../../../data-gateway/src/handler.mjs";
import { SupabaseGatewayStore } from "./store";
import { gatewayAdminToken, gatewayCursorSecret } from "./secrets";
import { prospectHooks } from "./prospectHooks";

/**
 * The hosted gateway (owner, 2026-10-31): the same API code as apps/data-gateway, served from this app at `/v1/...` and
 * collected on the GitHub Actions runner, with its state in Supabase. Its admin token and cursor secret are the
 * deployment's GATEWAY_ADMIN_TOKEN / GATEWAY_CURSOR_SECRET when set, else derived from SECRET_ENCRYPTION_KEY with Supabase
 * configured (secrets.ts, owner 2026-11-06); without either it answers 503.
 */
const g = globalThis as unknown as { __wlGateway?: { gateway: Gateway; store: SupabaseGatewayStore } };

export function hostedGateway(): { gateway: Gateway; store: SupabaseGatewayStore } | null {
  const env = process.env;
  const admin = gatewayAdminToken(env);
  const cursor = gatewayCursorSecret(env);
  if (!admin || !cursor) return null;
  if (!g.__wlGateway) {
    const store = new SupabaseGatewayStore();
    g.__wlGateway = { store, gateway: createGateway({ store, env: { ...env, GATEWAY_ADMIN_TOKEN: admin, GATEWAY_CURSOR_SECRET: cursor, GATEWAY_COLLECTORS_ENABLED: "1" }, storage: "supabase", prospectHooks }) };
  }
  return g.__wlGateway;
}
