/**
 * The contact exchange every module uses (rules: `domain/contact/contact.ts`). One row per person per conversation:
 * what they offered, encrypted (AES-256-GCM, bound to the module, the conversation and the person). Who may take part
 * in a conversation stays the module's own check; this only stores offers and decides what each side sees.
 *
 * A person's offer is shown to the other in full only while both have offered; otherwise masked. Taking an offer back
 * deletes it, so the other is back to masked (or nothing).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { cleanEmail, cleanPhone, masked, type ContactOffer, type ContactView } from "@/domain/contact/contact";
import { table } from "../db/table";
import { HiringError } from "../hiring";
import { derivedKey } from "../secrets";

type Row = { module: string; subject_id: string; tenant_id: string; other_tenant: string; phone: string | null; email: string | null; created_at: string };
const rows = () => table<Row>("contact_exchanges");

const aad = (r: Pick<Row, "module" | "subject_id" | "tenant_id">, field: string) => Buffer.from(`contact:${r.module}:${r.subject_id}:${r.tenant_id}:${field}`, "utf8");
const key = () => derivedKey("wonderworks/contact-exchange/aes-256-gcm/v1");

function seal(r: Pick<Row, "module" | "subject_id" | "tenant_id">, field: string, value: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  c.setAAD(aad(r, field));
  const data = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return `c1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${data.toString("base64")}`;
}

function open(r: Pick<Row, "module" | "subject_id" | "tenant_id">, field: string, sealed: string | null): string | undefined {
  if (!sealed) return undefined;
  const [v, iv, tag, data] = sealed.split(":");
  if (v !== "c1" || !iv || !tag || data === undefined) return undefined;
  try {
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    d.setAAD(aad(r, field));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch {
    return undefined;
  }
}

const offerOf = (r: Row): ContactOffer => {
  const phone = open(r, "phone", r.phone);
  const email = open(r, "email", r.email);
  return { ...(phone ? { phone } : {}), ...(email ? { email } : {}) };
};

const NOT_YET = /contact_exchanges|schema cache|does not exist/i;
async function ready<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (!(e instanceof HiringError) && NOT_YET.test(e instanceof Error ? e.message : "")) throw new HiringError("Sharing contact details isn't switched on yet. Try again later.", 409);
    throw e;
  }
}

/** What `me` sees of the exchange with `other` in one conversation. */
export async function contactView(module: string, subjectId: string, me: string, other: string): Promise<ContactView> {
  const list = await ready(() => rows().find({ module, subject_id: subjectId }));
  const mine = list.find((r) => r.tenant_id === me && r.other_tenant === other);
  const theirs = list.find((r) => r.tenant_id === other && r.other_tenant === me);
  const both = !!mine && !!theirs;
  return {
    mine: mine ? offerOf(mine) : null,
    theirs: theirs ? { ...(both ? offerOf(theirs) : masked(offerOf(theirs))), masked: !both } : null,
  };
}

/** Offer (or change) what `me` shares with `other`: at least one of phone and email, each checked. */
export async function offerContact(module: string, subjectId: string, me: string, other: string, input: ContactOffer): Promise<ContactView> {
  const phone = input.phone ? cleanPhone(input.phone) : null;
  const email = input.email ? cleanEmail(input.email) : null;
  if (input.phone && !phone) throw new HiringError("That phone number doesn't look right.", 400);
  if (input.email && !email) throw new HiringError("That email address doesn't look right.", 400);
  if (!phone && !email) throw new HiringError("Choose a phone number or an email to share.", 400);
  if (me === other) throw new HiringError("That isn't a conversation with someone else.", 400);
  const id = { module, subject_id: subjectId, tenant_id: me };
  await ready(() => rows().upsert({ ...id, other_tenant: other, phone: phone ? seal(id, "phone", phone) : null, email: email ? seal(id, "email", email) : null, created_at: new Date().toISOString() }, ["module", "subject_id", "tenant_id"]));
  return contactView(module, subjectId, me, other);
}

/** Stop sharing: the offer is deleted, and the other person sees nothing of it again. */
export async function withdrawContact(module: string, subjectId: string, me: string): Promise<void> {
  await ready(() => rows().remove({ module, subject_id: subjectId, tenant_id: me }));
}

/** Account export: what the person offered, in full (it is theirs), and to which conversation. */
export async function exportContact(tenantId: string): Promise<unknown> {
  const mine = await rows().find({ tenant_id: tenantId }, { limit: 5000 }).catch(() => [] as Row[]);
  return { offers: mine.map((r) => ({ module: r.module, conversation: r.subject_id, ...offerOf(r), at: r.created_at })) };
}

/** Account erasure: their offers, and every offer made to them. */
export async function eraseContact(tenantId: string): Promise<void> {
  await rows().remove({ tenant_id: tenantId }).catch(() => 0);
  await rows().remove({ other_tenant: tenantId }).catch(() => 0);
}
