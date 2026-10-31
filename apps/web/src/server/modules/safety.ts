/**
 * WonderWorks' shared safety layer for modules where people deal with each other: a block between two people and a report
 * of a listing, conversation, message or person, in the module-keyed `module_blocks` and `module_reports` tables.
 * Marketplace uses it first; any module with person-to-person dealings can. (Co-founders' own cofounder_blocks and
 * cofounder_reports predate it and stay until that module moves over.)
 *
 * Tenant isolation: a block is written under the blocker's own tenant and read back as "people hidden from this viewer"
 * (either direction); a report is written under the reporter's own tenant. Nobody is told they were blocked or reported.
 * One report per reporter and subject, so a count of reports is a count of different people.
 */
import { table } from "../db/table";
import { newId } from "@/lib/ids";

export type BlockRow = { module: string; blocker_tenant: string; blocked_tenant: string; created_at: string };
export type ReportKind = "listing" | "thread" | "message" | "person";
export type ReportRow = { id: string; module: string; reporter_tenant: string; subject_kind: ReportKind; subject_id: string; subject_tenant: string | null; reason: string; created_at: string };

export const blocks = () => table<BlockRow>("module_blocks");
export const reports = () => table<ReportRow>("module_reports");
const now = () => new Date().toISOString();

/** Block a person in a module (idempotent). The caller checked the person exists and isn't the caller. */
export async function blockPerson(module: string, blocker: string, blocked: string): Promise<void> {
  if (blocker === blocked) throw new Error("You can't block yourself.");
  await blocks().upsert({ module, blocker_tenant: blocker, blocked_tenant: blocked, created_at: now() }, ["module", "blocker_tenant", "blocked_tenant"]);
}

/** Everyone the viewer must not see, and who must not see them: those they blocked and those who blocked them. */
export async function hiddenFrom(module: string, viewer: string): Promise<Set<string>> {
  const [mine, theirs] = await Promise.all([blocks().find({ module, blocker_tenant: viewer }), blocks().find({ module, blocked_tenant: viewer })]);
  return new Set([...mine.map((b) => b.blocked_tenant), ...theirs.map((b) => b.blocker_tenant)]);
}

/** Whether either of two people blocked the other. */
export async function blockedBetween(module: string, a: string, b: string): Promise<boolean> {
  return !!(await blocks().one({ module, blocker_tenant: a, blocked_tenant: b })) || !!(await blocks().one({ module, blocker_tenant: b, blocked_tenant: a }));
}

/** File a report. A second report of the same subject by the same person changes nothing. */
export async function fileReport(module: string, reporter: string, subject: { kind: ReportKind; id: string; tenant?: string }, reason: string): Promise<{ id: string; repeated: boolean }> {
  const old = await reports().one({ module, reporter_tenant: reporter, subject_kind: subject.kind, subject_id: subject.id });
  if (old) return { id: old.id, repeated: true };
  const row: ReportRow = { id: newId("rpt"), module, reporter_tenant: reporter, subject_kind: subject.kind, subject_id: subject.id, subject_tenant: subject.tenant ?? null, reason: reason.slice(0, 500), created_at: now() };
  await reports().insert(row);
  return { id: row.id, repeated: false };
}

/** How many different people reported this subject. */
export async function reportCount(module: string, kind: ReportKind, id: string): Promise<number> {
  return new Set((await reports().find({ module, subject_kind: kind, subject_id: id })).map((r) => r.reporter_tenant)).size;
}
