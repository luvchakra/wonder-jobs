import { randomBytes } from "node:crypto";
import { decrypt, encrypt } from "@/server/secrets";
import { jobsLakeStore } from "./store";

/**
 * Source credentials (spec §49). Sources hold only a `secretRef`; the secret is encrypted with the
 * same AES-256-GCM scheme as BYOK keys, masked on read, and decrypted only inside a connector call.
 * Never logged, never returned by any API, never put in an error message.
 *
 * `env:` refs point at deployment environment variables (e.g. Adzuna's app id/key) — those are
 * managed in the hosting platform, so JobsLake can report them but not replace them.
 */
export interface CredentialStatus {
  ref: string;
  masked: string;
  managedBy: "jobslake" | "environment";
  present: boolean;
  createdAt?: string;
  replacedAt?: string;
}

const ENV_REFS: Record<string, { vars: string[]; label: string }> = {
  "env:ADZUNA": { vars: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"], label: "ADZUNA_APP_ID + ADZUNA_APP_KEY" },
};

/** Stricter than the BYOK mask: no prefix, and nothing at all from a short secret. */
export function maskCredential(v: string) {
  return v.length >= 12 ? `••••••••${v.slice(-4)}` : "••••••••";
}

export async function saveCredential(secret: string, replaceRef?: string): Promise<string> {
  const value = secret.trim();
  if (value.length < 4 || value.length > 4096) throw new Error("The credential must be between 4 and 4,096 characters.");
  const store = jobsLakeStore();
  const now = new Date().toISOString();
  const existing = replaceRef && !replaceRef.startsWith("env:") ? await store.getCredential(replaceRef) : undefined;
  const ref = existing?.ref ?? `cred_${randomBytes(12).toString("hex")}`;
  await store.putCredential({ ref, ciphertext: encrypt(value), masked: maskCredential(value), createdAt: existing?.createdAt ?? now, replacedAt: existing ? now : undefined });
  return ref;
}

/** Plaintext, for a connector call only. */
export async function readCredential(ref: string | undefined): Promise<string | undefined> {
  if (!ref || ref.startsWith("env:")) return undefined;
  const c = await jobsLakeStore().getCredential(ref);
  return c ? decrypt(c.ciphertext) : undefined;
}

export async function credentialStatus(ref: string | undefined): Promise<CredentialStatus | null> {
  if (!ref) return null;
  const env = ENV_REFS[ref];
  if (env) {
    const present = env.vars.every((v) => !!process.env[v]);
    return { ref, masked: present ? `Set in the deployment (${env.label})` : `Not set (${env.label})`, managedBy: "environment", present };
  }
  const c = await jobsLakeStore().getCredential(ref);
  return c ? { ref, masked: c.masked, managedBy: "jobslake", present: true, createdAt: c.createdAt, replacedAt: c.replacedAt } : { ref, masked: "Missing", managedBy: "jobslake", present: false };
}

export async function deleteCredential(ref: string | undefined) {
  if (ref && !ref.startsWith("env:")) await jobsLakeStore().deleteCredential(ref);
}
