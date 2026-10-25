"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useUIStore } from "@/store/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, X } from "lucide-react";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { APPLICATION_STATUS_META, applicationJobOf, FUNNEL_STAGES, type Application, type ApplicationStatus } from "@/domain/applications/types";
import { useRecoverJobs } from "@/components/jobs/useRecoverJobs";
import { removeFromPipeline } from "@/lib/pipeline";
import { toast } from "@/components/feedback/Toast";
import { PageHeader, SectionHeader } from "@/components/layout/PageHeader";
import { Tabs } from "@/components/common/Tabs";
import { Button } from "@/components/common/Button";
import { EmptyState, PageLoading } from "@/components/common/States";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/common/Modal";
import { Field, Select } from "@/components/common/Input";
import { ApplicationCard } from "@/components/applications/ApplicationCard";

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
const STAGES: { group: StatusGroup; label: string }[] = [
  { group: "in_progress", label: "Preparing" },
  { group: "submitted", label: "Applied" },
  { group: "interview", label: "Interview" },
  { group: "outcome", label: "Outcome" },
];

function hasRecruiterResponse(a: Application) {
  return a.events.some((e) => e.type === "recruiter_response");
}

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
  const visible = (tab === "all" ? list : list.filter((a) => groupOf(a) === tab)).filter((a) => !stage?.statuses || pickedTab || stage.statuses.includes(a.status));
  const candidates = Object.keys(saved).filter((id) => jobs[id] && !list.some((a) => a.jobId === id));
  // The stage shown: the one picked, else the first with anything in it.
  // The stage last opened, kept between visits; until one is picked, the first with anything in it.
  const pickedStage = useUIStore((s) => s.pipelineStage) ?? null;
  const setPickedStage = useUIStore((s) => s.setPipelineStage);
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
            <div role="tablist" aria-label="Applications by stage" className="mb-4 grid grid-cols-4 gap-2">
              {STAGES.map((st) => {
                const n = list.filter((a) => groupOf(a) === st.group).length;
                const on = st.group === shownStage;
                return (
                  <button key={st.group} type="button" role="tab" aria-selected={on} onClick={() => setPickedStage(st.group)} className={cn("flex min-h-[64px] flex-col items-center justify-center rounded-[14px] border px-1 py-2 text-center transition-colors", on ? "border-brand-400 bg-brand-50" : "border-line bg-surface hover:border-line-strong")}>
                    <span className={cn("text-[20px] font-semibold leading-none", n ? "text-brand-700" : "text-ink-4")}>{n}</span>
                    <span className="mt-1 text-[11.5px] font-medium text-ink-2">{st.label}</span>
                  </button>
                );
              })}
            </div>
            {(() => {
              const items = list.filter((a) => groupOf(a) === shownStage);
              const label = STAGES.find((st) => st.group === shownStage)!.label;
              return items.length === 0 ? (
                <p className="rounded-[12px] border border-dashed border-line px-3 py-4 text-center text-[13px] text-ink-3">Nothing in {label} yet.</p>
              ) : (
                <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3" aria-label={label}>
                  {items.map((a) => (
                    <li key={a.id} className="relative">
                      <ApplicationCard application={a} job={jobs[a.jobId]} compact actionSpace={shownStage === "interview"} className="pr-11" />
                      {shownStage === "interview" && (
                        <Button size="sm" href={`/app/applications/${a.id}/interview`} className="absolute bottom-3 right-3" aria-label={`Prepare for the ${a.job?.company ?? jobs[a.jobId]?.company ?? ""} interview`}>
                          Prepare
                        </Button>
                      )}
                      {shownStage === "submitted" && hasRecruiterResponse(a) && (
                        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-info-100 px-2 py-0.5 text-[10px] font-medium text-info-600">Recruiter replied</span>
                      )}
                      <button type="button" onClick={() => setRemoving(a)} aria-label={`Remove ${a.job?.company ?? jobs[a.jobId]?.company ?? "this job"} from Pipeline`} title="Remove from Pipeline" className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-full text-ink-4 hover:bg-bg-soft hover:text-danger-600">
                        <X className="size-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
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
