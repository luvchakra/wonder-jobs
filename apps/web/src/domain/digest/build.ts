/**
 * The activity digest: what happened on a candidate's account since the last one, read from their own
 * state — runs, jobs, applications, Career Profile, learned patterns. Every line is counted from that
 * state; nothing is estimated, and a section with nothing true to say is left out.
 *
 * Sections: key details (what happened), heads up (time-sensitive), one call to action, what's waiting on
 * the candidate (dependencies), what's going well, what needs improvement, and suggestions. Suggestions
 * come from fixed rules, and optionally from AI — kept only when they cite facts listed here (see
 * `checkedDigestSuggestions`), and labelled as AI's in the email.
 */
import type { Application } from "@/domain/applications/types";
import type { CareerDNA } from "@/domain/career/types";
import type { LearnedSignal } from "@/domain/career/learning";
import type { CanonicalJob, JobMatch } from "@/domain/jobs/types";
import type { WorkflowRun } from "@/domain/workflow/types";

export interface DigestInput {
  now: Date;
  /** The start of the period: the last digest, or a week back at most. */
  since: string;
  dna: CareerDNA;
  learnedSignals: LearnedSignal[];
  answerMemory: { confirmedAt: string }[];
  jobs: Record<string, CanonicalJob>;
  matches: Record<string, JobMatch>;
  saved: Record<string, string>;
  rejected: Record<string, string>;
  runs: WorkflowRun[];
  applications: Application[];
}

export interface DigestFact {
  key: string;
  label: string;
  value: string;
}

export interface DigestItem {
  text: string;
  href?: string;
  /** Who said it: fixed rules, or AI (shown as such). */
  origin?: "rules" | "ai";
}

export interface Digest {
  since: string;
  until: string;
  hasActivity: boolean;
  keyDetails: DigestItem[];
  headsUp: DigestItem[];
  cta: { label: string; href: string };
  dependencies: DigestItem[];
  goingWell: DigestItem[];
  needsImprovement: DigestItem[];
  suggestions: DigestItem[];
  facts: DigestFact[];
  /** A short subject line from the most important things. */
  subject: string;
}

const DAY = 86_400_000;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export function buildDigest(input: DigestInput): Digest {
  const { now, since, dna } = input;
  const t = now.getTime();
  const after = (iso?: string) => !!iso && iso > since && iso <= now.toISOString();
  const jobName = (jobId: string) => {
    const j = input.jobs[jobId];
    return j ? `${j.title} at ${j.company}` : "an application";
  };

  // ---- what happened
  const runs = input.runs.filter((r) => after(r.completedAt));
  const searches = runs.filter((r) => r.status === "COMPLETED" || r.status === "COMPLETED_WITH_WARNINGS");
  const failed = runs.filter((r) => r.status === "FAILED");
  const foundNothing = failed.filter((r) => r.error?.category === "user_action_required" && /^No jobs matched/.test(r.error.message));
  const reviewed = searches.reduce((n, r) => n + (r.summary?.jobsRetained ?? 0), 0);
  const strongFound = searches.reduce((n, r) => n + (r.summary?.strongMatches ?? 0), 0);
  const saved = Object.values(input.saved).filter(after).length;
  const rejected = Object.values(input.rejected).filter(after).length;
  const apps = input.applications;
  const submitted = apps.filter((a) => after(a.appliedAt)).length;
  const movedTo = (status: string) => apps.filter((a) => a.status === status && a.events.some((e) => after(e.at))).length;
  const interviews = movedTo("interview");
  const offers = movedTo("offer");
  const newApps = apps.filter((a) => after(a.createdAt)).length;
  const profileUpdated = after(dna.updatedAt);
  const learned = input.learnedSignals.filter((s) => s.status !== "dismissed" && after(s.lastObserved)).length;
  const answers = input.answerMemory.filter((m) => after(m.confirmedAt)).length;

  // ---- what's waiting
  const open = apps.flatMap((a) => (a.followUps ?? []).filter((f) => !f.done).map((f) => ({ f, a })));
  const interviewsSoon = open.filter(({ f }) => f.kind === "interview" && Date.parse(f.dueAt) >= t && Date.parse(f.dueAt) <= t + 7 * DAY).sort((x, y) => x.f.dueAt.localeCompare(y.f.dueAt));
  const overdue = open.filter(({ f }) => f.kind !== "interview" && Date.parse(f.dueAt) < t);
  const dueSoon = open.filter(({ f }) => f.kind !== "interview" && Date.parse(f.dueAt) >= t && Date.parse(f.dueAt) <= t + 3 * DAY);
  const acted = new Set([...Object.keys(input.saved), ...Object.keys(input.rejected), ...apps.map((a) => a.jobId)]);
  const strongWaiting = Object.values(input.matches).filter((m) => m.fit === "strong" && input.jobs[m.jobId] && !acted.has(m.jobId)).length;
  const quiet = apps.filter((a) => a.status === "submitted" && a.appliedAt && t - Date.parse([a.appliedAt, ...a.events.map((e) => e.at)].sort().at(-1)!) > 14 * DAY);
  const forReview = apps.filter((a) => a.status === "ready_for_review").length;
  const toConfirm = input.learnedSignals.filter((s) => s.status === "suggested").length;

  const facts: DigestFact[] = [];
  const fact = (key: string, label: string, value: string | number) => facts.push({ key, label, value: String(value) });
  fact("period.days", "Days covered", Math.max(1, Math.round((t - Date.parse(since)) / DAY)));
  fact("activity.searches", "Searches that ran", searches.length);
  fact("activity.jobsReviewed", "Jobs reviewed", reviewed);
  fact("activity.strongFound", "Strong matches found", strongFound);
  fact("activity.searchesFoundNothing", "Searches that found nothing", foundNothing.length);
  fact("activity.searchesFailed", "Searches that failed", failed.length - foundNothing.length);
  fact("activity.saved", "Jobs saved", saved);
  fact("activity.rejected", "Jobs marked not for me", rejected);
  fact("activity.applied", "Applications sent", submitted);
  fact("activity.interviews", "Applications moved to interview", interviews);
  fact("activity.offers", "Offers", offers);
  fact("waiting.strongMatches", "Strong matches not yet saved, applied to or turned down", strongWaiting);
  fact("waiting.interviewsThisWeek", "Interviews in the next 7 days", interviewsSoon.length);
  fact("waiting.overdueFollowUps", "Overdue follow-ups", overdue.length);
  fact("waiting.quietApplications", "Applications with no news for 14+ days", quiet.length);
  fact("waiting.readyForReview", "Applications ready for your review", forReview);
  fact("profile.roleWanted", "Role you want", dna.careerGoal || "not set");
  fact("profile.locations", "Preferred locations", dna.preferredLocations.length ? dna.preferredLocations.join(", ") : "not set");
  fact("profile.skills", "Skills in profile", dna.skills.length);
  fact("profile.minSalary", "Minimum salary", dna.minSalary ? String(dna.minSalary) : "not set");

  // ---- key details
  const keyDetails: DigestItem[] = [];
  if (searches.length) keyDetails.push({ text: `${plural(searches.length, "search", "searches")} reviewed ${plural(reviewed, "job")} and found ${plural(strongFound, "strong match", "strong matches")}.`, href: "/app/jobs" });
  if (saved || rejected) keyDetails.push({ text: [saved && `You saved ${plural(saved, "job")}`, rejected && `marked ${plural(rejected, "job")} not for me`].filter(Boolean).join(" and ") + ".", href: "/app/jobs" });
  if (newApps || submitted) keyDetails.push({ text: [newApps && `${plural(newApps, "application")} started`, submitted && `${plural(submitted, "application")} sent`].filter(Boolean).join(", ") + ".", href: "/app/applications" });
  if (interviews) keyDetails.push({ text: `${plural(interviews, "application")} moved to interview.`, href: "/app/applications" });
  if (offers) keyDetails.push({ text: `${plural(offers, "offer")}.`, href: "/app/applications" });
  if (profileUpdated) keyDetails.push({ text: "Your Career Profile was updated.", href: "/app/career-dna" });
  if (learned || answers) keyDetails.push({ text: [learned && `Wonder learned ${plural(learned, "new pattern")} from what you chose`, answers && `remembered ${plural(answers, "answer")} from application forms`].filter(Boolean).join(" and ") + ".", href: "/app/career-dna" });

  // ---- heads up
  const headsUp: DigestItem[] = [];
  for (const { f, a } of interviewsSoon.slice(0, 3)) headsUp.push({ text: `Interview for ${jobName(a.jobId)} on ${day(f.dueAt)}.`, href: `/app/applications/${a.id}` });
  if (overdue.length) headsUp.push({ text: `${plural(overdue.length, "follow-up")} ${overdue.length === 1 ? "is" : "are"} overdue.`, href: "/app/applications" });
  if (dueSoon.length) headsUp.push({ text: `${plural(dueSoon.length, "follow-up")} due in the next 3 days.`, href: "/app/applications" });
  if (strongWaiting) headsUp.push({ text: `${plural(strongWaiting, "strong match", "strong matches")} ${strongWaiting === 1 ? "is" : "are"} waiting for you to decide.`, href: "/app/jobs" });
  for (const a of quiet.slice(0, 2)) headsUp.push({ text: `No news on ${jobName(a.jobId)} for over two weeks — a follow-up may help.`, href: `/app/applications/${a.id}` });
  if (foundNothing.length) headsUp.push({ text: `${plural(foundNothing.length, "search", "searches")} found nothing — the search may be too narrow.`, href: "/app/jobs" });
  if (failed.length - foundNothing.length > 0) headsUp.push({ text: `${plural(failed.length - foundNothing.length, "search", "searches")} couldn't finish.`, href: "/app/jobs" });

  // ---- one call to action
  const cta = interviewsSoon.length
    ? { label: "Prepare for your interview", href: `/app/applications/${interviewsSoon[0].a.id}` }
    : overdue.length
      ? { label: "Send your follow-ups", href: "/app/applications" }
      : forReview
        ? { label: "Review your applications", href: "/app/applications" }
        : strongWaiting
          ? { label: `Review ${plural(strongWaiting, "strong match", "strong matches")}`, href: "/app/jobs" }
          : { label: "Open WonderJobs", href: "/app" };

  // ---- waiting on you
  const dependencies: DigestItem[] = [];
  if (!dna.careerGoal.trim()) dependencies.push({ text: "Add the role you want — searches need it.", href: "/app/career-dna" });
  if (!dna.preferredLocations.length) dependencies.push({ text: "Add where you want to work, so matches can judge location.", href: "/app/career-dna" });
  if (dna.skills.length < 3) dependencies.push({ text: "Add your main skills, so matches can judge fit.", href: "/app/career-dna" });
  if (!dna.minSalary) dependencies.push({ text: "Add your minimum salary, so pay can be judged.", href: "/app/career-dna" });
  if (forReview) dependencies.push({ text: `${plural(forReview, "application")} ${forReview === 1 ? "is" : "are"} ready for your review.`, href: "/app/applications" });
  if (toConfirm) dependencies.push({ text: `Confirm or turn off ${plural(toConfirm, "pattern")} Wonder learned.`, href: "/app/career-dna" });

  // ---- going well / needs improvement
  const goingWell: DigestItem[] = [];
  if (strongFound) goingWell.push({ text: `Wonder found ${plural(strongFound, "strong match", "strong matches")} for you.` });
  if (submitted) goingWell.push({ text: `You sent ${plural(submitted, "application")}.` });
  if (interviews) goingWell.push({ text: `${plural(interviews, "application")} reached interview.` });
  if (offers) goingWell.push({ text: `${plural(offers, "offer")} came in.` });
  if (learned || answers) goingWell.push({ text: "Wonder is learning what you want — your choices are shaping your matches." });

  const needsImprovement: DigestItem[] = [];
  if (searches.length && reviewed >= 20 && strongFound === 0) needsImprovement.push({ text: `None of the ${plural(reviewed, "job")} reviewed was a strong match.` });
  if (strongWaiting >= 3 && !submitted && !saved) needsImprovement.push({ text: `${plural(strongWaiting, "strong match", "strong matches")} but nothing saved or sent yet.` });
  if (rejected >= 5 && rejected > saved * 3) needsImprovement.push({ text: `You turned down ${plural(rejected, "job")} — the search may be too broad.` });
  if (quiet.length) needsImprovement.push({ text: `${plural(quiet.length, "application")} without a reply for over two weeks.` });
  if (foundNothing.length) needsImprovement.push({ text: "Some searches found nothing." });

  // ---- rule suggestions (AI may add more; see checkedDigestSuggestions)
  const suggestions: DigestItem[] = [];
  if (searches.length && reviewed >= 20 && strongFound === 0) suggestions.push({ text: "Make “Role you want” match how employers title the job, and add the skills postings ask for.", href: "/app/career-dna", origin: "rules" });
  if (rejected >= 5 && rejected > saved * 3) suggestions.push({ text: "Add a level or a location to your search so fewer off-target jobs come through.", href: "/app/jobs", origin: "rules" });
  if (quiet.length) suggestions.push({ text: "Send a short, polite follow-up on applications that have gone quiet.", href: "/app/applications", origin: "rules" });
  if (strongWaiting >= 3 && !submitted) suggestions.push({ text: "Pick your two strongest matches and start an application today.", href: "/app/jobs", origin: "rules" });

  const hasActivity = !!(searches.length || failed.length || saved || rejected || newApps || submitted || interviews || offers || profileUpdated || learned || answers);
  const subjectBits = [interviewsSoon.length && `interview ${day(interviewsSoon[0].f.dueAt)}`, strongFound && plural(strongFound, "strong match", "strong matches"), submitted && plural(submitted, "application") + " sent", overdue.length && plural(overdue.length, "follow-up") + " overdue"].filter(Boolean) as string[];
  const subject = subjectBits.length ? `Your WonderJobs digest: ${subjectBits.slice(0, 2).join(", ")}` : "Your WonderJobs digest";

  return { since, until: now.toISOString(), hasActivity, keyDetails, headsUp, cta, dependencies, goingWell, needsImprovement, suggestions, facts, subject };
}

/**
 * AI suggestions for a digest, kept only when each cites at least one fact listed in it (by key) — so a
 * suggestion is about the candidate's actual numbers, never a generic tip — and capped at three.
 */
export function checkedDigestSuggestions(raw: { text: string; facts: string[] }[] | undefined, d: Digest): DigestItem[] {
  const keys = new Set(d.facts.map((f) => f.key));
  const existing = new Set(d.suggestions.map((s) => s.text.toLowerCase()));
  return (raw ?? [])
    .filter((r) => r.text.trim().length >= 10 && r.facts.some((k) => keys.has(k)) && !existing.has(r.text.trim().toLowerCase()))
    .slice(0, 3)
    .map((r) => ({ text: r.text.trim().slice(0, 300), origin: "ai" as const }));
}
