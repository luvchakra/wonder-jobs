/**
 * Turns a parsed Ask Wonder intent into one concrete, real action — resolved against the
 * candidate's own live data (jobs, applications, Career DNA), never a generic template answer.
 * Returns `null` when the intent has nothing real to show (e.g. `prepare_application` for a job
 * that isn't in the catalog, or the `search_jobs` fallback) so the caller keeps its own default.
 */
import type { CareerDNA } from "@/domain/career/types";
import type { Application } from "@/domain/applications/types";
import type { CanonicalJob, JobFilters, JobMatch } from "@/domain/jobs/types";
import { computeApplicationAttention, computeProgressSummary } from "@/domain/career/attention";
import { describeDecision } from "@/domain/jobs/decision";
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

/** The candidate's own frequency word picks the simple chooser's option — never an invented cadence. */
function lookFrequencyFor(raw: string): "daily" | "weekly" | "keep_watch" {
  if (/week/i.test(raw)) return "weekly";
  if (/keep (?:searching|looking|watch)|automatically|recurring/i.test(raw)) return "keep_watch";
  return "daily";
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

/** Strong matches the candidate hasn't rejected or started a pack for, best first. */
function openStrongMatches(ctx: WonderContext): CanonicalJob[] {
  const withPack = new Set(Object.values(ctx.applications).map((a) => a.jobId));
  return ctx.jobsOrder
    .map((id) => ctx.jobs[id])
    .filter((j): j is CanonicalJob => !!j && ctx.matches[j.id]?.fit === "strong" && !ctx.rejected[j.id] && !withPack.has(j.id))
    .sort((a, b) => ctx.matches[b.id].score - ctx.matches[a.id].score);
}

export function resolveWonderQuery(raw: string, ctx: WonderContext): WonderAction | null {
  const intent = parseWonderIntent(raw);
  switch (intent.type) {
    case "today_priorities": {
      const attention = computeApplicationAttention(ctx.applications, ctx.now);
      // Only strong matches posted in the last week count as today's work — the whole catalog of
      // strong matches is real but isn't a priority list.
      const strong = openStrongMatches(ctx).filter((j) => ctx.now - Date.parse(j.postedAt) <= 7 * 86_400_000).length;
      const parts = [...(attention.length ? [`${plural(attention.length, "application needs", "applications need")} you`] : []), ...(strong ? [`${plural(strong, "new strong match", "new strong matches")} this week`] : [])];
      return {
        id: "wonder-today",
        label: parts.length ? `Today: ${parts.join(" · ")}` : "Nothing needs your attention today",
        hint: attention.length ? attention.slice(0, 2).map((i) => i.label).join(" · ") : parts.length ? undefined : "Start a search when you're ready.",
        href: "/app",
      };
    }
    case "application_progress": {
      const p = computeProgressSummary(ctx.applications, ctx.now);
      const parts = [
        ...(p.active ? [plural(p.active, "application active", "applications active")] : []),
        ...(p.interviewsThisWeek ? [plural(p.interviewsThisWeek, "interview this week", "interviews this week")] : []),
        ...(p.followUpsDue ? [plural(p.followUpsDue, "follow-up due", "follow-ups due")] : []),
        ...(p.employerReplies ? [plural(p.employerReplies, "employer replied", "employers replied")] : []),
      ];
      return { id: "wonder-progress", label: parts.length ? parts.join(" · ") : "No active applications yet", href: "/app/applications" };
    }
    case "change_preferences":
      return {
        id: "wonder-preferences",
        label: "Change your search preferences",
        hint: "Locations, work modes, pay, seniority and industries live in your Career Profile — your next search uses them.",
        href: "/app/career-dna",
      };
    case "find_opportunities": {
      const q = intent.subject;
      return {
        id: "wonder-find",
        label: q ? `Find opportunities: “${q}”` : "Search again",
        hint: "You'll see exactly what Wonder will search for before it starts.",
        href: q ? `/app/runs/new?q=${encodeURIComponent(q)}` : "/app/runs/new",
      };
    }
    case "explain_job": {
      const job = findJobBySubject(ctx.jobsOrder, ctx.jobs, intent.subject);
      if (!job) return null;
      const d = describeDecision(job, ctx.matches[job.id], undefined);
      return {
        id: "wonder-explain",
        label: `Why Wonder surfaced ${job.title} · ${job.company}`,
        hint: d.why.length ? d.why.slice(0, 2).join(" · ") : "See how it lines up with your Career Profile.",
        href: `/app/jobs/${job.id}?tab=why`,
      };
    }
    case "prepare_strongest": {
      const open = openStrongMatches(ctx);
      if (!open.length) return { id: "wonder-prepare-top", label: "No strong matches without a pack right now", hint: "Every strong match already has an Application Pack, or none were found yet.", href: "/app/applications" };
      const asked = /\b(\d)\b/.exec(raw)?.[1] ?? Object.keys(NUMBER_WORDS).find((w) => new RegExp(`\\b${w}\\b`, "i").test(raw));
      const top = asked ? open.slice(0, Number(asked) || NUMBER_WORDS[asked as string]) : open;
      return {
        id: "wonder-prepare-top",
        label: `Prepare packs for ${top.length === 1 ? "your strongest match" : `your ${top.length} strongest matches`}`,
        hint: `${top.map((j) => `${j.title} · ${j.company}`).join(" · ")} — Wonder prepares; nothing is sent to an employer.`,
        href: "/app/jobs?fit=strong",
      };
    }
    case "career_headline":
      return {
        id: "wonder-headline",
        label: "Update your headline in Career Profile",
        hint: "LinkedIn isn't connected — Wonder has no way to read or write it. Edit your headline directly instead.",
        href: "/app/career-dna",
      };
    case "missing_skills": {
      const list = computeMissingSkills(ctx.dna, Object.values(ctx.jobs), ctx.matches);
      if (!list.length) return { id: "wonder-skills", label: "No skill gaps found in your current matches", hint: "Every skill your strong and worth-considering matches ask for is already in your Career Profile.", href: "/app/career-dna" };
      return { id: "wonder-skills", label: "Skills your matches ask for that aren't in your Career Profile yet", hint: list.map((s) => s.name).join(", "), href: "/app/career-dna" };
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
      const q = intent.subject;
      return {
        id: "wonder-schedule",
        label: q ? `Keep looking for "${q}"` : "Keep Wonder looking",
        hint: "You choose how often and confirm before anything is scheduled.",
        href: `/app/automation/scheduled/new?often=${lookFrequencyFor(raw)}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
      };
    }
    case "explain_why_not_shown": {
      const job = findJobBySubject(ctx.jobsOrder, ctx.jobs, intent.subject);
      const result = explainJobVisibility(job, ctx.matches, ctx.rejected, ctx.saved, ctx.filters, ctx.now);
      if (!result.inCatalog) return { id: "wonder-why", label: `"${intent.subject || raw}" isn't in your current search results`, hint: "It may not have been discovered yet, or it's from an earlier run. Try a new search.", href: `/app/jobs?q=${encodeURIComponent(intent.subject)}` };
      if (result.visible) return { id: "wonder-why", label: `${job!.title} · ${job!.company} is already visible`, hint: "It isn't hidden by any of your active filters.", href: `/app/jobs/${job!.id}` };
      // The job page shows the same reason with "Show it anyway" / "Change preference".
      return { id: "wonder-why", label: `Hidden because it's ${FILTER_REASON_LABEL[result.reason!]}`, hint: `${job!.title} · ${job!.company} — open it to show it anyway or change the preference`, href: `/app/jobs/${job!.id}` };
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
