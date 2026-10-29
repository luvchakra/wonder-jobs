"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useUIStore } from "@/store/ui";
import { cardStatus } from "@/domain/applications/cardStatus";
import { MOMENTUM_META, MOMENTUM_ORDER, momentumOf, type Momentum } from "@/domain/applications/momentum";
import { PREP_FACETS, prepFacets, splitFacets, type PrepFacet } from "@/domain/applications/preparing";
import { useCareerStore } from "@/store/career";
import { useNow } from "@/lib/motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Minus, Plus, X } from "lucide-react";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { APPLICATION_STATUS_META, applicationJobOf, FUNNEL_STAGES, type Application, type ApplicationStatus } from "@/domain/applications/types";
import { useRecoverJobs } from "@/modules/jobs/components/useRecoverJobs";
import { removeFromPipeline } from "@/lib/pipeline";
import { toast } from "@/components/feedback/Toast";
import { PageHeader, SectionHeader } from "@/wonderstar/chrome/PageHeader";
import { Tabs } from "@/components/common/Tabs";
import { StageEmpty, StageFilter, StageList, StageTiles } from "@/wonderstar/pipeline/parts";
import { Button } from "@/components/common/Button";
import { EmptyState, PageLoading } from "@/components/common/States";
import { Modal } from "@/components/common/Modal";
import { Field, Select } from "@/components/common/Input";
import { ApplicationCard } from "@/modules/jobs/pipeline/ApplicationCard";

type Tab = "all" | "in_progress" | "submitted" | "interview" | "outcome";
const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in_progress", label: "In Progress" },
  { value: "submitted", label: "Submitted" },
  { value: "interview", label: "Interview" },
  { value: "outcome", label: "Offer / Outcome" },
];

type ViewMode = "timeline" | "list";
type StatusGroup = (typeof APPLICATION_STATUS_META)[ApplicationStatus]["group"];

function groupOf(a: Application): StatusGroup {
  return APPLICATION_STATUS_META[a.status].group;
}

// Applied -> Recruiter contacted -> Interview -> Offer/Rejected, mapped onto the real status
// groups Wonder actually tracks (there's no distinct "recruiter contacted" status — a real
// recruiter_response event on an "Applied" card is shown instead of inventing one).
/** Interview's filter: rounds done, three or more together. */
const ROUND_LABEL = ["Not started", "1 round", "2 rounds", "3+ rounds"];

const STAGES: { group: StatusGroup; label: string }[] = [
  { group: "in_progress", label: "Preparing" },
  { group: "submitted", label: "Applied" },
  { group: "interview", label: "Interview" },
  { group: "outcome", label: "Outcome" },
];

function ApplicationsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const applications = useApplicationsStore((s) => s.applications);
  const create = useApplicationsStore((s) => s.create);
  const jobs = useJobsStore((s) => s.jobs);
  const saved = useJobsStore((s) => s.saved);
  const paramTab = params.get("tab") as Tab | null;
  const [pickedTab, setTab] = useState<Tab | null>(null);
  const tab: Tab = pickedTab ?? (paramTab && TABS.some((x) => x.value === paramTab) ? paramTab : "all");
  // A status deep link (?tab=interview) opens that list; otherwise the pipeline.
  // A count on Insights (?stage=submitted) opens exactly the applications it counted.
  const stage = FUNNEL_STAGES.find((f) => f.key === params.get("stage"));
  const view: ViewMode = pickedTab || paramTab || stage ? "list" : "timeline";
  const [adding, setAdding] = useState(false);
  const [pickJob, setPickJob] = useState("");

  // A job only saved is in Saved, not the Pipeline: the Pipeline starts once an application is being prepared.
  const list = useMemo(() => Object.values(applications).filter((a) => a.status !== "saved").sort((a, b) => (b.appliedAt ?? b.createdAt).localeCompare(a.appliedAt ?? a.createdAt)), [applications]);
  const counts = { all: list.length, in_progress: list.filter((a) => groupOf(a) === "in_progress").length, submitted: list.filter((a) => groupOf(a) === "submitted").length, interview: list.filter((a) => groupOf(a) === "interview").length, outcome: list.filter((a) => groupOf(a) === "outcome").length };
  const visible = (tab === "all" ? list : list.filter((a) => groupOf(a) === tab)).filter((a) => !stage || pickedTab || stage.reached(a));
  const candidates = Object.keys(saved).filter((id) => jobs[id] && !list.some((a) => a.jobId === id));
  // The stage shown: the one picked, else the first with anything in it.
  // The stage last opened, kept between visits; until one is picked, the first with anything in it.
  const pickedStage = useUIStore((s) => s.pipelineStage) ?? null;
  const setPickedStage = useUIStore((s) => s.setPipelineStage);
  // A status within the stage shown (Offer, Rejected…), until another stage is opened.
  const [statusFilter, setStatusFilter] = useState<{ stage: StatusGroup; status: ApplicationStatus } | null>(null);
  // Applied: where each sent application actually stands (Promising, Follow up, Waiting, Gone quiet).
  const [momentumFilter, setMomentumFilter] = useState<Momentum | null>(null);
  // Interview: by rounds done (0, 1, 2, 3+).
  const [roundsFilter, setRoundsFilter] = useState<number | null>(null);
  const setRounds = useApplicationsStore((s) => s.setInterviewRounds);
  // Preparing: résumé made or not, Apply opened or not.
  const [prepFilter, setPrepFilter] = useState<PrepFacet | null>(null);
  const savedResumes = useCareerStore((s) => s.savedResumes);
  const resumeJobs = useMemo(() => new Set(savedResumes.flatMap((r) => (r.target?.jobId ? [r.target.jobId] : []))), [savedResumes]);
  const applyOpenedAt = useJobsStore((s) => s.applyOpenedAt);
  const now = useNow();
  const shownStage = pickedStage ?? STAGES.find((st) => list.some((a) => groupOf(a) === st.group))?.group ?? "in_progress";
  const [removing, setRemoving] = useState<Application | null>(null);
  // Jobs that left the search results are found again; every application keeps its own copy of its job.
  useRecoverJobs(list.map((a) => a.jobId));
  useEffect(() => {
    const byJob = Object.fromEntries(list.filter((a) => !a.job && jobs[a.jobId]).map((a) => [a.jobId, applicationJobOf(jobs[a.jobId])]));
    if (Object.keys(byJob).length) useApplicationsStore.getState().keepJobs(byJob);
  }, [list, jobs]);

  return (
    <div>
      <PageHeader
        title="Applications"
        actions={
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>
            Add
          </Button>
        }
      />
      {list.length === 0 ? (
        <EmptyState title="No applications yet" body="Save a job and prepare an application, or let a Wonder run prepare materials for your strongest matches." action={{ label: "Find jobs", href: "/app/jobs" }} />
      ) : view === "timeline" ? (
        <div className="flex flex-col gap-6">
          {/* The stages as one row of counts; tapping one shows its applications (one stage at a time). */}
          <section aria-labelledby="apps-pipeline">
            <SectionHeader title="Pipeline" />
            <StageTiles label="Applications by stage" stages={STAGES.map((st) => ({ id: st.group, label: st.label, count: list.filter((a) => groupOf(a) === st.group).length }))} current={shownStage} onPick={setPickedStage} />
            {(() => {
              const inStage = list.filter((a) => groupOf(a) === shownStage);
              const label = STAGES.find((st) => st.group === shownStage)!.label;
              // Applied is filtered by where each one stands, the other stages by status.
              const applied = shownStage === "submitted";
              const standing = new Map(applied ? inStage.map((a) => [a.id, momentumOf(a, now)] as const) : []);
              const moments = MOMENTUM_ORDER.filter((m) => inStage.some((a) => standing.get(a.id)?.momentum === m));
              const pickedMoment = applied && momentumFilter && moments.includes(momentumFilter) ? momentumFilter : null;
              // The statuses this stage holds now, with counts: a filter row only when there's more than one.
              const statuses = [...new Set(inStage.map((a) => a.status))];
              const picked = !applied && statusFilter?.stage === shownStage && statuses.includes(statusFilter.status) ? statusFilter.status : null;
              const interviewing = shownStage === "interview";
              const roundsOf = (a: Application) => Math.min(3, a.interviewRounds ?? 0);
              const roundGroups = [0, 1, 2, 3].filter((r) => inStage.some((a) => roundsOf(a) === r));
              const pickedRounds = interviewing && roundsFilter !== null && roundGroups.includes(roundsFilter) ? roundsFilter : null;
              const preparing = shownStage === "in_progress";
              const facetsOf = new Map(preparing ? inStage.map((a) => [a.id, prepFacets(a, resumeJobs, applyOpenedAt)] as const) : []);
              const prepChips = preparing ? splitFacets([...facetsOf.values()]) : [];
              const pickedPrep = prepFilter && prepChips.includes(prepFilter) ? prepFilter : null;
              const items = pickedPrep ? inStage.filter((a) => facetsOf.get(a.id)?.includes(pickedPrep)) : pickedMoment ? inStage.filter((a) => standing.get(a.id)?.momentum === pickedMoment) : pickedRounds !== null ? inStage.filter((a) => roundsOf(a) === pickedRounds) : picked ? inStage.filter((a) => a.status === picked) : inStage;
              const filters = preparing ? (
                prepChips.length ? (
                  <StageFilter label="Filter Preparing" all={inStage.length} options={PREP_FACETS.filter((f) => prepChips.includes(f.facet)).map((f) => ({ value: f.facet, label: f.label, count: inStage.filter((a) => facetsOf.get(a.id)?.includes(f.facet)).length }))} value={pickedPrep} onPick={setPrepFilter} />
                ) : null
              ) : interviewing ? (
                roundGroups.length > 1 ? (
                  <StageFilter label="Filter Interview by rounds done" all={inStage.length} options={roundGroups.map((r) => ({ value: r, label: ROUND_LABEL[r], count: inStage.filter((a) => roundsOf(a) === r).length }))} value={pickedRounds} onPick={setRoundsFilter} />
                ) : null
              ) : applied ? (
                moments.length > 1 ? (
                  <StageFilter label="Filter Applied by where each stands" all={inStage.length} options={moments.map((m) => ({ value: m, label: MOMENTUM_META[m].label, count: inStage.filter((a) => standing.get(a.id)?.momentum === m).length }))} value={pickedMoment} onPick={setMomentumFilter} />
                ) : null
              ) : statuses.length > 1 ? (
                  <StageFilter label={`Filter ${label} by status`} all={inStage.length} options={statuses.map((st) => ({ value: st, label: cardStatus({ status: st }).label, count: inStage.filter((a) => a.status === st).length }))} value={picked} onPick={(st) => setStatusFilter(st === null ? null : { stage: shownStage, status: st })} />
                ) : null;
              return items.length === 0 ? (
                <StageEmpty label={label} />
              ) : (
                <>
                {filters}
                <StageList label={label}>
                  {items.map((a) => (
                    <li key={a.id} className="relative">
                      <ApplicationCard
                        application={a}
                        job={jobs[a.jobId]}
                        compact
                        actionSpace={shownStage === "interview" || standing.get(a.id)?.momentum === "follow_up"}
                        badge={standing.get(a.id) ? MOMENTUM_META[standing.get(a.id)!.momentum] : interviewing && a.interviewRounds ? { label: `${a.interviewRounds} ${a.interviewRounds === 1 ? "round" : "rounds"} done`, tone: "brand" } : undefined}
                        note={standing.get(a.id)?.reason}
                        tags={preparing ? (facetsOf.get(a.id) ?? []).map((f) => PREP_FACETS.find((x) => x.facet === f)!.label) : undefined}
                        className="pr-11"
                      />
                      {standing.get(a.id)?.momentum === "follow_up" && (
                        <Button size="sm" href={`/app/applications/${a.id}?followup=1`} className="absolute bottom-3 right-3" aria-label={`Follow up with ${a.job?.company ?? jobs[a.jobId]?.company ?? "the employer"}`}>
                          Follow up
                        </Button>
                      )}
                      {shownStage === "interview" && (
                        <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
                          {/* Rounds done: − and + beside Prepare; each + is noted on the timeline. */}
                          <span className="flex items-center rounded-full border border-line bg-surface" role="group" aria-label={`Interview rounds done at ${a.job?.company ?? jobs[a.jobId]?.company ?? "this job"}`}>
                            <button type="button" onClick={() => setRounds(a.id, (a.interviewRounds ?? 0) - 1)} disabled={!a.interviewRounds} aria-label="One round fewer" className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-bg-soft disabled:opacity-40">
                              <Minus className="size-3.5" aria-hidden />
                            </button>
                            <span className="min-w-5 text-center text-[13px] font-semibold tabular-nums text-ink" aria-live="polite">
                              {a.interviewRounds ?? 0}
                            </span>
                            <button type="button" onClick={() => setRounds(a.id, (a.interviewRounds ?? 0) + 1)} aria-label="One more round done" className="grid size-8 place-items-center rounded-full text-brand-600 hover:bg-brand-50">
                              <Plus className="size-3.5" aria-hidden />
                            </button>
                          </span>
                          <Button size="sm" href={`/app/applications/${a.id}/interview`} aria-label={`Prepare for the ${a.job?.company ?? jobs[a.jobId]?.company ?? ""} interview`}>
                            Prepare
                          </Button>
                        </div>
                      )}
                      <button type="button" onClick={() => setRemoving(a)} aria-label={`Remove ${a.job?.company ?? jobs[a.jobId]?.company ?? "this job"} from Pipeline`} title="Remove from Pipeline" className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-full text-ink-4 hover:bg-bg-soft hover:text-danger-600">
                        <X className="size-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </StageList>
                </>
              );
            })()}
          </section>
        </div>
      ) : (
        <>
          <Tabs value={tab} onChange={setTab} label="Application status" items={TABS.map((t) => ({ ...t, count: counts[t.value] }))} className="mb-5" />
          {visible.length === 0 ? (
            <EmptyState title={`Nothing ${TABS.find((t) => t.value === tab)?.label.toLowerCase()}`} body="Save a job and prepare an application, or let a Wonder run prepare materials for your strongest matches." action={{ label: "Find jobs", href: "/app/jobs" }} />
          ) : (
            <ul className="flex flex-col gap-3">
              {visible.map((a) => (
                <li key={a.id}>
                  <ApplicationCard application={a} job={jobs[a.jobId]} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Remove from Pipeline?"
        description="Its drafts, follow-ups and reminders are removed, and any email or submission not yet sent is cancelled. Anything already sent stays sent. The job goes back to Find."
        footer={
          <>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button
              onClick={() => {
                const a = removing!;
                setRemoving(null);
                void removeFromPipeline(a.id);
                toast.success("Removed from Pipeline", "It's back in Find, marked Removed from Pipeline.");
              }}
            >
              Remove
            </Button>
          </>
        }
      >
        {removing && <p className="text-[14px] text-ink-2">{removing.job?.title ?? jobs[removing.jobId]?.title} — {removing.job?.company ?? jobs[removing.jobId]?.company}</p>}
      </Modal>
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add an application"
        description="Pick a saved job to start tracking it."
        footer={
          <>
            <Button variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              disabled={!pickJob}
              onClick={() => {
                const app = create(pickJob, "saved");
                setAdding(false);
                router.push(`/app/applications/${app.id}/prepare`);
              }}
            >
              Add & prepare
            </Button>
          </>
        }
      >
        {candidates.length ? (
          <Field label="Saved job" htmlFor="pick-job" required hint="Only saved jobs you're not already tracking appear here.">
            <Select id="pick-job" value={pickJob} onChange={(e) => setPickJob(e.target.value)}>
              <option value="">Choose a job…</option>
              {candidates.map((id) => (
                <option key={id} value={id}>
                  {jobs[id].title} — {jobs[id].company}
                </option>
              ))}
            </Select>
            {!pickJob && <p className="mt-1.5 text-xs text-ink-3">Choose a job to continue.</p>}
          </Field>
        ) : (
          <p className="text-sm text-ink-3">
            All your saved jobs are already being tracked.{" "}
            <Button variant="ghost" size="sm" href="/app/jobs">
              Find more
            </Button>
          </p>
        )}
      </Modal>
    </div>
  );
}

export default function ApplicationsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ApplicationsInner />
    </Suspense>
  );
}
