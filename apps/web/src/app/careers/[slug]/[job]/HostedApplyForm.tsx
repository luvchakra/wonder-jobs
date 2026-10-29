"use client";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { cleanApplication } from "@/domain/org/careers";
import { Button } from "@/components/common/Button";
import { Field, Input, Textarea } from "@/components/common/Input";

/**
 * The standard application form on a hosted careers page. It is checked here for quick feedback and again on
 * the server; "submitted" shows only once WonderJobs has stored the application.
 */
export function HostedApplyForm({ slug, jobId, company, retentionMonths }: { slug: string; jobId: string; company: string; retentionMonths?: number }) {
  const [v, setV] = useState({ name: "", email: "", phone: "", location: "", resumeUrl: "", linkedinUrl: "", coverNote: "", consent: false, website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const set = (p: Partial<typeof v>) => {
    setV((x) => ({ ...x, ...p }));
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = cleanApplication(v);
    if ("problem" in check) return setError(check.problem);
    setBusy(true);
    try {
      const res = await fetch(`/api/careers/hosted/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(jobId)}/applications`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Your application couldn't be sent. Try again.");
      setDone(check.value.email);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <p role="status" className="mt-4 flex gap-3 rounded-[12px] border border-success-600/30 bg-success-100/40 p-4 text-[14px] text-ink">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-600" aria-hidden />
        <span>
          Thank you, your application is in. A confirmation is on its way to <b>{done}</b>, with a link to check its status. {company} will email you at every step.
        </span>
      </p>
    );

  return (
    <form onSubmit={submit} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website <input tabIndex={-1} autoComplete="off" value={v.website} onChange={(e) => set({ website: e.target.value })} />
        </label>
      </div>
      <Field label="Full name" htmlFor="ha-name" required>
        <Input id="ha-name" value={v.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} autoComplete="name" required />
      </Field>
      <Field label="Email" htmlFor="ha-email" required>
        <Input id="ha-email" type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} maxLength={200} autoComplete="email" required />
      </Field>
      <Field label="Phone" htmlFor="ha-phone">
        <Input id="ha-phone" type="tel" value={v.phone} onChange={(e) => set({ phone: e.target.value })} maxLength={40} autoComplete="tel" />
      </Field>
      <Field label="Location" htmlFor="ha-location">
        <Input id="ha-location" value={v.location} onChange={(e) => set({ location: e.target.value })} maxLength={120} placeholder="City, country" />
      </Field>
      <Field label="Résumé link" htmlFor="ha-resume" required className="sm:col-span-2" hint="A link to your résumé or CV (Google Drive, Dropbox, LinkedIn or your own site) that anyone with the link can open.">
        <Input id="ha-resume" type="url" value={v.resumeUrl} onChange={(e) => set({ resumeUrl: e.target.value })} maxLength={500} placeholder="https://" required />
      </Field>
      <Field label="LinkedIn or portfolio" htmlFor="ha-linkedin" className="sm:col-span-2">
        <Input id="ha-linkedin" type="url" value={v.linkedinUrl} onChange={(e) => set({ linkedinUrl: e.target.value })} maxLength={500} placeholder="https://" />
      </Field>
      <Field label="Why this role? (optional)" htmlFor="ha-note" className="sm:col-span-2">
        <Textarea id="ha-note" rows={4} value={v.coverNote} onChange={(e) => set({ coverNote: e.target.value })} maxLength={4000} />
      </Field>
      <label className="flex items-start gap-2 text-[13px] text-ink-2 sm:col-span-2">
        <input type="checkbox" checked={v.consent} onChange={(e) => set({ consent: e.target.checked })} className="mt-1 size-4 accent-brand-600" />
        <span>
          I agree that {company} and WonderWorks, which handles its applications, may store and use these details to consider me for this position and email me about it.
          {retentionMonths ? ` My application is deleted ${retentionMonths} months after its last update.` : ""}
        </span>
      </label>
      {error && (
        <p role="alert" className="text-[13px] text-danger-600 sm:col-span-2">
          {error}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" loading={busy}>
          Submit application
        </Button>
      </div>
    </form>
  );
}
