"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Upload, Zap } from "lucide-react";
import type { CanonicalJob } from "@/domain/jobs/types";
import type { ScreeningQuestion } from "@/domain/org/screening";
import { planEasyApply, type EasyApplyPlan } from "@/domain/jobs/easyApply";
import { resolveCapability } from "@/domain/automation/policy";
import { templateForResume } from "@/domain/resume/templates";
import { useCareerStore } from "@/store/career";
import { useApplicationsStore } from "@/store/applications";
import { useResumeFilesStore } from "@/store/resumeFiles";
import { useAutomationStore } from "@/store/automation";
import { useAuthStore } from "@/store/auth";
import { usePlan } from "@/lib/usePlan";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { Field, Input, Select, Textarea } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";

type Form = { jobTitle: string; company: string; questions: ScreeningQuestion[]; applied: { id: string; status: string } | null };
type Sheet = { plan: EasyApplyPlan; form: Form };

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { status: res.status });
  return data;
}

/**
 * Easy Apply on a job a company posted on WonderJobs (owner, 2026-10-28): one press sends the application — the name,
 * contact details, skills and headline from the candidate's Career Profile, their résumé (one made for this job, else
 * their uploaded file, else one made from the Career Profile) and their saved answers to the job's screening
 * questions. When something the company needs is missing, only that is asked. Automation → "Send Easy Apply in one
 * tap" set to Ask me shows everything first; Off turns Easy Apply off (resolveCapability, fails closed to asking).
 * Withdraw stays possible from the confirmation while the company hasn't moved it on.
 */
export function EasyApply({ job }: { job: CanonicalJob }) {
  const mode = useAuthStore((s) => s.mode);
  const email = useAuthStore((s) => s.email);
  const app = useApplicationsStore((s) => Object.values(s.applications).find((a) => a.jobId === job.id));
  const policy = useAutomationStore((s) => s.policy);
  const level = useAutomationStore((s) => s.defaultLevel);
  const { limits } = usePlan();
  const decision = resolveCapability("easy_apply", policy, level);
  const applied = !!app && app.status !== "saved" && app.status !== "preparing" && app.status !== "withdrawn" && app.events.some((e) => e.type === "submitted");
  const [working, setWorking] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const listingIds = [job.id, ...job.duplicateOf];

  const markApplied = (applicationId?: string) => {
    const store = useApplicationsStore.getState();
    const a = app ?? store.create(job.id, "saved");
    store.setStatus(a.id, "submitted", { type: "submitted", title: "Submitted with WonderJobs Easy Apply", detail: `Sent to ${job.company} on WonderJobs${applicationId ? ` (${applicationId})` : ""}` });
    return a.id;
  };

  const withdraw = async (applicationId: string, localId: string) => {
    try {
      await post("/api/easy-apply/withdraw", { applicationId });
      useApplicationsStore.getState().setStatus(localId, "withdrawn", { type: "note", title: "Withdrawn", detail: `Withdrawn from ${job.company} on WonderJobs` });
      toast.info("Application withdrawn", `${job.company} sees it as withdrawn.`);
    } catch (e) {
      toast.error("Couldn't withdraw it", (e as Error).message);
    }
  };

  /** The résumé file to send: an uploaded one as it is; a saved or new one from the Career Profile, sent as Word (and kept in My Resume). */
  const resumeFileId = async (plan: EasyApplyPlan, chosenFileId: string | null): Promise<string> => {
    if (chosenFileId) return chosenFileId;
    const src = plan.resume;
    if (!src) throw new Error("Add a résumé first.");
    if (src.kind === "file") return src.fileId;
    const [{ generateResume, renderSaved }, { buildResumeDocx }, { resumeFilename }] = await Promise.all([import("@/services/resume/generate"), import("@/services/resume/docx"), import("@/services/resume/download")]);
    const career = useCareerStore.getState();
    let g;
    let ownName: string | undefined;
    if (src.kind === "saved") {
      const saved = career.savedResumes.find((r) => r.id === src.savedId);
      g = saved ? renderSaved(saved.document, saved.templateId) : null;
      ownName = saved?.name;
    } else {
      g = await generateResume(career.dna, templateForResume(career.resumeTemplateId, limits.resumeTemplates), { target: { id: job.id, title: job.title, company: job.company, description: job.description, skills: job.skills } });
      if (!g.report.ok) throw new Error(g.report.issues.find((i) => i.level === "critical")?.message ?? "Your Career Profile needs a little more for a résumé. Upload one instead.");
      career.saveResume({ templateId: g.template.id, templateVersion: g.template.version, document: g.document, pageCount: g.layout.pages.length, target: { jobId: job.id, title: job.title, company: job.company } });
    }
    if (!g) throw new Error("That résumé couldn't be opened. Choose another.");
    const file = new File([buildResumeDocx(g.document, g.template)], resumeFilename(g, "docx", ownName), { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    return (await useResumeFilesStore.getState().upload(file)).id;
  };

  const send = async (plan: EasyApplyPlan, answers: Record<string, string>, chosenFileId: string | null, note: string, form: Form) => {
    const fileId = await resumeFileId(plan, chosenFileId);
    try {
      const out = await post<{ id: string }>("/api/easy-apply", { listingIds, ...plan.details, phone: plan.details.phone || undefined, location: plan.details.location || undefined, linkedinUrl: plan.details.linkedinUrl || undefined, coverNote: note || undefined, resumeFileId: fileId, consent: true, answers, profile: plan.profile });
      const localId = markApplied(out.id);
      // Answers typed here are kept for the next form (Career Profile → Application answers).
      const remember = useCareerStore.getState().rememberAnswer;
      for (const q of form.questions) {
        const a = answers[q.id];
        if (!a || plan.answers[q.id] === a || q.profileKey) continue;
        if (q.memoryKey) remember(q.memoryKey, a === "yes" ? "Yes" : a === "no" ? "No" : a);
        else remember("custom", a, q.prompt);
      }
      track("easy_apply_sent", { jobId: job.id, oneTap: !chosenFileId && decision === "run" });
      setSheet(null);
      toast.success(`Application sent to ${job.company}`, "Track it in Pipeline.", { label: "Withdraw", onClick: () => void withdraw(out.id, localId) });
    } catch (e) {
      if ((e as { status?: number }).status === 409) {
        markApplied();
        setSheet(null);
        toast.info("You've already applied", `${job.company} has your application.`);
        return;
      }
      throw e;
    }
  };

  const press = async () => {
    if (decision === "skip") return;
    setWorking(true);
    try {
      const form = await post<Form>("/api/easy-apply/form", { listingIds });
      if (form.applied && form.applied.status !== "withdrawn") {
        markApplied(form.applied.id);
        toast.info("You've already applied", `${form.company} has your application.`);
        return;
      }
      await useResumeFilesStore.getState().load(true);
      const career = useCareerStore.getState();
      const plan = planEasyApply({
        dna: career.dna,
        jobId: job.id,
        memory: career.answerMemory ?? [],
        files: useResumeFilesStore.getState().files,
        savedResumes: career.savedResumes,
        questions: form.questions,
        allowWorkAuthorization: resolveCapability("fill_work_authorization", policy, level) === "run",
      });
      if (decision === "run" && !plan.missing.length) await send(plan, plan.answers, null, "", form);
      else setSheet({ plan, form });
    } catch (e) {
      toast.error("Not sent", (e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  if (applied) {
    return (
      <p className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-success-100 text-[15px] font-medium text-success-600">
        <CheckCircle2 className="size-4" aria-hidden /> Applied with Easy Apply
      </p>
    );
  }
  if (mode !== "user") return <p className="text-[13px] text-ink-3">Sign in to apply with Easy Apply.</p>;
  return (
    <div>
      <Button size="lg" full onClick={press} disabled={working || decision === "skip"} icon={working ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Zap className="size-4" aria-hidden />}>
        {working ? "Sending…" : "Easy Apply"}
      </Button>
      <p className="mt-1.5 text-center text-[12px] text-ink-3">
        {decision === "skip" ? (
          <>
            Easy Apply is off in <Link href="/app/automation/settings" className="text-brand-600 hover:underline">Automation</Link>.
          </>
        ) : decision === "run" ? (
          `One tap sends your Career Profile, résumé and saved answers to ${job.company}.`
        ) : (
          `Shows what goes to ${job.company} before it's sent.`
        )}
      </p>
      {sheet && <EasyApplySheet sheet={sheet} email={email ?? ""} company={job.company} onClose={() => setSheet(null)} onSend={send} />}
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = { name: "Your name", resume: "A résumé" };

/** What's needed before sending (only what's missing, when that's all), and — folded — everything that goes. */
function EasyApplySheet({ sheet, email, company, onClose, onSend }: { sheet: Sheet; email: string; company: string; onClose: () => void; onSend: (plan: EasyApplyPlan, answers: Record<string, string>, fileId: string | null, note: string, form: Form) => Promise<void> }) {
  const { plan, form } = sheet;
  const files = useResumeFilesStore((s) => s.files);
  const upload = useResumeFilesStore((s) => s.upload);
  const [details, setDetails] = useState(plan.details);
  const [answers, setAnswers] = useState(plan.answers);
  const [fileId, setFileId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const missingQuestions = form.questions.filter((q) => plan.missing.includes(q.id));
  const askName = plan.missing.includes("name");
  const askResume = plan.missing.includes("resume") && !fileId;
  const still = [...(details.name.trim().length < 2 ? ["name"] : []), ...(plan.resume || fileId ? [] : ["resume"]), ...form.questions.filter((q) => q.required && !answers[q.id]?.trim()).map((q) => q.id)];

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSend({ ...plan, details }, Object.fromEntries(Object.entries(answers).filter(([, v]) => v.trim())), fileId, note.trim(), form);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const questionField = (q: ScreeningQuestion) => (
    <Field key={q.id} label={q.prompt} htmlFor={`ea-${q.id}`} required={q.required}>
      {q.kind === "yes_no" ? (
        <Select id={`ea-${q.id}`} value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}>
          <option value="">Choose</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </Select>
      ) : (
        <Input id={`ea-${q.id}`} value={answers[q.id] ?? ""} inputMode={q.kind === "number" ? "decimal" : undefined} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} maxLength={500} />
      )}
    </Field>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Apply to ${company}`}
      description={plan.missing.length ? `${company} needs ${plan.missing.length === 1 ? "one more thing" : `${plan.missing.length} more things`} before it's sent.` : "This is what's sent. Change anything, then send."}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {error && (
            <p role="alert" className="mr-auto basis-full text-[13px] text-danger-600 sm:basis-auto">
              {error}
            </p>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={go} loading={busy} disabled={still.length > 0}>
            Send application
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {askName && (
          <Field label={FIELD_LABEL.name} htmlFor="ea-name" required>
            <Input id="ea-name" value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} maxLength={120} autoComplete="name" />
          </Field>
        )}
        {(askResume || (plan.missing.includes("resume") && fileId)) && (
          <Field label={FIELD_LABEL.resume} htmlFor="ea-file" required hint="PDF or Word, up to 5 MB. It's kept in My Resume for next time.">
            {files.length ? (
              <Select id="ea-file" value={fileId ?? ""} onChange={(e) => setFileId(e.target.value || null)}>
                <option value="">Choose a résumé</option>
                {files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.filename}
                  </option>
                ))}
              </Select>
            ) : (
              <label className={cn("flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-dashed border-line px-4 text-[13.5px] font-medium text-brand-700 hover:border-brand-300", uploading && "opacity-60")}>
                {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
                {uploading ? "Uploading…" : "Upload your résumé"}
              <input
                id="ea-file"
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                disabled={uploading}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploading(true);
                  try {
                    setFileId((await upload(f)).id);
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setUploading(false);
                  }
                }}
                className="sr-only"
              />
              </label>
            )}

          </Field>
        )}
        {missingQuestions.map(questionField)}
        <details className="rounded-[12px] border border-line px-3" open={!plan.missing.length}>
          <summary className="min-h-11 cursor-pointer py-3 text-[13px] font-medium text-ink-2">What goes to {company}</summary>
          <div className="flex flex-col gap-3 pb-3">
            <p className="text-[12.5px] text-ink-3">
              {details.name || "Your name"} · {email}
              {plan.resume && !fileId ? ` · ${plan.resume.label}` : ""}
              {plan.profile.skills.length ? ` · ${plan.profile.skills.length} skills and your headline from your Career Profile` : ""}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Phone" htmlFor="ea-phone">
                <Input id="ea-phone" value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} maxLength={40} autoComplete="tel" inputMode="tel" />
              </Field>
              <Field label="Location" htmlFor="ea-loc">
                <Input id="ea-loc" value={details.location} onChange={(e) => setDetails({ ...details, location: e.target.value })} maxLength={120} />
              </Field>
            </div>
            <Field label="LinkedIn or portfolio" htmlFor="ea-li">
              <Input id="ea-li" value={details.linkedinUrl} onChange={(e) => setDetails({ ...details, linkedinUrl: e.target.value })} maxLength={500} placeholder="https://" inputMode="url" />
            </Field>
            {form.questions.filter((q) => !plan.missing.includes(q.id)).map(questionField)}
            {!askResume && files.length > 0 && (
              <Field label="Résumé" htmlFor="ea-file2">
                <Select id="ea-file2" value={fileId ?? ""} onChange={(e) => setFileId(e.target.value || null)}>
                  <option value="">{plan.resume?.label ?? "Choose a résumé"}</option>
                  {files.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.filename}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Note to the company (optional)" htmlFor="ea-note">
              <Textarea id="ea-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={4000} />
            </Field>
          </div>
        </details>
        <p className={cn("text-[12px] text-ink-3")}>Sending shares these details and a copy of your résumé with {company}. You can withdraw it until they move it on.</p>
      </div>
    </Modal>
  );
}
