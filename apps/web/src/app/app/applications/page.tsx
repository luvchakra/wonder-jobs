"use client";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { APPLICATION_STATUS_META, type Application, type ApplicationStatus } from "@/domain/applications/types";
import { computeApplicationAttention } from "@/domain/career/attention";
import { useNow } from "@/lib/motion";
import { PageHeader, SectionHeader } from "@/components/layout/PageHeader";
import { Tabs } from "@/components/common/Tabs";
import { Segmented } from "@/components/common/Input";
import { Button } from "@/components/common/Button";
import { EmptyState, PageLoading } from "@/components/common/States";
import { Modal } from "@/components/common/Modal";
import { Field, Select } from "@/components/common/Input";
import { ApplicationCard, applicationHref } from "@/components/applications/ApplicationCard";
import { ApplicationAttentionList } from "@/components/applications/ApplicationAttentionList";

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
  const now = useNow();
  const paramTab = params.get("tab") as Tab | null;
  const [pickedTab, setTab] = useState<Tab | null>(null);
  const tab: Tab = pickedTab ?? (paramTab && TABS.some((x) => x.value === paramTab) ? paramTab : "all");
  const [view, setView] = useState<ViewMode>("timeline");
  const [adding, setAdding] = useState(false);
  const [pickJob, setPickJob] = useState("");

  const list = useMemo(() => Object.values(applications).sort((a, b) => (b.appliedAt ?? b.createdAt).localeCompare(a.appliedAt ?? a.createdAt)), [applications]);
  const counts = { all: list.length, in_progress: list.filter((a) => groupOf(a) === "in_progress").length, submitted: list.filter((a) => groupOf(a) === "submitted").length, interview: list.filter((a) => groupOf(a) === "interview").length, outcome: list.filter((a) => groupOf(a) === "outcome").length };
  const visible = tab === "all" ? list : list.filter((a) => groupOf(a) === tab);
  const candidates = Object.keys(saved).filter((id) => jobs[id] && !list.some((a) => a.jobId === id));
  const needsAttention = useMemo(() => computeApplicationAttention(applications, now), [applications, now]);

  return (
    <div>
      <PageHeader
        title="Applications"
        description="Track every application from discovery to outcome. Wonder keeps the timeline; you make the calls."
        actions={
          <>
            <Segmented<ViewMode> label="View" value={view} onChange={setView} options={[{ value: "timeline", label: "Timeline" }, { value: "list", label: "List" }]} size="sm" />
            <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>
              Add
            </Button>
          </>
        }
      />
      {list.length === 0 ? (
        <EmptyState title="No applications yet" body="Save a job and prepare an application, or let a Wonder run prepare materials for your strongest matches." action={{ label: "Find jobs", href: "/app/jobs" }} />
      ) : view === "timeline" ? (
        <div className="flex flex-col gap-6">
          {needsAttention.length > 0 && (
            <section aria-labelledby="apps-needs-attention">
              <SectionHeader title="Needs attention" />
              <ApplicationAttentionList items={needsAttention} jobs={jobs} hrefFor={(id) => (applications[id] ? applicationHref(applications[id]) : `/app/applications/${id}`)} />
            </section>
          )}
          <section aria-labelledby="apps-pipeline">
            <SectionHeader title="Pipeline" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              {STAGES.map((stage) => {
                const items = list.filter((a) => groupOf(a) === stage.group);
                return (
                  <div key={stage.group} className="min-w-0">
                    <div className="mb-2 flex items-center justify-between px-1">
                      <h3 className="text-[13px] font-semibold text-ink-2">{stage.label}</h3>
                      <span className="text-[12px] text-ink-4">{items.length}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {items.length === 0 ? (
                        <p className="rounded-[12px] border border-dashed border-line px-3 py-6 text-center text-[12px] text-ink-4">Nothing here</p>
                      ) : (
                        items.map((a) => (
                          <div key={a.id} className="relative">
                            <ApplicationCard application={a} job={jobs[a.jobId]} compact />
                            {stage.group === "submitted" && hasRecruiterResponse(a) && (
                              <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-info-100 px-2 py-0.5 text-[10px] font-medium text-info-600">Recruiter replied</span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
