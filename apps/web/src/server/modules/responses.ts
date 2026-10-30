/**
 * The WonderWorks server layer every module's owner side and responses share (docs/WONDERWORKS_PLATFORM.md §5): the
 * module-keyed `listings`, `responses`, `response_events` and `response_files` tables, and the steps every module's
 * Apply takes the same way — the capability gate read from the person's own saved policy, the audit history, the
 * résumé copy encrypted per workspace, and the email to the team. A module (server/<module>/) brings only its own
 * terms, statuses and words.
 *
 * Tenant isolation: owner-side reads filter by org_id and module after `requirePermission` (domain/org/permissions.ts::can);
 * a responder's reads filter by responder_tenant and module. Open listings are the one cross-tenant read (public postings).
 */
import { randomUUID } from "node:crypto";
import { table } from "../db/table";
import { sendMail } from "../notify";
import { EMAIL_COLORS, escapeHtml, renderEmailLayout } from "../email/layout";
import { decryptFile, encryptFile } from "../resume/files";
import { readClientState } from "../clientState";
import { siteUrl } from "@/lib/siteUrl";
import { can } from "@/domain/org/permissions";
import type { OrgRole } from "@/domain/org/types";
import { defaultPolicy, resolveCapability, type AutomationLevel, type AutomationPolicy, type Capability } from "@/domain/automation/policy";
import type { WorkMode } from "@/wonderworks/find/place";

export type ListingRow = { id: string; module: string; org_id: string; title: string; description: string; location: string; work_mode: WorkMode; skills: string[]; attrs: Record<string, unknown>; status: "draft" | "open" | "closed"; created_by: string; created_at: string; updated_at: string };
export type ResponseRow<S extends string = string, P = Record<string, unknown>> = { id: string; module: string; listing_id: string; org_id: string; responder_tenant: string; email: string; name: string; status: S; profile: P; cover_note: string; consent_at: string; created_at: string; updated_at: string };
export type EventRow = { response_id: string; org_id: string; event: string; actor: string | null; detail: string | null; at: string };
export type FileRow = { response_id: string; org_id: string; filename: string; mime: string; ciphertext: string; created_at: string };
export type OrgRow = { id: string; name: string; website: string | null; verified?: boolean };
type MemberRow = { org_id: string; tenant_id: string; role: OrgRole; email: string | null };

export const listings = () => table<ListingRow>("listings");
export const responses = <S extends string, P>() => table<ResponseRow<S, P>>("responses");
export const events = () => table<EventRow>("response_events");
export const files = () => table<FileRow>("response_files");
export const orgs = () => table<OrgRow>("hiring_orgs");
const members = () => table<MemberRow>("hiring_members");

export const now = () => new Date().toISOString();
export const newId = (p: string) => `${p}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

/** Résumé copies are encrypted per workspace and module, apart from Jobs' Easy Apply files. */
export const fileOwner = (orgId: string, module: string) => `org:${orgId}:${module}`;

/** One entry in a response's append-only history. */
export async function record(r: { id: string; org_id: string }, event: string, actor: string | null, detail?: string) {
  await events().insert({ response_id: r.id, org_id: r.org_id, event, actor, detail: detail ?? null, at: now() });
}

/** Open listings of one module with their workspace (public postings: the one cross-tenant read). */
export async function openListings<P extends { orgId: string }>(module: string, toPosting: (r: ListingRow) => P, limit = 300): Promise<{ posting: P; org: { id: string; name: string; verified: boolean } }[]> {
  const rows = (await listings().find({ module, status: "open" }, { order: "updated_at", desc: true, limit })).map(toPosting);
  const byOrg = new Map((await orgs().findIn("id", [...new Set(rows.map((p) => p.orgId))])).map((o) => [o.id, o]));
  return rows.flatMap((posting) => {
    const o = byOrg.get(posting.orgId);
    return o ? [{ posting, org: { id: o.id, name: o.name, verified: !!o.verified } }] : [];
  });
}

/**
 * `resolveCapability(capability)` for this person, from their saved policy, read here on the server. No saved policy,
 * or a failed read: ask (fails closed).
 */
export async function capabilityDecision(tenantId: string, capability: Capability): Promise<"run" | "ask" | "skip"> {
  try {
    const st = await readClientState<{ policy?: Partial<AutomationPolicy>; defaultLevel?: AutomationLevel }>(tenantId, "wj.automation");
    if (!st?.policy) return "ask";
    return resolveCapability(capability, { ...defaultPolicy(), ...st.policy }, st.defaultLevel ?? "guided");
  } catch {
    return "ask";
  }
}

/** Keep the résumé sent with a response, encrypted for that workspace. */
export async function keepResume(r: { id: string; org_id: string; module: string }, file: { meta: { filename: string; mime: string }; bytes: Buffer }, at = now()) {
  await files().insert({ response_id: r.id, org_id: r.org_id, filename: file.meta.filename, mime: file.meta.mime, ciphertext: encryptFile(fileOwner(r.org_id, r.module), r.id, file.bytes), created_at: at });
}

/** The résumé sent with a response, read back for that workspace (the caller checked applications.view). */
export async function readResume(orgId: string, module: string, responseId: string): Promise<{ filename: string; mime: string; bytes: Buffer } | null> {
  const f = await files().one({ response_id: responseId, org_id: orgId });
  return f ? { filename: f.filename, mime: f.mime, bytes: decryptFile(fileOwner(orgId, module), responseId, f.ciphertext) } : null;
}

/**
 * Email everyone in the workspace who may decide on applications about a new one, and note in its history how many
 * went. Never throws: the application stands either way.
 */
export async function emailTeam(r: ResponseRow<string, unknown>, mail: { subject: string; heading: string; intro: string; rows: [string, string][]; href: string; tag: string }): Promise<void> {
  try {
    const team = [...new Set((await members().find({ org_id: r.org_id })).filter((m) => can(m.role, "applications.decide") && m.email).map((m) => m.email!))];
    const C = EMAIL_COLORS;
    const href = new URL(mail.href, siteUrl().origin).toString();
    const bodyHtml = `<div style="font-size:18px;font-weight:700;margin:0 0 8px">${escapeHtml(mail.heading)}</div><div style="margin:0 0 10px;color:${C.ink2}">${escapeHtml(mail.intro)}</div>${mail.rows.map(([a, b]) => `<div style="padding:6px 0;border-bottom:1px solid ${C.line}"><div style="font-size:12px;color:${C.muted}">${escapeHtml(a)}</div><div style="font-size:14px;color:${C.ink}">${escapeHtml(b)}</div></div>`).join("")}<p style="margin:16px 0 0"><a href="${escapeHtml(href)}">Review the application</a></p>`;
    const bodyText = [mail.heading, "", ...mail.rows.map(([a, b]) => `${a}: ${b}`), "", `Review the application: ${href}`].join("\n");
    const rendered = renderEmailLayout({ origin: siteUrl().origin, preheader: mail.intro, bodyHtml, bodyText, reason: "You're getting this because you can decide on applications in this hiring workspace on WonderWorks.", settingsLink: false });
    let sent = 0;
    for (const to of team) if ((await sendMail({ to, subject: mail.subject, replyTo: r.email, ...rendered })).sent) sent++;
    await record(r, "email:team", "system", team.length ? `${sent} of ${team.length} sent` : "no one with an email can decide");
  } catch (e) {
    console.error(`[${mail.tag}] team email failed`, e instanceof Error ? e.message.slice(0, 200) : e);
  }
}
