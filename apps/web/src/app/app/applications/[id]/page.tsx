"use client";
import { use, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, ExternalLink, FileText, Puzzle, Trash2 } from "lucide-react";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { APPLICATION_STATUSES, APPLICATION_STATUS_META, type ApplicationStatus, type ArtifactType } from "@/domain/applications/types";
import { WORK_MODE_LABEL } from "@/domain/jobs/types";
import { formatDate, formatSalaryRange } from "@/lib/format";
import { buildDocxBytes, DOCX_MIME } from "@/lib/docx";
import { downloadBytes } from "@/lib/download";
import { track } from "@/lib/analytics";
import { useExtensionInstalled } from "@/lib/useExtensionInstalled";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { EmptyState } from "@/components/common/States";
import { Field, Input, Select, Textarea } from "@/components/common/Input";
import { CompanyLogo } from "@/components/common/Avatar";
import { companyColor } from "@/components/jobs/JobCard";
import { ApplicationTimeline } from "@/components/applications/ApplicationTimeline";
import { FollowUpAction } from "@/components/applications/FollowUpAction";
import { toast } from "@/components/feedback/Toast";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/common/Modal";

const DOWNLOAD_LABEL: Record<"resume" | "cover_letter", string> = { resume: "Resume", cover_letter: "Cover letter" };

/** Offers the extension where it's actually useful: right where the candidate is about to go and retype all of this into the employer's form. */
function ExtensionHint({ hasMaterials }: { hasMaterials: boolean }) {
  const installed = useExtensionInstalled();
  if (installed === null) return null;
  return (
    <p className="mt-3 flex items-start gap-1.5 border-t border-brand-200/70 pt-2.5 text-[12px] text-ink-3">
      <Puzzle className="mt-0.5 size-3.5 shrink-0 text-brand-600" aria-hidden />
      {installed ? (
        <span>
          Your browser extension will fill that form{hasMaterials ? " with these materials" : ""} — look for the WonderJobs button on the page.
        </span>
      ) : (
        <span>
          Don&apos;t retype it all:{" "}
          <Link href="/extension" className="font-semibold text-brand-600 hover:underline">
            get the browser extension
          </Link>{" "}
          and it fills the employer&apos;s form{hasMaterials ? ", resume attached" : ""}.
        </span>
      )}
    </p>
  );
}

function docxFilename(company: string | undefined, label: string): string {
  const base = [company, label].filter(Boolean).join(" ").replace(/[^\w -]+/g, "").trim().replace(/\s+/g, "-");
  return `${base || label}.docx`;
}

const EVENT_FOR_STATUS: Partial<Record<ApplicationStatus, { type: "submitted" | "recruiter_response" | "interview" | "outcome"; title: string }>> = {
  submitted: { type: "submitted", title: "Submitted" },
  under_review: { type: "recruiter_response", title: "Under review" },
  interview: { type: "interview", title: "Interview" },
  rejected: { type: "outcome", title: "Rejected" },
  withdrawn: { type: "outcome", title: "Withdrawn" },
  offer: { type: "outcome", title: "Offer received" },
};

export default function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const app = useApplicationsStore((s) => s.applications[id]);
  const setStatus = useApplicationsStore((s) => s.setStatus);
  const addEvent = useApplicationsStore((s) => s.addEvent);
  const addFollowUp = useApplicationsStore((s) => s.addFollowUp);
  const completeFollowUp = useApplicationsStore((s) => s.completeFollowUp);
  const remove = useApplicationsStore((s) => s.remove);
  const job = useJobsStore((s) => (app ? s.jobs[app.jobId] : undefined));
  const [note, setNote] = useState("");
  const [fuDate, setFuDate] = useState("");
  const [fuKind, setFuKind] = useState<"follow_up" | "interview" | "thank_you">("follow_up");
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!app) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={{ href: "/app/applications", label: "Applications" }} title="Application not found" />
        <EmptyState title="This application isn't available" action={{ label: "Back to applications", href: "/app/applications" }} />
      </div>
    );
  }
  const meta = APPLICATION_STATUS_META[app.status];
  const salary = job ? formatSalaryRange(job.salaryMin, job.salaryMax, job.currency) : null;
  const downloadableArtifacts = (["resume", "cover_letter"] as ArtifactType[])
    .map((type) => {
      const artifact = app.artifacts.find((a) => a.type === type);
      const current = artifact?.versions.find((v) => v.id === artifact.currentVersionId);
      return current ? { type: type as "resume" | "cover_letter", content: current.content } : null;
    })
    .filter((a): a is { type: "resume" | "cover_letter"; content: string } => a != null);

  const downloadArtifact = (type: "resume" | "cover_letter", content: string) => {
    downloadBytes(buildDocxBytes(content), docxFilename(job?.company, DOWNLOAD_LABEL[type]), DOCX_MIME);
    track("artifact_downloaded", { applicationId: app.id, artifact: type });
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader back={{ href: "/app/applications", label: "Applications" }} title={job ? `${job.title} · ${job.company}` : "Application"} actions={<Badge tone={meta.tone}>{meta.label}</Badge>} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <div className="flex items-start gap-4">
              <CompanyLogo name={job?.company ?? "?"} color={job ? companyColor(job.company) : undefined} size={52} />
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-semibold text-ink">{job?.company}</p>
                <p className="text-[13px] text-ink-3">
                  {job?.location} · {job ? WORK_MODE_LABEL[job.workMode] : ""}
                  {salary ? ` · ${salary}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-[13px]">
                  {job && (
                    <Link href={`/app/jobs/${job.id}`} className="font-medium text-brand-600 hover:underline">
                      View job
                    </Link>
                  )}
                  <Link href={`/app/applications/${app.id}/prepare`} className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
                    <FileText className="size-3.5" aria-hidden /> Materials ({app.artifacts.length})
                  </Link>
                  {job && (
                    <a href={job.applyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
                      Original posting <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  )}
                </div>
              </div>
            </div>
            {downloadableArtifacts.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {downloadableArtifacts.map((a) => (
                  <Button key={a.type} size="sm" variant="outline" icon={<Download className="size-3.5" aria-hidden />} onClick={() => downloadArtifact(a.type, a.content)}>
                    Download {DOWNLOAD_LABEL[a.type].toLowerCase()} (.docx)
                  </Button>
                ))}
              </div>
            )}
            {job && (app.status === "ready_for_review" || app.status === "saved" || app.status === "preparing") && (
              <div className="mt-4 rounded-[14px] border border-brand-200 bg-brand-50/60 p-3">
                <div className="flex flex-wrap gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-ink">Submit on {job.company}&apos;s site</p>
                    <p className="text-[12px] text-ink-3">Wonder prepares everything but never submits for you: employers&apos; forms need your own identity and consent. Apply there, then mark it submitted so Wonder tracks it.</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" href={job.applyUrl} iconRight={<ExternalLink className="size-3.5" aria-hidden />}>
                      Open application page
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setStatus(app.id, "submitted", { type: "submitted", title: "Submitted", detail: "Marked as submitted by you" })}>
                      Mark as submitted
                    </Button>
                  </div>
                </div>
                <ExtensionHint hasMaterials={downloadableArtifacts.length > 0} />
              </div>
            )}
            <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
              <div className="rounded-[12px] bg-surface-2 p-3">
                <dt className="text-ink-3">Date applied</dt>
                <dd className="font-medium text-ink">{app.appliedAt ? formatDate(app.appliedAt) : "Not yet"}</dd>
              </div>
              <div className="rounded-[12px] bg-surface-2 p-3">
                <dt className="text-ink-3">Status</dt>
                <dd className="font-medium text-ink">{meta.label}</dd>
              </div>
              <div className="rounded-[12px] bg-surface-2 p-3">
                <dt className="text-ink-3">Next action</dt>
                <dd className="truncate font-medium text-ink">{app.nextAction ?? "—"}</dd>
              </div>
              <div className="rounded-[12px] bg-surface-2 p-3">
                <dt className="text-ink-3">Follow-up</dt>
                <dd className="font-medium text-ink">{app.followUpAt ? formatDate(app.followUpAt) : "—"}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 text-[15px] font-semibold text-ink">Timeline</h2>
            <ApplicationTimeline events={app.events} />
            <div className="mt-5 border-t border-line pt-4">
              <Field label="Add a note" htmlFor="note">
                <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20" placeholder="Recruiter call went well; they asked about…" />
              </Field>
              <Button
                size="sm"
                className="mt-2"
                disabled={!note.trim()}
                onClick={() => {
                  addEvent(app.id, { type: "note", title: "Note", detail: note.trim() });
                  setNote("");
                }}
              >
                Add note
              </Button>
            </div>
          </Card>
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-3 text-[15px] font-semibold text-ink">Update status</h2>
            <Field label="Status" htmlFor="status">
              <Select
                id="status"
                value={app.status}
                onChange={(e) => {
                  const next = e.target.value as ApplicationStatus;
                  const prev = app.status;
                  const ev = EVENT_FOR_STATUS[next];
                  setStatus(app.id, next, ev ? { ...ev, detail: "Updated by you" } : undefined);
                  // Rejected/Withdrawn read as final, unlike the other transitions here — an Undo action
                  // (rather than a confirm-before dialog) keeps the one-click flow but makes the finality
                  // reversible, consistent with how Remove application already asks first.
                  const isFinal = next === "rejected" || next === "withdrawn";
                  toast.success(`Marked ${APPLICATION_STATUS_META[next].label}`, undefined, isFinal ? { label: "Undo", onClick: () => setStatus(app.id, prev) } : undefined);
                }}
              >
                {APPLICATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {APPLICATION_STATUS_META[s].label}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="mt-2 text-[12px] text-ink-4">Changing status here never contacts the employer.</p>
          </Card>
          <Card>
            <h2 className="mb-3 text-[15px] font-semibold text-ink">Follow-ups</h2>
            {app.followUps.length ? (
              <ul className="mb-3 flex flex-col gap-2">
                {app.followUps.map((f) => (
                  <li key={f.id} className="flex items-start gap-2 text-[13px]">
                    <button type="button" aria-label={f.done ? "Completed" : "Mark done"} disabled={f.done} onClick={() => completeFollowUp(app.id, f.id)} className={`mt-0.5 ${f.done ? "text-success-600" : "text-ink-4 hover:text-brand-600"}`}>
                      <CheckCircle2 className="size-4" aria-hidden />
                    </button>
                    <span className={f.done ? "text-ink-4 line-through" : "text-ink-2"}>
                      <span className="font-medium">{formatDate(f.dueAt)}</span> · {f.note}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-[13px] text-ink-3">No follow-ups scheduled.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={fuDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setFuDate(e.target.value)} aria-label="Follow-up date" />
              <Select value={fuKind} onChange={(e) => setFuKind(e.target.value as typeof fuKind)} aria-label="Follow-up type">
                <option value="follow_up">Follow up</option>
                <option value="interview">Interview</option>
                <option value="thank_you">Thank-you</option>
              </Select>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              full
              disabled={!fuDate}
              onClick={() => {
                addFollowUp(app.id, { dueAt: new Date(fuDate + "T10:00:00").toISOString(), kind: fuKind, note: fuKind === "interview" ? "Interview" : fuKind === "thank_you" ? "Send thank-you note" : "Follow up with recruiter" });
                setFuDate("");
                toast.success("Follow-up scheduled");
              }}
            >
              Schedule
            </Button>
          </Card>
          <Card>
            <FollowUpAction application={app} job={job} />
          </Card>
          <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirmDelete(true)} className="text-danger-600">
            Remove application
          </Button>
        </aside>
      </div>
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Remove this application?"
        description="Its timeline and materials will be deleted. The job stays in your catalog."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                remove(app.id);
                router.push("/app/applications");
              }}
            >
              Remove
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">This can&apos;t be undone.</p>
      </Modal>
    </div>
  );
}
