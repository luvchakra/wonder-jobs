import type { CanonicalJob } from "@/domain/jobs/types";
import { WORK_MODE_LABEL } from "@/domain/jobs/types";
import { JOB_TYPE_LABEL, jobTypeOf } from "@/domain/jobs/jobType";
import { shareFacts } from "@/domain/jobs/share";
import { sharedJob } from "@/app/j/[id]/data";
import { sharedListing } from "./listing";
import type { SummaryInput } from "./summary";
import type { ListingShareProps } from "@/wonderworks/listing/ShareButton";

/** A job's labelled details, as its share image and summary use them. */
export function jobLines(job: CanonicalJob): string[] {
  return [
    job.seniority && `Level: ${job.seniority[0].toUpperCase()}${job.seniority.slice(1)}`,
    job.skills?.length ? `Skills: ${job.skills.slice(0, 6).join(", ")}` : null,
    job.postedAt && `Posted: ${new Date(job.postedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
  ].filter((x): x is string => !!x);
}

/** A job's headline facts as chips: pay first, then place, work mode and type. */
export function jobChips(job: CanonicalJob, salary: string | null): string[] {
  const type = jobTypeOf(job);
  return [salary, job.location, WORK_MODE_LABEL[job.workMode], type ? JOB_TYPE_LABEL[type] : null].filter((x): x is string => !!x);
}

export type Shared = { kind: "job"; key: string; job: CanonicalJob; input: SummaryInput } | { kind: "listing"; key: string; module: string; listing: ListingShareProps; input: SummaryInput };

/**
 * What a public share page (`/j/<id>` or `/s/<module>/<id>`) shows, read from the public record, with what its summary is
 * made from. Null for anything else or a listing that's gone.
 */
const looked = new Map<string, { at: number; value: Promise<Shared | null> }>();
const LOOK_MS = 10 * 60_000;

/**
 * `sharedFor`, remembered for ten minutes per server (owner, 2026-11-03: Share "is taking a long time to load"): the
 * summary and the share image both read the same public listing, so the second read, and a re-share, skip the database.
 * Public listing data only, the same for everyone; a lookup that fails or finds nothing isn't kept.
 */
export function sharedForCached(page: string): Promise<Shared | null> {
  const hit = looked.get(page);
  if (hit && Date.now() - hit.at < LOOK_MS) return hit.value;
  const value = sharedFor(page).catch(() => null);
  if (looked.size >= 500) looked.delete(looked.keys().next().value as string);
  looked.set(page, { at: Date.now(), value });
  void value.then((v) => {
    if (!v) looked.delete(page);
  });
  return value;
}

export async function sharedFor(page: string): Promise<Shared | null> {
  const j = /^\/j\/([^/?#]{1,200})$/.exec(page);
  if (j) {
    const job = await sharedJob(j[1]);
    return job ? { kind: "job", key: `j:${job.id}`, job, input: { noun: "job", title: `${job.title} at ${job.company}`, facts: [shareFacts(job)], lines: jobLines(job), details: job.description } } : null;
  }
  const s = /^\/s\/([a-z]{1,30})\/([^/?#]{1,200})$/.exec(page);
  if (!s) return null;
  const listing = await sharedListing(s[1], s[2]);
  return listing ? { kind: "listing", key: `s:${s[1]}:${decodeURIComponent(s[2])}`, module: s[1], listing, input: listing } : null;
}

/** Which of a module's headline facts names the organisation (see each module's `share.ts`); the marketplace's never does. */
const ORG_FACT: Record<string, "first" | "last"> = { internships: "first", teaching: "first", services: "first", therapists: "first", scholarships: "first", events: "last" };

/**
 * The organisation behind a listing, for its logo: read from the module's facts as they stand, before empty ones are
 * dropped, so a listing without an organiser (an outside event with no organiser) gives none rather than its place.
 */
export function organisationOf(module: string, facts: ListingShareProps["facts"]): string | undefined {
  const all = facts ?? [];
  const at = ORG_FACT[module] === "last" ? all.at(-1) : ORG_FACT[module] === "first" ? all[0] : undefined;
  return typeof at === "string" && at.trim() ? at.trim() : undefined;
}
