/**
 * BYOK secret storage (spec §23, §46).
 * - Encrypted at rest with AES-256-GCM.
 * - Plaintext never leaves the server after save; clients only see a mask.
 * - Isolated by user/tenant.
 * - Never logged.
 *
 * The in-memory store is the mock adapter for this environment (it resets on
 * cold start). Implement `SecretStore` against a database (e.g. Supabase with
 * RLS) for production; the API routes do not change.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { AIProviderId, BYOKStatus } from "@/domain/ai/types";

export interface StoredSecret {
  provider: AIProviderId;
  ciphertext: string; // base64 iv:tag:data
  masked: string;
  model?: string;
  connectedAt: string;
  lastVerifiedAt?: string;
  lastError?: string;
}

export interface SecretStore {
  list(tenantId: string): Promise<StoredSecret[]>;
  get(tenantId: string, provider: AIProviderId): Promise<StoredSecret | undefined>;
  put(tenantId: string, secret: StoredSecret): Promise<void>;
  remove(tenantId: string, provider: AIProviderId): Promise<void>;
}

class MemorySecretStore implements SecretStore {
  private data = new Map<string, Map<AIProviderId, StoredSecret>>();
  private bucket(t: string) {
    let b = this.data.get(t);
    if (!b) {
      b = new Map();
      this.data.set(t, b);
    }
    return b;
  }
  async list(t: string) {
    return [...this.bucket(t).values()];
  }
  async get(t: string, p: AIProviderId) {
    return this.bucket(t).get(p);
  }
  async put(t: string, s: StoredSecret) {
    this.bucket(t).set(s.provider, s);
  }
  async remove(t: string, p: AIProviderId) {
    this.bucket(t).delete(p);
  }
}

// Survives Next.js dev HMR reloads via globalThis.
const g = globalThis as unknown as { __wjSecretStore?: SecretStore; __wjDevKey?: Buffer };
export const secretStore: SecretStore = g.__wjSecretStore ?? (g.__wjSecretStore = new MemorySecretStore());

function masterKey(): Buffer {
  const env = process.env.WONDER_SECRET_KEY;
  if (env && env.length >= 32) return createHash("sha256").update(env).digest();
  if (process.env.NODE_ENV === "production") throw new Error("WONDER_SECRET_KEY must be set (32+ chars) to store provider keys.");
  // Development only: ephemeral key per process. Keys must be re-entered after a restart.
  return g.__wjDevKey ?? (g.__wjDevKey = randomBytes(32));
}

export function encrypt(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

export function decrypt(ciphertext: string) {
  const [iv, tag, data] = ciphertext.split(":").map((s) => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** e.g. "sk-ant-••••9f2a" — enough to recognise, never enough to use. */
export function maskKey(key: string) {
  const prefix = key.startsWith("sk-ant-") ? "sk-ant-" : key.startsWith("sk-") ? "sk-" : key.slice(0, 2);
  return `${prefix}••••${key.slice(-4)}`;
}

export function toStatus(s: StoredSecret): BYOKStatus {
  return { provider: s.provider, connected: true, maskedKey: s.masked, model: s.model, connectedAt: s.connectedAt, lastVerifiedAt: s.lastVerifiedAt, lastError: s.lastError };
}
