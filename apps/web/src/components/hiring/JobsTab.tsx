"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { EmployerJob } from "@/domain/org/types";
import { hiringApi, type JobInput } from "@/services/hiring/client";
import { formatSalaryRange, relativeTime } from "@/lib/format";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { Field, Input, Select, Textarea } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";
import { jobProblem, MIN_DESCRIPTION } from "@/domain/org/jobs";

const STATUS_TONE = { draft: "neutral", open: "success", closed: "warning" } as const;
const STATUS_LABEL = { draft: "Draft", open: "Open", closed: "Closed" } as const;
const EMPTY: JobInput = { title: "", location: "", workMode: "hybrid", jobType: "full_time", currency: "INR", description: "", skills: [], applyUrl: "" };

/** The workspace's job listings: post one, edit it, open it to job seekers or close it. */
export function JobsTab({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const [jobs, setJobs] = useState<EmployerJob[] | null>(null);
  const [editing, setEditing] = useState<{ id?: string; job: JobInput } | null>(null);
  const load = useCallback(() => {
    hiringApi
      .jobs(orgId)
      .then((d) => setJobs(d.jobs))
      .catch((e: Error) => toast.error("Couldn't load jobs", e.message));
  }, [orgId]);
  useEffect(load, [load]);

  const status = async (j: EmployerJob, s: EmployerJob["status"]) => {
    try {
      await hiringApi.setJobStatus(orgId, j.id, s);
      toast.success(s === "open" ? `${j.title} is open` : s === "closed" ? `${j.title} is closed` : "Back to draft", s === "open" ? "Job seekers on WonderJobs can now find it in their searches." : undefined);
      load();
    } catch (e) {
      toast.error("Couldn't change it", (e as Error).message);
    }
  };

  return (
    <div>
      {canEdit && (
        <Button className="mb-4" icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing({ job: EMPTY })}>
          Post a job
        </Button>
      )}
      <p className="mb-3 text-[12px] text-ink-3">Open jobs show up in job seekers&apos; searches on WonderJobs, with your company&apos;s name.</p>
      {jobs === null ? (
        <p className="text-[13px] text-ink-3">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="rounded-[16px] border border-line bg-surface p-4 text-[14px] text-ink-3">No jobs yet.{canEdit ? " Post one: it starts as a draft, and job seekers see it once you open it." : ""}</p>
      ) : (
        <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
          {jobs.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 last:border-b-0">
              <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                <p className="truncate text-[15px] font-semibold text-ink">{j.title}</p>
                <p className="truncate text-[12px] text-ink-3">{[j.location, j.workMode, formatSalaryRange(j.salaryMin, j.salaryMax, j.currency), `updated ${relativeTime(j.updatedAt)}`].filter(Boolean).join(" · ")}</p>
              </div>
              <Badge tone={STATUS_TONE[j.status]}>{STATUS_LABEL[j.status]}</Badge>
              {canEdit && (
                <div className="flex gap-3 text-[13px] font-medium">
                  <button type="button" className="min-h-10 text-brand-600 hover:underline" onClick={() => setEditing({ id: j.id, job: { title: j.title, location: j.location, workMode: j.workMode, jobType: j.jobType, salaryMin: j.salaryMin, salaryMax: j.salaryMax, currency: j.currency, description: j.description, skills: j.skills, applyUrl: j.applyUrl } })}>
                    Edit
                  </button>
                  {j.status !== "open" ? (
                    <button type="button" className="min-h-10 text-success-600 hover:underline" onClick={() => status(j, "open")}>
                      Open
                    </button>
                  ) : (
                    <button type="button" className="min-h-10 text-ink-3 hover:text-ink" onClick={() => status(j, "closed")}>
                      Close
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <JobForm orgId={orgId} id={editing.id} initial={editing.job} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

function JobForm({ orgId, id, initial, onClose, onSaved }: { orgId: string; id?: string; initial: JobInput; onClose: () => void; onSaved: () => void }) {
  const [j, setJ] = useState<JobInput>(initial);
  const [skills, setSkills] = useState((initial.skills ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  // Shown in the form itself: a toast would sit behind the dialog, where no one sees it.
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<JobInput>) => {
    setJ((x) => ({ ...x, ...p }));
    setError(null);
  };
  const num = (v: string) => (v.trim() ? Math.max(0, Math.round(Number(v.replace(/[^0-9.]/g, "")))) : undefined);
  const save = async () => {
    const problem = jobProblem(j);
    if (problem) return setError(problem);
    setBusy(true);
    const job = { ...j, skills: skills.split(",").map((s) => s.trim()).filter(Boolean) };
    try {
      if (id) await hiringApi.editJob(orgId, id, job);
      else await hiringApi.createJob(orgId, job);
      toast.success(id ? "Job updated" : "Job saved as a draft", id ? undefined : "Open it when you want job seekers to find it.");
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message || "Couldn't save the job. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={id ? "Edit job" : "Post a job"}
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {error && (
            <p role="alert" className="mr-auto basis-full text-[13px] text-danger-600 sm:basis-auto">
              {error}
            </p>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            {id ? "Save" : "Save draft"}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Job title" htmlFor="jt" required className="sm:col-span-2">
          <Input id="jt" value={j.title} onChange={(e) => set({ title: e.target.value })} maxLength={140} placeholder="Senior Platform Engineer" />
        </Field>
        <Field label="Location" htmlFor="jl" required>
          <Input id="jl" value={j.location} onChange={(e) => set({ location: e.target.value })} maxLength={120} placeholder="Bengaluru, or Remote" />
        </Field>
        <Field label="Work mode" htmlFor="jw">
          <Select id="jw" value={j.workMode} onChange={(e) => set({ workMode: e.target.value as JobInput["workMode"] })}>
            <option value="onsite">On-site</option>
            <option value="hybrid">Hybrid</option>
            <option value="remote">Remote</option>
          </Select>
        </Field>
        <Field label="Job type" htmlFor="jty">
          <Select id="jty" value={j.jobType ?? ""} onChange={(e) => set({ jobType: (e.target.value || undefined) as JobInput["jobType"] })}>
            <option value="full_time">Full-time</option>
            <option value="part_time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="internship">Internship</option>
            <option value="temporary">Short-term</option>
            <option value="gig">Gig</option>
          </Select>
        </Field>
        <Field label="Salary per year (optional)" htmlFor="js" hint={j.currency}>
          <div className="flex gap-2">
            <Input id="js" inputMode="numeric" value={j.salaryMin ?? ""} onChange={(e) => set({ salaryMin: num(e.target.value) })} placeholder="From" aria-label="Salary from" />
            <Input inputMode="numeric" value={j.salaryMax ?? ""} onChange={(e) => set({ salaryMax: num(e.target.value) })} placeholder="To" aria-label="Salary to" />
          </div>
        </Field>
        <Field label="Description" htmlFor="jd" required className="sm:col-span-2" hint={j.description.trim().length < MIN_DESCRIPTION ? `What the role is, the team, and who you're looking for (at least ${MIN_DESCRIPTION} characters).` : "What the role is, the team, and who you're looking for."}>
          <Textarea id="jd" rows={6} value={j.description} onChange={(e) => set({ description: e.target.value })} maxLength={8000} />
        </Field>
        <Field label="Skills" htmlFor="jsk" className="sm:col-span-2" hint="Separate with commas — candidates are matched on these.">
          <Input id="jsk" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Kubernetes, Go, Terraform" />
        </Field>
        <Field label="Where to apply" htmlFor="ja" required className="sm:col-span-2" hint="Your careers page or an email address, e.g. jobs@company.com">
          <Input id="ja" value={j.applyUrl} onChange={(e) => set({ applyUrl: e.target.value })} maxLength={500} placeholder="https://company.com/careers/platform-engineer" />
        </Field>
      </div>
    </Modal>
  );
}
