"use client";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { cleanApplication, type ApplicationField } from "@/domain/org/careers";
import { Button } from "@/components/common/Button";
import { Input, Textarea } from "@/components/common/Input";
import { cn } from "@/lib/cn";

/** The consent line on WonderJobs' own careers form; the period comes from the site and is left out when it has none. */
export function consentText(retentionMonths: number | null): string {
  const base = "I agree that WonderJobs stores my application to consider me for this and similar roles";
  return retentionMonths ? `${base}, and deletes it ${retentionMonths} month${retentionMonths === 1 ? "" : "s"} after its last update.` : `${base}.`;
}

type Values = { name: string; email: string; phone: string; location: string; linkedinUrl: string; resumeUrl: string; coverNote: string; consent: boolean; website: string };
const EMPTY: Values = { name: "", email: "", phone: "", location: "", linkedinUrl: "", resumeUrl: "", coverNote: "", consent: false, website: "" };

/**
 * The apply form on WonderJobs' own careers page. It is checked here for quick feedback, then sent to this app's
 * own route, which checks it again and forwards it to the careers API. "Sent" shows only after a 200.
 */
export function CareersApplyForm({ jobId, retentionMonths }: { jobId: string; retentionMonths: number | null }) {
  const [v, setV] = useState<Values>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ field?: ApplicationField; message: string } | null>(null);
  const [closed, setClosed] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (p: Partial<Values>) => {
    setV((x) => ({ ...x, ...p }));
    setProblem(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = cleanApplication(v);
    if ("problem" in check) {
      setProblem({ field: check.field, message: check.problem });
      document.getElementById(`ca-${check.field}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/careers/site/jobs/${encodeURIComponent(jobId)}/applications`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 200) return setSent(true);
      if (res.status === 404) return setClosed(true);
      // A 400 or 409 is WonderJobs' (or this app's) own message for people; anything else is a plain retry.
      setProblem({ message: (res.status === 400 || res.status === 409) && body.error ? body.error : "Your application couldn't be sent. Please try again in a few minutes." });
    } catch {
      setProblem({ message: "Your application couldn't be sent. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  if (sent)
    return (
      <p role="status" className="mt-4 flex gap-3 rounded-[12px] border border-success-600/30 bg-success-100/40 p-4 text-[14px] text-ink">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-600" aria-hidden />
        <span>Application sent. Check your email for a confirmation and a link to follow it.</span>
      </p>
    );

  if (closed)
    return (
      <p role="status" className="mt-4 text-[14px] text-ink-2">
        This position is no longer open.{" "}
        <Link href="/careers" className="font-medium text-brand-600 hover:underline">
          See open positions
        </Link>
      </p>
    );

  const err = (f: ApplicationField) => (problem?.field === f ? problem.message : undefined);
  const field = (f: ApplicationField | "location" | "coverNote", label: string, input: React.ReactNode, o: { required?: boolean; hint?: string; wide?: boolean } = {}) => {
    const e = f === "location" || f === "coverNote" ? undefined : err(f);
    return (
      <div className={cn("flex flex-col gap-1.5", o.wide && "sm:col-span-2")}>
        <span className="inline-flex items-center">
          <label htmlFor={`ca-${f}`} className="text-[13px] font-medium text-ink-2">
            {label}
          </label>
          {o.required && (
            <span aria-hidden className="ml-0.5 text-[13px] font-medium text-danger-600">
              *
            </span>
          )}
        </span>
        {input}
        {e ? (
          <p id={`ca-${f}-error`} className="text-xs text-danger-600">
            {e}
          </p>
        ) : (
          o.hint && (
            <p id={`ca-${f}-hint`} className="text-xs text-ink-3">
              {o.hint}
            </p>
          )
        )}
      </div>
    );
  };
  const a11y = (f: ApplicationField | "location" | "coverNote", hint?: boolean) => {
    const e = f !== "location" && f !== "coverNote" && !!err(f);
    return { id: `ca-${f}`, "aria-invalid": e || undefined, "aria-describedby": e ? `ca-${f}-error` : hint ? `ca-${f}-hint` : undefined };
  };

  return (
    <form onSubmit={submit} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate aria-busy={busy}>
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" value={v.website} onChange={(e) => set({ website: e.target.value })} />
        </label>
      </div>
      {field("name", "Full name", <Input {...a11y("name")} value={v.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} autoComplete="name" required />, { required: true })}
      {field("email", "Email", <Input {...a11y("email")} type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} maxLength={200} autoComplete="email" required />, { required: true })}
      {field("phone", "Phone (optional)", <Input {...a11y("phone")} type="tel" value={v.phone} onChange={(e) => set({ phone: e.target.value })} maxLength={40} autoComplete="tel" />)}
      {field("location", "Location (optional)", <Input {...a11y("location")} value={v.location} onChange={(e) => set({ location: e.target.value })} maxLength={120} placeholder="City, country" />)}
      {field(
        "resumeUrl",
        "Résumé link",
        <Input {...a11y("resumeUrl", true)} type="url" inputMode="url" value={v.resumeUrl} onChange={(e) => set({ resumeUrl: e.target.value })} maxLength={500} placeholder="https://" required />,
        { required: true, wide: true, hint: "Google Drive, Dropbox, LinkedIn or your own site, open to anyone with the link." },
      )}
      {field("linkedinUrl", "LinkedIn or portfolio (optional)", <Input {...a11y("linkedinUrl")} type="url" inputMode="url" value={v.linkedinUrl} onChange={(e) => set({ linkedinUrl: e.target.value })} maxLength={500} placeholder="https://" />, { wide: true })}
      {field("coverNote", "Cover note (optional)", <Textarea {...a11y("coverNote")} rows={4} value={v.coverNote} onChange={(e) => set({ coverNote: e.target.value })} maxLength={4000} />, { wide: true })}
      <div className="sm:col-span-2">
        <label className="flex items-start gap-2 text-[13px] text-ink-2">
          <input
            id="ca-consent"
            type="checkbox"
            checked={v.consent}
            onChange={(e) => set({ consent: e.target.checked })}
            required
            aria-invalid={!!err("consent") || undefined}
            aria-describedby={err("consent") ? "ca-consent-error" : undefined}
            className="mt-1 size-4 accent-brand-600"
          />
          <span>{consentText(retentionMonths)}</span>
        </label>
        {err("consent") && (
          <p id="ca-consent-error" className="mt-1 text-xs text-danger-600">
            {err("consent")}
          </p>
        )}
      </div>
      {problem && !problem.field && (
        <p role="alert" className="text-[13px] text-danger-600 sm:col-span-2">
          {problem.message}
        </p>
      )}
      {problem?.field && (
        <p role="alert" className="sr-only">
          {problem.message}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" loading={busy}>
          {busy ? "Sending…" : "Send application"}
        </Button>
      </div>
    </form>
  );
}
