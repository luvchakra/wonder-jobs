/**
 * Turns a parsed Ask Wonder intent into one concrete, real action — resolved against the
 * candidate's own live data (jobs, applications, Career DNA), never a generic template answer.
 * Returns `null` when the intent has nothing real to show (e.g. `prepare_application` for a job
 * that isn't in the catalog, or the `search_jobs` fallback) so the caller keeps its own default.
 */
import type { CareerDNA } from "@/domain/career/types";
import type { Application } from "@/domain/applications/types";
import type { CanonicalJob, JobFilters, JobMatch } from "@/domain/jobs/types";
import { computeApplicationAttention } from "@/domain/career/attention";
import { explainJobVisibility, FILTER_REASON_LABEL } from "@/domain/jobs/filterExplain";
import { computeMissingSkills, findJobBySubject } from "./insights";
import { parseWonderIntent } from "./intent";

export interface WonderAction {
  id: string;
  label: string;
  hint?: string;
  href: string;
}

export interface WonderContext {
  dna: Pick<CareerDNA, "skills">;
  jobsOrder: string[];
  jobs: Record<string, CanonicalJob>;
  matches: Record<string, JobMatch>;
  rejected: Record<string, string>;
  saved: Record<string, string>;
  filters: JobFilters;
  applications: Record<string, Application>;
  now: number;
}

/** Picks the closest existing schedule template by the frequency word the candidate actually used — never invents a new cadence. */
function scheduleTemplateFor(raw: string): string {
  if (/month/i.test(raw)) return "career_progress";
  if (/week/i.test(raw)) return "weekly_review";
  return "daily_discovery";
}

export function resolveWonderQuery(raw: string, ctx: WonderContext): WonderAction | null {
  const intent = parseWonderIntent(raw);
  switch (intent.type) {
    case "career_headline":
      return {
        id: "wonder-headline",
        label: "Update your headline in Career Profile",
        hint: "LinkedIn isn't connected — Wonder has no way to read or write it. Edit your headline directly instead.",
        href: "/app/career-dna",
      };
    case "missing_skills": {
      const list = computeMissingSkills(ctx.dna, Object.values(ctx.jobs), ctx.matches);
      if (!list.length) return { id: "wonder-skills", label: "No skill gaps found in your current matches", hint: "Every skill your strong and worth-considering matches ask for is already in your Career DNA.", href: "/app/career-dna" };
      return { id: "wonder-skills", label: "Skills your matches ask for that aren't in your Career DNA yet", hint: list.map((s) => s.name).join(", "), href: "/app/career-dna" };
    }
    case "applications_attention": {
      const items = computeApplicationAttention(ctx.applications, ctx.now);
      return {
        id: "wonder-attention",
        label: items.length ? `${items.length} application${items.length === 1 ? "" : "s"} need${items.length === 1 ? "s" : ""} your attention` : "No applications need attention right now",
        hint: items.length ? items.slice(0, 2).map((i) => i.label).join(" · ") : undefined,
        href: "/app/applications",
      };
    }
    case "create_schedule": {
      const templateId = scheduleTemplateFor(raw);
      const q = intent.subject;
      return {
        id: "wonder-schedule",
        label: q ? `Set up a recurring search for "${q}"` : "Set up a recurring search",
        hint: "You choose the frequency and confirm before anything runs.",
        href: `/app/automation/scheduled/new?template=${templateId}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
      };
    }
    case "explain_why_not_shown": {
      const job = findJobBySubject(ctx.jobsOrder, ctx.jobs, intent.subject);
      const result = explainJobVisibility(job, ctx.matches, ctx.rejected, ctx.saved, ctx.filters, ctx.now);
      if (!result.inCatalog) return { id: "wonder-why", label: `"${intent.subject || raw}" isn't in your current search results`, hint: "It may not have been discovered yet, or it's from an earlier run. Try a new search.", href: `/app/jobs?q=${encodeURIComponent(intent.subject)}` };
      if (result.visible) return { id: "wonder-why", label: `${job!.title} · ${job!.company} is already visible`, hint: "It isn't hidden by any of your active filters.", href: `/app/jobs/${job!.id}` };
      return { id: "wonder-why", label: `Hidden because it's ${FILTER_REASON_LABEL[result.reason!]}`, hint: `${job!.title} · ${job!.company}`, href: "/app/jobs" };
    }
    case "prepare_application": {
      const job = findJobBySubject(ctx.jobsOrder, ctx.jobs, intent.subject);
      if (!job) return null;
      return { id: "wonder-prepare", label: `Open ${job.title} · ${job.company}`, hint: "Prepare its Application Pack from there.", href: `/app/jobs/${job.id}` };
    }
    default:
      return null;
  }
}
