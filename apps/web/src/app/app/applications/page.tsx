"use client";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { APPLICATION_STATUS_META, type Application } from "@/domain/applications/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs } from "@/components/common/Tabs";
import { Button } from "@/components/common/Button";
import { EmptyState, PageLoading } from "@/components/common/States";
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
  const [adding, setAdding] = useState(false);
  const [pickJob, setPickJob] = useState("");

  const list = useMemo(() => Object.values(applications).sort((a, b) => (b.appliedAt ?? b.createdAt).localeCompare(a.appliedAt ?? a.createdAt)), [applications]);
  const byGroup = (a: Application) => APPLICATION_STATUS_META[a.status].group;
  const counts = { all: list.length, in_progress: list.filter((a) => byGroup(a) === "in_progress").length, submitted: list.filter((a) => byGroup(a) === "submitted").length, interview: list.filter((a) => byGroup(a) === "interview").length, outcome: list.filter((a) => byGroup(a) === "outcome").length };
  const visible = tab === "all" ? list : list.filter((a) => byGroup(a) === tab);
  const candidates = Object.keys(saved).filter((id) => jobs[id] && !list.some((a) => a.jobId === id));

  return (
    <div>
      <PageHeader
        title="Applications"
        description="Track every application from discovery to outcome. Wonder keeps the timeline; you make the calls."
        actions={
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>
            Add
          </Button>
        }
      />
      <Tabs value={tab} onChange={setTab} label="Application status" items={TABS.map((t) => ({ ...t, count: counts[t.value] }))} className="mb-5" />
      {visible.length === 0 ? (
        <EmptyState title={tab === "all" ? "No applications yet" : `Nothing ${TABS.find((t) => t.value === tab)?.label.toLowerCase()}`} body="Save a job and prepare an application, or let a Wonder run prepare materials for your strongest matches." action={{ label: "Find jobs", href: "/app/jobs" }} />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((a) => (
            <li key={a.id}>
              <ApplicationCard application={a} job={jobs[a.jobId]} />
            </li>
          ))}
        </ul>
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
          <Field label="Saved job" htmlFor="pick-job">
            <Select id="pick-job" value={pickJob} onChange={(e) => setPickJob(e.target.value)}>
              <option value="">Choose a job…</option>
              {candidates.map((id) => (
                <option key={id} value={id}>
                  {jobs[id].title} — {jobs[id].company}
                </option>
              ))}
            </Select>
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
