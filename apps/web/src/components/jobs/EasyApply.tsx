"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import type { CanonicalJob } from "@/domain/jobs/types";
import { historyOf } from "@/domain/career/history";
import { useCareerStore } from "@/store/career";
import { useApplicationsStore } from "@/store/applications";
import { useResumeFilesStore } from "@/store/resumeFiles";
import { useAuthStore } from "@/store/auth";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { Field, Input, Select, Textarea } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { track } from "@/lib/analytics";

/**
 * Easy Apply on a job posted on WonderJobs (owner, 2026-10-23): the application goes straight to the company's
 * WonderJobs workspace — the candidate's account email, the details below and a copy of the résumé they pick —
 * only when they press Send. Every other job is applied to on the employer's own page.
 */
export function EasyApply({ job }: { job: CanonicalJob }) {
  const mode = useAuthStore((s) => s.mode);
  const email = useAuthStore((s) => s.email);
  const dna = useCareerStore((s) => s.dna);
  const files = useResumeFilesStore((s) => s.files);
  const app = useApplicationsStore((s) => Object.values(s.applications).find((a) => a.jobId === job.id));
  const applied = !!app && app.status !== "saved" && app.status !== "preparing" && app.events.some((e) => e.type === "submitted");
  const contact = historyOf(dna).contact;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(dna.name);
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [location, setLocation] = useState(contact.location ?? "");
  const [linkedin, setLinkedin] = useState(contact.linkedinUrl ?? "");
  const [note, setNote] = useState("");
  const [fileId, setFileId] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const resumeId = files.some((f) => f.id === fileId) ? fileId : (files[0]?.id ?? "");

  const markApplied = () => {
    const store = useApplicationsStore.getState();
    const a = app ?? store.create(job.id, "saved");
    store.setStatus(a.id, "submitted", { type: "submitted", title: "Submitted with WonderJobs Easy Apply", detail: `Sent to ${job.company} on WonderJobs` });
  };

  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/easy-apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingIds: [job.id, ...job.duplicateOf], name, phone: phone || undefined, location: location || undefined, linkedinUrl: linkedin || undefined, coverNote: note || undefined, resumeFileId: resumeId, consent: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 409) {
        markApplied();
        setOpen(false);
        toast.info("You've already applied", `${job.company} has your application.`);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Your application couldn't be sent. Try again.");
      markApplied();
      track("easy_apply_sent", { jobId: job.id });
      setOpen(false);
      toast.success("Application sent", `${job.company} has it. Track it in Pipeline.`);
    } catch (e) {
      toast.error("Not sent", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  if (applied) {
    return (
      <p className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-success-100 text-[15px] font-medium text-success-600">
        <CheckCircle2 className="size-4" aria-hidden /> Applied with Easy Apply
      </p>
    );
  }
  return (
    <>
      <Button size="lg" full onClick={() => setOpen(true)}>
        Easy Apply
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Apply to ${job.company}`}
        description="Sent straight to the company on WonderJobs."
        footer={
          mode === "user" && files.length ? (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={send} loading={busy} disabled={!consent || name.trim().length < 2 || !resumeId}>
                Send application
              </Button>
            </>
          ) : undefined
        }
      >
        {mode !== "user" ? (
          <p className="text-[14px] text-ink-2">Sign in to apply with Easy Apply.</p>
        ) : !files.length ? (
          <p className="text-[14px] text-ink-2">
            Easy Apply sends your résumé file.{" "}
            <Link href="/app/resume-studio" className="font-medium text-brand-600 hover:underline">
              Upload your résumé
            </Link>{" "}
            first.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label="Name" htmlFor="ea-name" required>
              <Input id="ea-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
            </Field>
            <p className="-mt-1 text-[12.5px] text-ink-3">Email: {email}</p>
            <Field label="Résumé" htmlFor="ea-resume" required>
              <Select id="ea-resume" value={resumeId} onChange={(e) => setFileId(e.target.value)}>
                {files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.filename}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Phone" htmlFor="ea-phone">
                <Input id="ea-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} autoComplete="tel" inputMode="tel" />
              </Field>
              <Field label="Location" htmlFor="ea-loc">
                <Input id="ea-loc" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} />
              </Field>
            </div>
            <Field label="LinkedIn or portfolio" htmlFor="ea-li">
              <Input id="ea-li" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} maxLength={500} placeholder="https://" inputMode="url" />
            </Field>
            <Field label="Note to the company (optional)" htmlFor="ea-note">
              <Textarea id="ea-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={4000} />
            </Field>
            <label className="flex items-start gap-2 text-[13px] text-ink-2">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
              Send these details and a copy of my résumé to {job.company}.
            </label>
          </div>
        )}
      </Modal>
    </>
  );
}
