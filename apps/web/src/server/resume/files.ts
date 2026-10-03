import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { derivedKey } from "../secrets";
import { getSupabaseAdmin, touchTenant } from "../supabase";
import type { ResumeFileMime } from "./fileValidation";
import type { UploadedResume } from "@/domain/resume/files";

/**
 * Résumé files the candidate uploaded (their own PDF / Word résumé), kept so Apply with Wonder can attach
 * them and the Career Profile can be filled from them.
 *
 * Every file is encrypted before it leaves this process: AES-256-GCM with a key derived only for résumé
 * files, and the account id and file id bound in as additional data — a ciphertext copied into another
 * account's row, or onto another file id, fails to decrypt. Every query filters by tenant explicitly.
 */
export type ResumeFileMeta = UploadedResume;

interface StoredFile extends ResumeFileMeta {
  ciphertext: string;
}

const KEY_INFO = "wonderjobs/resume-files/aes-256-gcm/v1";
const aad = (tenantId: string, id: string) => Buffer.from(`resume-file:${tenantId}:${id}`, "utf8");

export function encryptFile(tenantId: string, id: string, bytes: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(KEY_INFO), iv);
  cipher.setAAD(aad(tenantId, id));
  const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return `f1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${data.toString("base64")}`;
}

export function decryptFile(tenantId: string, id: string, ciphertext: string): Buffer {
  const [v, iv, tag, data] = ciphertext.split(":");
  if (v !== "f1" || !iv || !tag || data === undefined) throw new Error("Unrecognised file format");
  const decipher = createDecipheriv("aes-256-gcm", derivedKey(KEY_INFO), Buffer.from(iv, "base64"));
  decipher.setAAD(aad(tenantId, id));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
}

export interface ResumeFileStore {
  list(tenantId: string): Promise<ResumeFileMeta[]>;
  read(tenantId: string, id: string): Promise<{ meta: ResumeFileMeta; bytes: Buffer } | undefined>;
  save(tenantId: string, input: { filename: string; mime: ResumeFileMime; bytes: Buffer }): Promise<ResumeFileMeta>;
  remove(tenantId: string, id: string): Promise<boolean>;
  /** Change only the name the file is attached and downloaded under; the bytes never change. */
  rename(tenantId: string, id: string, filename: string): Promise<ResumeFileMeta | undefined>;
}

const newFileId = () => `rf_${randomBytes(12).toString("base64url")}`;
const metaOf = (f: StoredFile): ResumeFileMeta => ({ id: f.id, filename: f.filename, mime: f.mime, sizeBytes: f.sizeBytes, sha256: f.sha256, uploadedAt: f.uploadedAt });

export class MemoryResumeFileStore implements ResumeFileStore {
  private files = new Map<string, Map<string, StoredFile>>();
  private bucket(t: string) {
    let b = this.files.get(t);
    if (!b) this.files.set(t, (b = new Map()));
    return b;
  }
  async list(t: string) {
    return [...this.bucket(t).values()].map(metaOf).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }
  async read(t: string, id: string) {
    const f = this.bucket(t).get(id);
    return f ? { meta: metaOf(f), bytes: decryptFile(t, id, f.ciphertext) } : undefined;
  }
  async save(t: string, input: { filename: string; mime: ResumeFileMime; bytes: Buffer }) {
    const id = newFileId();
    const f: StoredFile = { id, filename: input.filename, mime: input.mime, sizeBytes: input.bytes.length, sha256: createHash("sha256").update(input.bytes).digest("hex"), uploadedAt: new Date().toISOString(), ciphertext: encryptFile(t, id, input.bytes) };
    this.bucket(t).set(id, f);
    return metaOf(f);
  }
  async remove(t: string, id: string) {
    return this.bucket(t).delete(id);
  }
  async rename(t: string, id: string, filename: string) {
    const f = this.bucket(t).get(id);
    if (!f) return undefined;
    f.filename = filename;
    return metaOf(f);
  }
  /** Erasure in memory mode (Supabase deletes by cascade). */
  removeTenant(t: string) {
    this.files.delete(t);
  }
  /** Tests: the raw ciphertext, to prove nothing is stored in the clear. */
  _raw(t: string, id: string) {
    return this.bucket(t).get(id)?.ciphertext;
  }
}

type Row = { id: string; filename: string; mime: ResumeFileMime; size_bytes: number; sha256: string; uploaded_at: string; ciphertext?: string };
const META_COLS = "id, filename, mime, size_bytes, sha256, uploaded_at";
const fromRow = (r: Row): ResumeFileMeta => ({ id: r.id, filename: r.filename, mime: r.mime, sizeBytes: r.size_bytes, sha256: r.sha256, uploadedAt: r.uploaded_at });

class SupabaseResumeFileStore implements ResumeFileStore {
  private db() {
    const sb = getSupabaseAdmin();
    if (!sb) throw new Error("Supabase is not configured");
    return sb;
  }
  async list(t: string) {
    const { data, error } = await this.db().from("resume_files").select(META_COLS).eq("tenant_id", t).order("uploaded_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as Row[]).map(fromRow);
  }
  async read(t: string, id: string) {
    const { data, error } = await this.db().from("resume_files").select(`${META_COLS}, ciphertext`).eq("tenant_id", t).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return undefined;
    const r = data as Row;
    return { meta: fromRow(r), bytes: decryptFile(t, id, r.ciphertext!) };
  }
  async save(t: string, input: { filename: string; mime: ResumeFileMime; bytes: Buffer }) {
    await touchTenant(t);
    const id = newFileId();
    const row = { id, tenant_id: t, filename: input.filename, mime: input.mime, size_bytes: input.bytes.length, sha256: createHash("sha256").update(input.bytes).digest("hex"), ciphertext: encryptFile(t, id, input.bytes) };
    const { data, error } = await this.db().from("resume_files").insert(row).select(META_COLS).single();
    if (error) throw new Error(error.message);
    return fromRow(data as Row);
  }
  async rename(t: string, id: string, filename: string) {
    const { data, error } = await this.db().from("resume_files").update({ filename }).eq("tenant_id", t).eq("id", id).select(META_COLS).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? fromRow(data as Row) : undefined;
  }
  async remove(t: string, id: string) {
    const { data, error } = await this.db().from("resume_files").delete().eq("tenant_id", t).eq("id", id).select("id");
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
  }
}

const g = globalThis as { __wjResumeFiles?: ResumeFileStore };
export function resumeFileStore(): ResumeFileStore {
  if (getSupabaseAdmin()) return new SupabaseResumeFileStore();
  return (g.__wjResumeFiles ??= new MemoryResumeFileStore());
}
export function setResumeFileStoreForTests(s: ResumeFileStore | undefined) {
  g.__wjResumeFiles = s;
}
