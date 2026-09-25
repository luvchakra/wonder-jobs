"use client";
import { useRef, useState } from "react";
import { FileUp, Sparkles, Upload, X } from "lucide-react";
import type { CareerDNA } from "@/domain/career/types";
import { buildImportPatch, reviewResumeImport, type CurrentProfile, type ImportField, type ResumeImportDraft } from "@/domain/career/resumeImport";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { Badge } from "@/components/common/Badge";
import { Textarea } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";

const LABELS: Record<ImportField, string> = {
  name: "Name",
  headline: "Headline",
  yearsExperience: "Years of experience",
  seniority: "Current level",
  skills: "Skills",
  industries: "Industries",
  preferredLocations: "Preferred locations",
};

/**
 * Import a resume to fill in Career DNA.
 *
 * The resume is read on the server and thrown away; what comes back is a suggestion, shown field by
 * field with the words it came from, and nothing is applied until the candidate says so. Anything they
 * untick keeps whatever they already had — importing is never allowed to quietly overwrite work.
 * `current` is what the profile says right now: a value that differs is shown side by side and
 * starts unticked, and list fields only ever add what's missing (`domain/career/resumeImport.ts`).
 */
const STATUS_LABEL = { new: "New", same: "Already in your profile", conflict: "Differs from your profile", adds: "Adds to your profile" } as const;

export function ResumeImport({ current, onApply, tone = "light", label = "Import from resume" }: { current: CurrentProfile; onApply: (patch: Partial<CareerDNA>) => void; tone?: "light" | "dark"; label?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ResumeImportDraft | null>(null);
  const [chosen, setChosen] = useState<Set<ImportField>>(new Set());
  const [pasted, setPasted] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const review = draft ? reviewResumeImport(draft, current) : [];
  const actionable = review.filter((r) => r.status !== "same").length;

  const reset = () => {
    setDraft(null);
    setError(null);
    setPasted("");
    setShowPaste(false);
    setChosen(new Set());
  };

  const receive = async (res: Response) => {
    const data = (await res.json().catch(() => null)) as { draft?: ResumeImportDraft; error?: string } | null;
    if (!res.ok || !data?.draft) {
      setError(data?.error ?? "That didn't work. Try a PDF or DOCX, or paste the text instead.");
      // A file we couldn't read is exactly when pasting helps, so open that straight away.
      setShowPaste(true);
      return;
    }
    setError(null);
    setDraft(data.draft);
    const review = reviewResumeImport(data.draft, current);
    setChosen(new Set(review.filter((r) => r.defaultOn).map((r) => r.field)));
    track("resume_imported", { fields: Object.keys(data.draft.evidence).length, conflicts: review.filter((r) => r.status === "conflict").length });
  };

  const send = async (body: FormData | string) => {
    setBusy(true);
    try {
      await receive(
        await fetch("/api/career/import-resume", {
          method: "POST",
          body,
          headers: typeof body === "string" ? { "content-type": "application/json" } : undefined,
        }),
      );
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!draft) return;
    onApply(buildImportPatch(draft, current, chosen));
    track("resume_import_applied", { fields: chosen.size });
    toast.success("Career Profile filled in", "Check it over and save when it looks right.");
    setOpen(false);
    reset();
  };

  return (
    <>
      <Button variant="outline" icon={<FileUp className="size-4" aria-hidden />} onClick={() => setOpen(true)} className={tone === "dark" ? "border-white/25 bg-white/10 text-white hover:border-white/40 hover:bg-white/20" : undefined}>
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title="Import from your resume"
        description="Wonder reads it, suggests what to fill in, and shows you where each value came from. Nothing is saved until you apply it, and the file itself is never stored."
        size="lg"
        footer={
          draft ? (
            <>
              <Button variant="ghost" onClick={reset}>
                Start over
              </Button>
              <Button onClick={apply} disabled={chosen.size === 0 || actionable === 0} icon={<Sparkles className="size-4" aria-hidden />}>
                Fill in {chosen.size} {chosen.size === 1 ? "field" : "fields"}
              </Button>
            </>
          ) : undefined
        }
      >
        {!draft && (
          <div className="flex flex-col gap-4">
            <div className="rounded-[16px] border border-dashed border-line-strong bg-bg-soft p-6 text-center">
              <Upload className="mx-auto size-6 text-ink-3" aria-hidden />
              <p className="mt-2 text-[14px] font-medium text-ink">Upload a PDF or Word file</p>
              <p className="mt-1 text-[12px] text-ink-2">Up to 5 MB. Scanned or image-only PDFs have no text to read — paste those instead.</p>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                aria-label="Resume file"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (file.size > 5 * 1024 * 1024) {
                    setError(`That file is ${(file.size / (1024 * 1024)).toFixed(1)} MB — the limit is 5 MB. Try a smaller file, or paste the text instead.`);
                    setShowPaste(true);
                    return;
                  }
                  const form = new FormData();
                  form.append("file", file);
                  void send(form);
                }}
              />
              <Button className="mt-3" variant="outline" loading={busy} onClick={() => fileRef.current?.click()}>
                Choose a file
              </Button>
            </div>

            {error && (
              <p role="alert" className="rounded-[12px] bg-danger-100/60 px-3 py-2 text-[13px] text-danger-600">
                {error}
              </p>
            )}

            {showPaste ? (
              <div>
                <label htmlFor="resume-text" className="text-[13px] font-medium text-ink-2">
                  Or paste your resume text
                </label>
                <Textarea id="resume-text" className="mt-1 min-h-40" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste everything — Wonder picks out what it needs." />
                <p className="mt-1 text-[12px] text-ink-3">{pasted.trim().length < 80 ? `At least 80 characters (${pasted.trim().length} so far).` : `${pasted.trim().length} characters.`}</p>
                <Button className="mt-2" loading={busy} disabled={pasted.trim().length < 80} onClick={() => void send(JSON.stringify({ text: pasted }))}>
                  Read this
                </Button>
              </div>
            ) : (
              <button type="button" className="self-start text-[13px] font-semibold text-brand-600 hover:underline" onClick={() => setShowPaste(true)}>
                Paste the text instead
              </button>
            )}
          </div>
        )}

        {draft && (
          <div className="flex flex-col gap-2">
            {review.some((r) => r.status === "conflict") ? (
              <p className="text-[13px] text-ink-2">
                Some of this differs from your Career Profile. Those fields are unticked, so what you already have stays unless you choose the resume&apos;s version.
              </p>
            ) : (
              <p className="text-[13px] text-ink-3">Untick anything you&apos;d rather keep as it is.</p>
            )}
            <ul className="flex flex-col gap-2">
              {review.map((r) => {
                const on = chosen.has(r.field);
                const same = r.status === "same";
                return (
                  <li key={r.field}>
                    <label className={cn("flex items-start gap-3 rounded-[14px] border bg-surface p-3", same ? "border-line opacity-75" : "cursor-pointer hover:border-line-strong", r.status === "conflict" ? "border-warning-600/40" : "border-line")}>
                      <input
                        type="checkbox"
                        className="mt-1 size-4 accent-[var(--color-brand-600)]"
                        checked={on}
                        disabled={same}
                        onChange={() =>
                          setChosen((prev) => {
                            const next = new Set(prev);
                            if (on) next.delete(r.field);
                            else next.add(r.field);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-semibold text-ink">{LABELS[r.field]}</span>
                          <Badge tone={r.status === "conflict" ? "warning" : r.status === "same" ? "neutral" : "info"}>{STATUS_LABEL[r.status]}</Badge>
                        </span>
                        {r.status === "conflict" ? (
                          <span className="mt-1 grid grid-cols-1 gap-0.5 text-[13px] sm:grid-cols-2">
                            <span className="text-ink-2">
                              <span className="text-ink-4">Your profile:</span> {r.current}
                            </span>
                            <span className="text-ink-2">
                              <span className="text-ink-4">Resume:</span> {r.incoming}
                            </span>
                          </span>
                        ) : r.status === "adds" ? (
                          <span className="mt-1 block text-[13px] text-ink-2">
                            Adds {r.incoming} <span className="text-ink-4">— keeps everything you already have</span>
                          </span>
                        ) : (
                          <span className="mt-1 block text-[13px] text-ink-2">{r.status === "same" ? r.current : r.incoming}</span>
                        )}
                        <span className="mt-1 block truncate text-[12px] text-ink-4">From your resume: {draft.evidence[r.field]}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 flex items-start gap-1.5 text-[12px] text-ink-4">
              <X className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Your career goal, salary and work modes are yours to write — Wonder won&apos;t guess at those.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
