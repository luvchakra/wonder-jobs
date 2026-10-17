/**
 * Sign-in connections store (WJ-316). One row per (tenant, portal host); the password is encrypted with the same
 * AES-256-GCM secret store as BYOK keys (server/secrets.ts) and is decrypted only by `credentialFor`, which only the
 * cloud sign-in calls. Every read and write names the tenant explicitly — the table's RLS has no policies (CLAUDE.md).
 * Nothing here logs a password or returns one to a route.
 */
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type { ConnectionCreator, ConnectionStatus, PortalConnection } from "@/domain/connections/types";
import { portalHost } from "@/domain/connections/types";
import { decrypt, encrypt } from "./secrets";
import { getSupabaseAdmin, touchTenant } from "./supabase";

interface Row {
  id: string;
  tenant_id: string;
  host: string;
  provider: string | null;
  email: string;
  ciphertext: string;
  masked: string;
  status: ConnectionStatus;
  created_by: ConnectionCreator;
  created_at: string;
  last_used_at: string | null;
  last_result: string | null;
}

interface Store {
  list(t: string): Promise<Row[]>;
  byHost(t: string, host: string): Promise<Row | undefined>;
  upsert(row: Row): Promise<void>;
  update(t: string, id: string, patch: Partial<Pick<Row, "status" | "last_used_at" | "last_result">>): Promise<void>;
  remove(t: string, id: string): Promise<boolean>;
}

class MemoryStore implements Store {
  rows = new Map<string, Row>();
  async list(t: string) {
    return [...this.rows.values()].filter((r) => r.tenant_id === t);
  }
  async byHost(t: string, host: string) {
    return [...this.rows.values()].find((r) => r.tenant_id === t && r.host === host);
  }
  async upsert(row: Row) {
    const prev = await this.byHost(row.tenant_id, row.host);
    if (prev) this.rows.delete(prev.id);
    this.rows.set(row.id, row);
  }
  async update(t: string, id: string, patch: Partial<Row>) {
    const r = this.rows.get(id);
    if (r && r.tenant_id === t) this.rows.set(id, { ...r, ...patch });
  }
  async remove(t: string, id: string) {
    const r = this.rows.get(id);
    if (!r || r.tenant_id !== t) return false;
    return this.rows.delete(id);
  }
}

class SupabaseStore implements Store {
  private sb() {
    const sb = getSupabaseAdmin();
    if (!sb) throw new Error("Supabase is not configured");
    return sb.from("portal_connections");
  }
  async list(t: string) {
    const { data, error } = await this.sb().select("*").eq("tenant_id", t).order("created_at", { ascending: false });
    if (error) throw new Error(`Could not load sign-in connections: ${error.message}`);
    return (data ?? []) as Row[];
  }
  async byHost(t: string, host: string) {
    const { data, error } = await this.sb().select("*").eq("tenant_id", t).eq("host", host).maybeSingle();
    if (error) throw new Error(`Could not load the sign-in connection: ${error.message}`);
    return (data as Row | null) ?? undefined;
  }
  async upsert(row: Row) {
    await touchTenant(row.tenant_id);
    const { error } = await this.sb().upsert(row, { onConflict: "tenant_id,host" });
    if (error) throw new Error(`Could not save the sign-in connection: ${error.message}`);
  }
  async update(t: string, id: string, patch: Partial<Row>) {
    const { error } = await this.sb().update(patch).eq("tenant_id", t).eq("id", id);
    if (error) throw new Error(`Could not update the sign-in connection: ${error.message}`);
  }
  async remove(t: string, id: string) {
    const { data, error } = await this.sb().delete().eq("tenant_id", t).eq("id", id).select("id");
    if (error) throw new Error(`Could not remove the sign-in connection: ${error.message}`);
    return !!data?.length;
  }
}

const g = globalThis as unknown as { __wjConnections?: Store };
function store(): Store {
  return getSupabaseAdmin() ? new SupabaseStore() : (g.__wjConnections ??= new MemoryStore());
}
/** Tests only: start from an empty in-memory store. */
export function resetConnectionsForTests() {
  g.__wjConnections = new MemoryStore();
}

const mask = (pw: string) => `••••••••${pw.length > 12 ? pw.slice(-2) : ""}`;

function view(r: Row): PortalConnection {
  return { id: r.id, host: r.host, ...(r.provider ? { provider: r.provider } : {}), email: r.email, masked: r.masked, status: r.status, createdBy: r.created_by, createdAt: r.created_at, ...(r.last_used_at ? { lastUsedAt: r.last_used_at } : {}), ...(r.last_result ? { lastResult: r.last_result } : {}) };
}

export class ConnectionError extends Error {}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export async function listConnections(tenantId: string): Promise<PortalConnection[]> {
  return (await store().list(tenantId)).map(view);
}

/** The candidate's own sign-in, or one Wonder made: saved encrypted, replacing any earlier one for that portal. */
export async function saveConnection(tenantId: string, input: { host: string; email: string; password: string; provider?: string; createdBy: ConnectionCreator; status?: ConnectionStatus }): Promise<PortalConnection> {
  const host = portalHost(input.host);
  if (!host) throw new ConnectionError("That isn't a portal address.");
  const email = input.email.trim();
  if (!EMAIL.test(email)) throw new ConnectionError("Enter the email you sign in with.");
  if (input.password.length < 6 || input.password.length > 200) throw new ConnectionError("Enter the portal's password (6–200 characters).");
  const prev = await store().byHost(tenantId, host);
  const row: Row = { id: prev?.id ?? `pc_${randomUUID()}`, tenant_id: tenantId, host, provider: input.provider ?? null, email, ciphertext: encrypt(input.password), masked: mask(input.password), status: input.status ?? "active", created_by: input.createdBy, created_at: new Date().toISOString(), last_used_at: null, last_result: null };
  await store().upsert(row);
  return view(row);
}

export async function removeConnection(tenantId: string, id: string): Promise<boolean> {
  return store().remove(tenantId, id);
}

export async function connectionFor(tenantId: string, hostOrUrl: string): Promise<PortalConnection | undefined> {
  const host = portalHost(hostOrUrl);
  const r = host ? await store().byHost(tenantId, host) : undefined;
  return r ? view(r) : undefined;
}

/** Server only: the decrypted sign-in, for the cloud browser's sign-in at that portal. Never returned by a route. */
export async function credentialFor(tenantId: string, hostOrUrl: string): Promise<{ connection: PortalConnection; email: string; password: string } | undefined> {
  const host = portalHost(hostOrUrl);
  const r = host ? await store().byHost(tenantId, host) : undefined;
  if (!r) return undefined;
  return { connection: view(r), email: r.email, password: decrypt(r.ciphertext) };
}

export async function recordConnectionResult(tenantId: string, id: string, status: ConnectionStatus, result: string): Promise<void> {
  await store().update(tenantId, id, { status, last_result: result.slice(0, 200), last_used_at: new Date().toISOString() });
}

/**
 * A password for an account Wonder creates: 20 characters with lowercase, uppercase, digits and a symbol, which
 * meets every portal's rules we know (Workday: lower, upper, digit, special, 8+).
 */
export function generatePassword(): string {
  const sets = ["abcdefghijkmnpqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%^*-_+="];
  const chars = sets.map((s) => s[randomInt(s.length)]);
  const all = sets.join("");
  for (const b of randomBytes(16)) chars.push(all[b % all.length]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
