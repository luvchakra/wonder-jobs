/**
 * The Explorium API keys the ratings job spends, in the order they were added (`jobslake_rating_keys`). Each is
 * encrypted with the same AES-256-GCM scheme as every secret here, masked on read, decrypted only to call
 * Explorium, and deleted when it runs out of credits. Never logged, never returned, never in an error message.
 */
import { randomBytes } from "node:crypto";
import { decrypt, encrypt } from "@/server/secrets";
import { getSupabaseAdmin } from "@/server/supabase";
import { maskCredential } from "./credentials";

export interface RatingKey {
  id: string;
  label: string;
  masked: string;
  addedAt: string;
  lastUsedAt?: string;
  /** The credits Explorium said it had left when last asked. */
  creditsLeft?: number;
  creditsCheckedAt?: string;
}

interface Row extends RatingKey {
  ciphertext: string;
}

export interface RatingKeyStore {
  /** In the order they were added: the first is spent first. */
  list(): Promise<RatingKey[]>;
  add(secret: string, label: string): Promise<RatingKey>;
  remove(id: string): Promise<void>;
  /** The plaintext, for an Explorium call only. */
  secret(id: string): Promise<string | undefined>;
  /** Plaintext of every key, for spotting a key added twice. */
  hasSecret(secret: string): Promise<boolean>;
  touch(id: string, patch: { lastUsedAt?: string; creditsLeft?: number; creditsCheckedAt?: string }): Promise<void>;
}

const pub = (r: Row): RatingKey => ({ id: r.id, label: r.label, masked: r.masked, addedAt: r.addedAt, ...(r.lastUsedAt ? { lastUsedAt: r.lastUsedAt } : {}), ...(r.creditsLeft !== undefined ? { creditsLeft: r.creditsLeft } : {}), ...(r.creditsCheckedAt ? { creditsCheckedAt: r.creditsCheckedAt } : {}) });

class MemoryKeys implements RatingKeyStore {
  rows: Row[] = [];
  async list() {
    return this.rows.map(pub);
  }
  async add(secret: string, label: string) {
    const row: Row = { id: `rk_${randomBytes(9).toString("hex")}`, label, masked: maskCredential(secret), addedAt: new Date().toISOString(), ciphertext: encrypt(secret) };
    this.rows.push(row);
    return pub(row);
  }
  async remove(id: string) {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
  async secret(id: string) {
    const r = this.rows.find((x) => x.id === id);
    return r ? decrypt(r.ciphertext) : undefined;
  }
  async hasSecret(secret: string) {
    return this.rows.some((r) => decrypt(r.ciphertext) === secret);
  }
  async touch(id: string, patch: { lastUsedAt?: string; creditsLeft?: number; creditsCheckedAt?: string }) {
    const r = this.rows.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
  }
}

type DbRow = { id: string; label: string; masked: string; added_at: string; last_used_at: string | null; credits_left: number | null; credits_checked_at: string | null; ciphertext?: string };
const fromDb = (r: DbRow): RatingKey => ({ id: r.id, label: r.label, masked: r.masked, addedAt: r.added_at, ...(r.last_used_at ? { lastUsedAt: r.last_used_at } : {}), ...(r.credits_left != null ? { creditsLeft: r.credits_left } : {}), ...(r.credits_checked_at ? { creditsCheckedAt: r.credits_checked_at } : {}) });

class SupabaseKeys implements RatingKeyStore {
  private t() {
    const sb = getSupabaseAdmin();
    if (!sb) throw new Error("Supabase is not configured");
    return sb.schema("wonderjobs").from("jobslake_rating_keys");
  }
  async list() {
    const { data, error } = await this.t().select("id, label, masked, added_at, last_used_at, credits_left, credits_checked_at").order("added_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as DbRow[]).map(fromDb);
  }
  async add(secret: string, label: string) {
    const row = { id: `rk_${randomBytes(9).toString("hex")}`, label, ciphertext: encrypt(secret), masked: maskCredential(secret) };
    const { data, error } = await this.t().insert(row).select("id, label, masked, added_at, last_used_at, credits_left, credits_checked_at").single();
    if (error) throw new Error(error.message);
    return fromDb(data as DbRow);
  }
  async remove(id: string) {
    const { error } = await this.t().delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
  async secret(id: string) {
    const { data, error } = await this.t().select("ciphertext").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? decrypt((data as { ciphertext: string }).ciphertext) : undefined;
  }
  async hasSecret(secret: string) {
    const { data, error } = await this.t().select("ciphertext");
    if (error) throw new Error(error.message);
    return ((data ?? []) as { ciphertext: string }[]).some((r) => decrypt(r.ciphertext) === secret);
  }
  async touch(id: string, patch: { lastUsedAt?: string; creditsLeft?: number; creditsCheckedAt?: string }) {
    const { error } = await this.t().update({ ...(patch.lastUsedAt ? { last_used_at: patch.lastUsedAt } : {}), ...(patch.creditsLeft !== undefined ? { credits_left: patch.creditsLeft } : {}), ...(patch.creditsCheckedAt ? { credits_checked_at: patch.creditsCheckedAt } : {}) }).eq("id", id);
    if (error) throw new Error(error.message);
  }
}

const g = globalThis as unknown as { __ratingKeys?: RatingKeyStore };
export function ratingKeyStore(): RatingKeyStore {
  if (!g.__ratingKeys) g.__ratingKeys = getSupabaseAdmin() ? new SupabaseKeys() : new MemoryKeys();
  return g.__ratingKeys;
}
/** Tests only. */
export function __setRatingKeyStore(s: RatingKeyStore | undefined) {
  g.__ratingKeys = s;
}
export { MemoryKeys as __MemoryRatingKeys };
