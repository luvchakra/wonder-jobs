import { decrypt, encrypt } from "@/server/secrets";
import { jobsLakeStore } from "@/server/jobslake/store";

/**
 * The career-site key for WonderStar' own careers page (wjcs_…, shown once in Hiring → Jobs → Career sites →
 * "On our own website"). An admin sets it in WonderStar Admin → Careers, without a redeploy. It is kept with the
 * other admin-managed credentials: AES-256-GCM encrypted (`server/secrets.ts`), masked on read, decrypted only for
 * a call to the careers API. `WONDERJOBS_CAREERS_KEY` is the fallback while nothing is saved. Every save and clear
 * is written to the admin audit log with who, when and the key's last four characters, nothing more.
 */

const REF = "careers_site_key";
export const CAREERS_KEY_PATTERN = /^wjcs_[A-Za-z0-9_-]{20,200}$/;

export const maskCareersKey = (key: string) => `wjcs_••••••••${key.slice(-4)}`;

export type CareersKeyStatus = { source: "saved" | "environment" | "none"; masked?: string; savedAt?: string };

export async function careersKeyStatus(env: Record<string, string | undefined> = process.env): Promise<CareersKeyStatus> {
  const c = await jobsLakeStore().getCredential(REF);
  if (c) return { source: "saved", masked: c.masked, savedAt: c.replacedAt ?? c.createdAt };
  const fromEnv = env.WONDERJOBS_CAREERS_KEY?.trim();
  return fromEnv && CAREERS_KEY_PATTERN.test(fromEnv) ? { source: "environment", masked: maskCareersKey(fromEnv) } : { source: "none" };
}

/** The key, for a careers API call only: the saved one, else the environment's, else none. */
export async function resolveCareersKey(env: Record<string, string | undefined> = process.env): Promise<string | null> {
  const c = await jobsLakeStore().getCredential(REF);
  if (c) return decrypt(c.ciphertext);
  const fromEnv = env.WONDERJOBS_CAREERS_KEY?.trim();
  return fromEnv && CAREERS_KEY_PATTERN.test(fromEnv) ? fromEnv : null;
}

export class CareersKeyError extends Error {}

export async function saveCareersKey(actor: string, raw: string): Promise<CareersKeyStatus> {
  const key = raw.trim();
  if (!CAREERS_KEY_PATTERN.test(key)) throw new CareersKeyError("That isn't a career-site key. It starts with wjcs_ and is shown once when the site is added in Hiring → Jobs → Career sites.");
  const store = jobsLakeStore();
  const now = new Date().toISOString();
  const existing = await store.getCredential(REF);
  const masked = maskCareersKey(key);
  await store.putCredential({ ref: REF, ciphertext: encrypt(key), masked, createdAt: existing?.createdAt ?? now, replacedAt: existing ? now : undefined });
  await store.appendAudit({ at: now, actor, action: "careers_key_saved", detail: { last4: key.slice(-4) } });
  return { source: "saved", masked, savedAt: now };
}

export async function clearCareersKey(actor: string): Promise<void> {
  const store = jobsLakeStore();
  const existing = await store.getCredential(REF);
  if (!existing) return;
  await store.deleteCredential(REF);
  await store.appendAudit({ at: new Date().toISOString(), actor, action: "careers_key_cleared", detail: { last4: existing.masked.slice(-4) } });
}
