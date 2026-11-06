/**
 * The hosted gateway's secrets, derived instead of set (owner, 2026-11-06: "decommission vercel environment variables as
 * much as possible"). The gateway once ran as a separate app and needed its own admin token, cursor secret and an API
 * key for WorksLake to read it; inside this app they can all come from SECRET_ENCRYPTION_KEY, which the site and the
 * GitHub collection runner already share. A deployment variable of the same name still wins, so a deployment that
 * sets them keeps exactly what it had.
 *
 * Each is an HMAC-SHA256 of the encryption key with its own label: separate values, none of which reveals the key or the
 * others. The derived API key is registered in the gateway's key table (by its digest, as `issueKey` stores keys) the
 * first time it's used.
 */
import { createHmac } from "node:crypto";
import { digestKey, MODULES } from "../../../../data-gateway/src/core.mjs";
import { siteUrl } from "@/lib/siteUrl";

type Env = Record<string, string | undefined>;

function master(env: Env): string | undefined {
  const k = env.SECRET_ENCRYPTION_KEY ?? env.WONDER_SECRET_KEY;
  return k && k.length >= 32 ? k : undefined;
}

function derive(env: Env, label: string): string | undefined {
  const m = master(env);
  return m ? createHmac("sha256", m).update(`wonderworks:${label}:v1`).digest("hex") : undefined;
}

/** Supabase is configured: the gateway keeps its state there, so a derived gateway only turns on with it. */
const supabaseConfigured = (env: Env) => !!(env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL) && !!(env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY);
const explicit = (v: string | undefined) => v?.trim() || undefined;

export function gatewayAdminToken(env: Env = process.env): string | undefined {
  return explicit(env.GATEWAY_ADMIN_TOKEN) ?? (supabaseConfigured(env) ? derive(env, "gateway-admin") : undefined);
}

export function gatewayCursorSecret(env: Env = process.env): string | undefined {
  return explicit(env.GATEWAY_CURSOR_SECRET) ?? (supabaseConfigured(env) ? derive(env, "gateway-cursor") : undefined);
}

/** The hosted gateway can run: both its secrets exist (set, or derived with Supabase configured). */
export function gatewayConfigured(env: Env = process.env): boolean {
  return !!gatewayAdminToken(env) && !!gatewayCursorSecret(env);
}

/** Whether the API key WorksLake reads the gateway with is derived here (none set), so it must be registered. */
export const gatewayKeyDerived = (env: Env = process.env) => !explicit(env.WORKSLAKE_GATEWAY_API_KEY) && gatewayConfigured(env);

/** The API key WorksLake reads the gateway with: the deployment's, else derived (`wlg_` + 64 hex, as issued keys look). */
export function gatewayApiKey(env: Env = process.env): string | undefined {
  const set = explicit(env.WORKSLAKE_GATEWAY_API_KEY);
  if (set) return set;
  const d = gatewayConfigured(env) ? derive(env, "gateway-key") : undefined;
  return d ? `wlg_${d}` : undefined;
}

/** Where the gateway answers: the deployment's setting, else this site itself (it runs inside the app, at /v1). */
export function gatewayUrl(env: Env = process.env): string {
  const set = explicit(env.WORKSLAKE_GATEWAY_URL);
  if (set) return set.replace(/\/$/, "");
  return gatewayConfigured(env) ? siteUrl().origin : "";
}

/** WorksLake reads the gateway's listings (its works_gateway_<module> sources): on when the gateway is, unless set to "0". */
export function gatewayBridgeOn(env: Env = process.env): boolean {
  const flag = env.WORKSLAKE_GATEWAY_ENABLED?.trim();
  if (flag === "1") return true;
  if (flag === "0") return false;
  return gatewayConfigured(env);
}

interface KeyStore {
  change: <T>(fn: (s: { keys: { hash: string; revokedAt: string | null }[] } & Record<string, unknown>) => T) => Promise<T>;
}

let registered: Promise<void> | null = null;

/**
 * Makes sure the derived API key is in the gateway's key table, once per process: a record with its digest, for the
 * workslake consumer, reading every module. Nothing to do when the deployment sets the key (it was issued as before).
 */
export function ensureGatewayKey(store: KeyStore, env: Env = process.env, now = new Date()): Promise<void> {
  if (!gatewayKeyDerived(env)) return Promise.resolve();
  const key = gatewayApiKey(env)!;
  registered ??= store
    .change((s) => {
      const hash = digestKey(key);
      const keys = s.keys as Record<string, unknown>[];
      if (keys.some((k) => k.hash === hash && !k.revokedAt)) return;
      const consumers = (s.consumers ?? []) as { id: string }[];
      if (!consumers.some((c) => c.id === "workslake")) consumers.push({ id: "workslake", name: "workslake", createdAt: now.toISOString() } as never);
      keys.push({ id: `key_derived_${hash.slice(0, 12)}`, consumerId: "workslake", hash, prefix: key.slice(0, 12), scopes: MODULES.map((m) => `read:${m}`), expiresAt: null, createdAt: now.toISOString(), revokedAt: null });
    })
    .then(() => undefined)
    .catch((e: unknown) => {
      registered = null;
      throw e;
    });
  return registered;
}

/** Tests only. */
export function __resetGatewayKeyRegistration() {
  registered = null;
}
