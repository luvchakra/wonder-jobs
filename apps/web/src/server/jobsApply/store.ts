/**
 * JobsApply session persistence: one server-owned document per tenant (`wj.jobsapply`, see
 * `SERVER_STORES`). Every read and write names the tenant explicitly and re-checks each session's
 * own `tenantId` — the table's RLS has no policies (CLAUDE.md), so this is the isolation.
 *
 * Writes are read-modify-write on the tenant's document, serialised per tenant within this server
 * instance. Two instances writing the same tenant at the same moment could still race; the helper
 * and the web page rarely write at once, and every mutation is idempotent to replay.
 */
import { stateStore } from "@/server/state";
import type { JobsApplySession } from "@/domain/jobs-apply/types";
import { TERMINAL } from "@/domain/jobs-apply/states";
import { stripFiles } from "@/domain/jobs-apply/session";

const STORE = "wj.jobsapply" as const;
const MAX_SESSIONS = 25;
/** Keep well under the 2 MB per-document limit; résumé bytes are what's large. */
const MAX_DOC_BYTES = 1_700_000;

interface Doc {
  sessions: Record<string, JobsApplySession>;
}

async function read(tenantId: string): Promise<Doc> {
  const d = await stateStore.get(tenantId, STORE);
  const doc = (d?.state as Doc | undefined) ?? { sessions: {} };
  // Defence in depth: a session that doesn't name this tenant is never returned for it.
  const sessions: Record<string, JobsApplySession> = {};
  for (const [id, s] of Object.entries(doc.sessions ?? {})) if (s && s.tenantId === tenantId) sessions[id] = s;
  return { sessions };
}

/** Oldest-first eviction: finished sessions lose their file bytes first, then the oldest finished sessions go. */
function fit(doc: Doc): Doc {
  let sessions = Object.values(doc.sessions).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  while (sessions.length > MAX_SESSIONS) {
    const i = sessions.findIndex((s) => TERMINAL.has(s.status));
    sessions.splice(i >= 0 ? i : 0, 1);
  }
  const size = () => JSON.stringify(sessions).length;
  for (let i = 0; i < sessions.length && size() > MAX_DOC_BYTES; i++) if (TERMINAL.has(sessions[i].status)) sessions[i] = stripFiles(sessions[i]);
  for (let i = 0; i < sessions.length && size() > MAX_DOC_BYTES; i++) if (!TERMINAL.has(sessions[i].status) && i < sessions.length - 1) sessions[i] = stripFiles(sessions[i]);
  while (sessions.length > 1 && size() > MAX_DOC_BYTES) sessions = sessions.slice(1);
  return { sessions: Object.fromEntries(sessions.map((s) => [s.id, s])) };
}

const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(tenantId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(
    tenantId,
    next.catch(() => undefined),
  );
  try {
    return await next;
  } finally {
    if (locks.get(tenantId) === next) locks.delete(tenantId);
  }
}

export async function listSessions(tenantId: string): Promise<JobsApplySession[]> {
  const doc = await read(tenantId);
  return Object.values(doc.sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getSession(tenantId: string, id: string): Promise<JobsApplySession | undefined> {
  const s = (await read(tenantId)).sessions[id];
  return s && s.tenantId === tenantId ? s : undefined;
}

export async function insertSession(tenantId: string, s: JobsApplySession): Promise<JobsApplySession> {
  if (s.tenantId !== tenantId) throw new Error("tenant mismatch");
  return withLock(tenantId, async () => {
    const doc = await read(tenantId);
    doc.sessions[s.id] = s;
    await stateStore.put(tenantId, STORE, fit(doc));
    return s;
  });
}

/** Applies `fn` to the tenant's session and saves it. Returns undefined when the session isn't the tenant's. */
export async function mutateSession(tenantId: string, id: string, fn: (s: JobsApplySession) => JobsApplySession): Promise<JobsApplySession | undefined> {
  return withLock(tenantId, async () => {
    const doc = await read(tenantId);
    const cur = doc.sessions[id];
    if (!cur || cur.tenantId !== tenantId) return undefined;
    const next = fn(cur);
    if (next.tenantId !== tenantId || next.id !== id) throw new Error("tenant mismatch");
    if (next === cur) return cur;
    doc.sessions[id] = next;
    await stateStore.put(tenantId, STORE, fit(doc));
    return next;
  });
}

/** For the admin telemetry view: tenants that have sessions (ids only). */
export async function tenantsWithSessions(limit = 200): Promise<string[]> {
  return stateStore.listTenants(STORE, limit);
}
