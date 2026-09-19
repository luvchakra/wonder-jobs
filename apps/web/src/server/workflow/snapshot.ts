import type { CareerDNA, Notification, ActivityItem } from "@/domain/career/types";
import { EMPTY_DNA } from "@/domain/career/types";
import type { CanonicalJob, JobMatch, JobQuality, JobSource } from "@/domain/jobs/types";
import type { Workflow, WorkflowRun, WorkflowSchedule } from "@/domain/workflow/types";
import type { AutomationPolicy } from "@/domain/automation/policy";
import { defaultPolicy } from "@/domain/automation/policy";
import { JOB_SOURCES } from "@/domain/jobs/sources";
import { readClientState, writeClientState } from "@/server/clientState";

/**
 * A tenant's product state, loaded into memory so a scheduled run can execute on the server the way
 * the browser executes it against Zustand. Same documents, same shapes — the client and the cron are
 * two readers of one store, not two sources of truth.
 */
export interface CareerDoc {
  dna: CareerDNA;
  onboarded: boolean;
  activity: ActivityItem[];
  notifications: Notification[];
  [key: string]: unknown;
}
export interface JobsDoc {
  sources: JobSource[];
  jobs: Record<string, CanonicalJob>;
  order: string[];
  matches: Record<string, JobMatch>;
  quality: Record<string, JobQuality>;
  saved: Record<string, string>;
  rejected: Record<string, string>;
  [key: string]: unknown;
}
export interface WorkflowDoc {
  runs: Record<string, WorkflowRun>;
  workflows: Record<string, Workflow>;
  schedules: Record<string, WorkflowSchedule>;
  [key: string]: unknown;
}
export interface AutomationDoc {
  policy: AutomationPolicy;
  [key: string]: unknown;
}

/** Persist schema versions, mirroring each store's `persist(..., { version })`. Keep in step with the stores. */
export const PERSIST_VERSION = { career: 1, jobs: 2, workflow: 1, automation: 1 } as const;

/** The browser trims the catalog before persisting; the server must too, or documents grow without bound. */
const PERSISTED_CATALOG = 300;
const PERSISTED_DESCRIPTION = 1500;

export interface TenantSnapshot {
  tenantId: string;
  career: CareerDoc;
  jobs: JobsDoc;
  workflow: WorkflowDoc;
  automation: AutomationDoc;
}

export async function loadTenantSnapshot(tenantId: string): Promise<TenantSnapshot> {
  const [career, jobs, workflow, automation] = await Promise.all([
    readClientState<Partial<CareerDoc>>(tenantId, "wj.career"),
    readClientState<Partial<JobsDoc>>(tenantId, "wj.jobs"),
    readClientState<Partial<WorkflowDoc>>(tenantId, "wj.workflow"),
    readClientState<Partial<AutomationDoc>>(tenantId, "wj.automation"),
  ]);
  return {
    tenantId,
    career: { dna: career?.dna ?? EMPTY_DNA, onboarded: career?.onboarded ?? false, activity: career?.activity ?? [], notifications: career?.notifications ?? [], ...career } as CareerDoc,
    jobs: {
      // A tenant that has never opened the jobs page has no sources document yet; the defaults are what the client would use.
      sources: jobs?.sources?.length ? jobs.sources : JOB_SOURCES,
      jobs: jobs?.jobs ?? {},
      order: jobs?.order ?? [],
      matches: jobs?.matches ?? {},
      quality: jobs?.quality ?? {},
      saved: jobs?.saved ?? {},
      rejected: jobs?.rejected ?? {},
      ...jobs,
    } as JobsDoc,
    workflow: { runs: workflow?.runs ?? {}, workflows: workflow?.workflows ?? {}, schedules: workflow?.schedules ?? {}, ...workflow } as WorkflowDoc,
    automation: { policy: automation?.policy ?? defaultPolicy(), ...automation } as AutomationDoc,
  };
}

/** Same trimming rule as the client's `partialize`, so a server write doesn't blow past the document size cap. */
export function trimJobsDoc(doc: JobsDoc): JobsDoc {
  const keep = new Set<string>(Object.keys(doc.saved));
  for (const id of [...doc.order].sort((a, b) => (doc.matches[b]?.score ?? 0) - (doc.matches[a]?.score ?? 0))) {
    if (keep.size >= PERSISTED_CATALOG) break;
    keep.add(id);
  }
  const order = doc.order.filter((id) => keep.has(id));
  const jobs: Record<string, CanonicalJob> = {};
  const matches: Record<string, JobMatch> = {};
  const quality: Record<string, JobQuality> = {};
  for (const id of order) {
    const j = doc.jobs[id];
    if (!j) continue;
    jobs[id] = j.description.length > PERSISTED_DESCRIPTION ? { ...j, description: j.description.slice(0, PERSISTED_DESCRIPTION) } : j;
    if (doc.matches[id]) matches[id] = doc.matches[id];
    if (doc.quality[id]) quality[id] = doc.quality[id];
  }
  return { ...doc, order, jobs, matches, quality };
}

export async function saveTenantDocs(snapshot: TenantSnapshot, which: { career?: boolean; jobs?: boolean; workflow?: boolean }): Promise<void> {
  const writes: Promise<unknown>[] = [];
  if (which.career) writes.push(writeClientState(snapshot.tenantId, "wj.career", PERSIST_VERSION.career, snapshot.career, { merge: true }));
  if (which.jobs) writes.push(writeClientState(snapshot.tenantId, "wj.jobs", PERSIST_VERSION.jobs, trimJobsDoc(snapshot.jobs), { merge: true }));
  if (which.workflow) writes.push(writeClientState(snapshot.tenantId, "wj.workflow", PERSIST_VERSION.workflow, snapshot.workflow, { merge: true }));
  await Promise.all(writes);
}
