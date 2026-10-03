"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, FileUp, Loader2, Sparkles, Star, Upload, X } from "lucide-react";
import type { CareerDNA } from "@/domain/career/types";
import type { CareerHistory } from "@/domain/career/history";
import { AI_PROVIDERS } from "@/domain/ai/types";
import { aiHistoryReader, buildHistoryPatch, groundAIHistory, historyDraftSize, mergeHistoryDrafts, reviewHistoryImport, type HistoryDraft } from "@/domain/career/historyImport";
import { buildImportPatch, reviewResumeImport, type CurrentProfile, type ImportField, type ResumeImportDraft } from "@/domain/career/resumeImport";
import { useAIStore } from "@/store/ai";
import { useAutomationStore } from "@/store/automation";
import { useCareerStore } from "@/store/career";
import { useResumeFilesStore } from "@/store/resumeFiles";
import { useAIService } from "@/lib/useAIService";
import { HistoryImportReview } from "./HistoryImportReview";
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

/**
 * `history`: the Career Profile's current history. When given, work history, education, certifications,
 * contact and summary are proposed too and the patch carries the merged `history`; when not (onboarding),
 * only the profile fields above are offered, so nothing is shown that wouldn't be applied.
 * `fileId`: open straight away and read that stored résumé file (Resume Studio → "Fill Career Profile").
 */
export function ResumeImport({ current, history, onApply, tone = "light", label = "Import from resume", fileId, onFileHandled }: { current: CurrentProfile; history?: Partial<CareerHistory>; onApply: (patch: Partial<CareerDNA>) => void; tone?: "light" | "dark"; label?: string; fileId?: string; onFileHandled?: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ResumeImportDraft | null>(null);
  const [chosen, setChosen] = useState<Set<ImportField>>(new Set());
  const [historyDraft, setHistoryDraft] = useState<HistoryDraft | null>(null);
  const [rulesHistory, setRulesHistory] = useState<HistoryDraft | null>(null);
  const [chosenHistory, setChosenHistory] = useState<Set<string>>(new Set());
  const [resumeText, setResumeText] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [ai, setAi] = useState<{ state: "idle" | "running" } | { state: "done"; added: number; dropped: number; byModel: boolean } | { state: "error"; message: string }>({ state: "idle" });
  const [pasted, setPasted] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const files = useResumeFilesStore((s) => s.files);
  const filesStatus = useResumeFilesStore((s) => s.status);
  const loadFiles = useResumeFilesStore((s) => s.load);
  const base = useCareerStore((s) => s.baseResume);
  const policy = useAutomationStore((s) => s.policy);
  const level = useAutomationStore((s) => s.defaultLevel);
  const providerName = AI_PROVIDERS[useAIStore((s) => s.config.activeProvider)]?.name ?? "your AI provider";
  const aiService = useAIService();
  const withHistory = history !== undefined;
  const aiGate = aiHistoryReader(policy, level);

  const review = draft ? reviewResumeImport(draft, current) : [];
  const historyReview = withHistory && historyDraft ? reviewHistoryImport(historyDraft, history) : [];
  const actionable = review.filter((r) => r.status !== "same").length + historyReview.filter((r) => r.status !== "same").length;
  const chosenCount = chosen.size + (withHistory ? chosenHistory.size : 0);
  const hasDraft = !!draft;

  const reset = () => {
    setDraft(null);
    setHistoryDraft(null);
    setRulesHistory(null);
    setChosenHistory(new Set());
    setResumeText("");
    setSource(null);
    setAi({ state: "idle" });
    setError(null);
    setPasted("");
    setShowPaste(false);
    setChosen(new Set());
  };

  const receive = async (res: Response, from: string) => {
    const data = (await res.json().catch(() => null)) as { draft?: ResumeImportDraft; history?: HistoryDraft; text?: string; filename?: string; error?: string } | null;
    if (!res.ok || !data?.draft) {
      setError(data?.error ?? "That didn't work. Try a PDF or DOCX, or paste the text instead.");
      // A file we couldn't read is exactly when pasting helps, so open that straight away.
      setShowPaste(true);
      return;
    }
    setError(null);
    setDraft(data.draft);
    setSource(data.filename ?? from);
    const review = reviewResumeImport(data.draft, current);
    setChosen(new Set(review.filter((r) => r.defaultOn).map((r) => r.field)));
    if (withHistory && data.history) {
      setRulesHistory(data.history);
      setHistoryDraft(data.history);
      setChosenHistory(new Set(reviewHistoryImport(data.history, history).filter((r) => r.defaultOn).map((r) => r.key)));
    }
    setResumeText(data.text ?? "");
    track("resume_imported", { fields: Object.keys(data.draft.evidence).length, conflicts: review.filter((r) => r.status === "conflict").length, history: data.history ? historyDraftSize(data.history) : 0 });
  };

  const send = async (body: FormData | string, from: string, url = "/api/career/import-resume") => {
    setBusy(true);
    try {
      await receive(
        await fetch(url, {
          method: "POST",
          body,
          headers: typeof body === "string" ? { "content-type": "application/json" } : undefined,
        }),
        from,
      );
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const readStored = (id: string, name: string) => void send("", name, `/api/resume-files/${encodeURIComponent(id)}/read`);

  useEffect(() => {
    if (!open) return;
    void loadFiles();
  }, [open, loadFiles]);

  // Opened from Resume Studio for a specific stored file: read it once.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!fileId || handled.current === fileId) return;
    handled.current = fileId;
    setOpen(true);
    reset();
    void send("", "your stored résumé", `/api/resume-files/${encodeURIComponent(fileId)}/read`).then(() => onFileHandled?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per requested file
  }, [fileId]);

  /** The candidate's own AI model reads the same text; application code keeps only what the résumé itself says. */
  const readWithAI = async () => {
    if (!rulesHistory || !resumeText || aiGate === "off") return;
    setAi({ state: "running" });
    try {
      const { reply, byModel } = await aiService().readCareerHistory({ resumeText, rules: rulesHistory });
      if (!byModel) {
        setAi({ state: "done", added: 0, dropped: 0, byModel: false });
        return;
      }
      const grounded = groundAIHistory(reply, resumeText);
      if (!grounded.valid) {
        setAi({ state: "error", message: "The AI's reply wasn't in a form Wonder could check, so nothing from it is shown. You can try again." });
        return;
      }
      const merged = mergeHistoryDrafts(rulesHistory, grounded.draft);
      const added = historyDraftSize(merged) - historyDraftSize(rulesHistory);
      setHistoryDraft(merged);
      // New AI entries start unticked: the candidate opts in to each one.
      setAi({ state: "done", added, dropped: grounded.dropped, byModel: true });
      track("resume_import_ai", { added, dropped: grounded.dropped });
    } catch (e) {
      setAi({ state: "error", message: e instanceof Error ? e.message : "The AI request didn't work." });
    }
  };

  const apply = () => {
    if (!draft) return;
    const patch = buildImportPatch(draft, current, chosen);
    if (withHistory && historyDraft && chosenHistory.size) patch.history = buildHistoryPatch(historyDraft, history, chosenHistory);
    onApply(patch);
    track("resume_import_applied", { fields: chosen.size, history: withHistory ? chosenHistory.size : 0 });
    toast.success("Career Profile filled in", "Check it over and save when it looks right.");
    setOpen(false);
    reset();
  };

  const uploads = [...files].sort((a, b) => Number(base?.kind === "upload" && base.id === b.id) - Number(base?.kind === "upload" && base.id === a.id));

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
        title="Fill in from your résumé"
        description={withHistory ? "Wonder reads it and suggests profile details, work history, education and certifications, each with the words it came from. Nothing changes until you apply what you tick, and nothing you already have is overwritten unless you choose to." : "Wonder reads it, suggests what to fill in, and shows you where each value came from. Nothing is saved until you apply it."}
        size="lg"
        footer={
          hasDraft ? (
            <>
              <Button variant="ghost" onClick={reset}>
                Start over
              </Button>
              <Button onClick={apply} disabled={chosenCount === 0 || actionable === 0} icon={<Sparkles className="size-4" aria-hidden />}>
                Fill in {chosenCount} {chosenCount === 1 ? "item" : "items"}
              </Button>
            </>
          ) : undefined
        }
      >
        {!draft && busy && fileId && (
          <p className="flex items-center gap-2 text-[14px] text-ink-2" role="status">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> Reading your résumé…
          </p>
        )}
        {!draft && !(busy && fileId) && (
          <div className="flex flex-col gap-4">
            {filesStatus === "ready" && uploads.length > 0 && (
              <div>
                <p className="mb-2 text-[13px] font-medium text-ink-2">Your stored résumés</p>
                <ul className="flex flex-col gap-2">
                  {uploads.map((f) => {
                    const isBase = base?.kind === "upload" && base.id === f.id;
                    return (
                      <li key={f.id}>
                        <button type="button" disabled={busy} onClick={() => readStored(f.id, f.filename)} className="flex w-full items-center gap-3 rounded-[12px] border border-line p-3 text-left hover:border-brand-300 disabled:opacity-60">
                          <FileText className="size-4 shrink-0 text-brand-600" aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{f.filename}</span>
                          {isBase && (
                            <Badge tone="brand" icon={<Star className="size-3" aria-hidden />}>
                              Base
                            </Badge>
                          )}
                          <span className="text-[12px] font-semibold text-brand-600">Read this</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-[12px] text-ink-4">Or bring in a different file — it&apos;s read once and not kept.</p>
              </div>
            )}
            <div className="rounded-[16px] border border-dashed border-line-strong bg-bg-soft p-6 text-center">
              <Upload className="mx-auto size-6 text-ink-3" aria-hidden />
              <p className="mt-2 text-[14px] font-medium text-ink">Upload a PDF or Word file</p>
              <p className="mt-1 text-[12px] text-ink-2">Up to 5 MB. Read once and not kept — to keep a résumé for applying, upload it in Resume Studio. Scanned or image-only PDFs have no text to read — paste those instead.</p>
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
                  void send(form, file.name);
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
                <Button className="mt-2" loading={busy} disabled={pasted.trim().length < 80} onClick={() => void send(JSON.stringify({ text: pasted }), "pasted text")}>
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
            {source && <p className="text-[12px] text-ink-4">Read from {source}.</p>}
            {withHistory && review.length > 0 && <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">Profile</h3>}
            {review.length === 0 ? null : review.some((r) => r.status === "conflict") ? (
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
            {withHistory && historyReview.length > 0 && (
              <div className="mt-3">
                <HistoryImportReview
                  items={historyReview}
                  chosen={chosenHistory}
                  onToggle={(key) =>
                    setChosenHistory((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                />
              </div>
            )}
            {withHistory && rulesHistory && resumeText && (
              <div className="mt-3 rounded-[14px] border border-dashed border-line p-3" aria-live="polite">
                {aiGate === "off" ? (
                  <p className="text-[13px] text-ink-3">AI reading is off because &ldquo;Change Career Profile&rdquo; is set to Off in What Wonder can do. Wonder&apos;s own reading is shown above.</p>
                ) : ai.state === "done" ? (
                  <p className="text-[13px] text-ink-2">
                    {!ai.byModel
                      ? "No AI model is connected, so only Wonder's own reading is shown. Connect one in AI provider settings to have it read your résumé too."
                      : ai.added
                        ? `${providerName} found ${ai.added} more ${ai.added === 1 ? "entry" : "entries"}, marked "Found by AI" and unticked — tick the ones that are right.`
                        : `${providerName} didn't find anything Wonder's own reading missed.`}
                    {ai.byModel && ai.dropped > 0 && ` ${ai.dropped} ${ai.dropped === 1 ? "suggestion wasn't" : "suggestions weren't"} shown because ${ai.dropped === 1 ? "it isn't" : "they aren't"} written in your résumé.`}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 flex-1 text-[13px] text-ink-3">
                      {ai.state === "error" ? <span className="text-danger-600">{ai.message} </span> : null}
                      Missing a role or a qualification? {providerName} can read this résumé too. It only suggests: Wonder shows an entry only if it&apos;s written in your résumé, and you tick each one.
                    </p>
                    <Button size="sm" variant="outline" loading={ai.state === "running"} onClick={() => void readWithAI()} icon={<Sparkles className="size-3.5" aria-hidden />}>
                      Read with AI
                    </Button>
                  </div>
                )}
              </div>
            )}
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
