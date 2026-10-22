"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Loader2, RefreshCw } from "lucide-react";
import type { CanonicalJob } from "@/domain/jobs/types";
import { getTemplate, templateForResume } from "@/domain/resume/templates";
import { generateResume, renderSaved, type GeneratedResume, type GenerationStage } from "@/services/resume/generate";
import { downloadDocx } from "@/services/resume/download";
import { useCareerStore } from "@/store/career";
import { useAutomationStore } from "@/store/automation";
import { usePlan } from "@/lib/usePlan";
import { track } from "@/lib/analytics";
import { toast } from "@/components/feedback/Toast";
import { cn } from "@/lib/cn";

type Phase = { kind: "idle" } | { kind: "generating"; progress: number } | { kind: "ready"; resume: GeneratedResume } | { kind: "downloading"; resume: GeneratedResume } | { kind: "downloaded"; resume: GeneratedResume };

const STAGES_WITH_TARGET: GenerationStage[] = ["select", "tailor", "render", "paginate", "ats"];

/**
 * Generate Customized Resume on a job's page (owner, 2026-10-22): one button that becomes the whole flow —
 * Generating Custom Resume… (filling up as each step finishes) → Download custom resume → Downloading resume… →
 * Re-generate Resume. The résumé is the candidate's own Career Profile (filled from the résumé they uploaded),
 * ordered for this job, in the template they chose (the first one when they never chose; never asked here), as a
 * Word file built in this browser. Nothing calls a model; Automation → Draft a tailored résumé set to Off still wins.
 * A résumé already made for this job is offered for download straight away.
 */
export function CustomResumeButton({ job, primary = false }: { job: CanonicalJob; primary?: boolean }) {
  const dna = useCareerStore((s) => s.dna);
  const chosen = useCareerStore((s) => s.resumeTemplateId);
  const saveResume = useCareerStore((s) => s.saveResume);
  const policy = useAutomationStore((s) => s.policy);
  const { limits } = usePlan();
  const existing = useCareerStore((s) => s.savedResumes.find((r) => r.target?.jobId === job.id));
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const templateId = templateForResume(chosen, limits.resumeTemplates);

  const generate = async () => {
    if (policy.generate_resume === "off") {
      toast.info("Turned off in Automation", "Turn on Draft a tailored résumé in You → Automation to make one here.");
      return;
    }
    let done = 0;
    const started = Date.now();
    setPhase({ kind: "generating", progress: 0.06 });
    try {
      const result = await generateResume(dna, templateId, {
        target: {
          id: job.id,
          title: job.title,
          company: job.company,
          description: job.description,
          skills: job.skills,
        },
        onStage: () => {
          done++;
          setPhase({
            kind: "generating",
            progress: Math.min(0.95, done / STAGES_WITH_TARGET.length),
          });
        },
      });
      if (!result.report.ok) {
        const reason = result.report.issues.find((i) => i.level === "critical")?.message ?? "Your Career Profile needs a little more first.";
        setPhase({ kind: "idle" });
        toast.error("Couldn't make the résumé yet", reason);
        return;
      }
      saveResume({
        templateId: result.template.id,
        templateVersion: result.template.version,
        document: result.document,
        pageCount: result.layout.pages.length,
        target: { jobId: job.id, title: job.title, company: job.company },
      });
      track("custom_resume_generated", {
        jobId: job.id,
        template: result.template.id,
      });
      setPhase({ kind: "generating", progress: 1 });
      // The work takes moments; the fill still finishes where it can be seen (at least about a second in all).
      setTimeout(() => setPhase({ kind: "ready", resume: result }), Math.max(400, 1100 - (Date.now() - started)));
    } catch (e) {
      setPhase({ kind: "idle" });
      toast.error("Couldn't make the résumé", e instanceof Error ? e.message : "Try again in a moment.");
    }
  };

  const download = (resume: GeneratedResume) => {
    setPhase({ kind: "downloading", resume });
    try {
      downloadDocx(resume, existing?.name);
      track("custom_resume_downloaded", { jobId: job.id });
      // The file is built here and handed to the browser at once; the label stays a moment so the change is seen.
      setTimeout(() => setPhase({ kind: "downloaded", resume }), 1200);
    } catch (e) {
      setPhase({ kind: "ready", resume });
      toast.error("Couldn't download it", e instanceof Error ? e.message : "Try again.");
    }
  };

  // A résumé already made for this job: ready to download without making it again.
  const before = useMemo(() => (existing ? renderSaved(existing.document, existing.templateId) : null), [existing]);
  const fromBefore = phase.kind === "idle" ? before : null;

  const base = "relative inline-flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-[12px] px-4 text-sm font-medium wj-press transition-colors";
  const filled = "wj-gradient-bg text-white shadow-brand hover:brightness-105";
  const plain = primary ? filled : "border border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-2";

  if (phase.kind === "generating") {
    return (
      <div className="flex flex-col gap-1">
        <button type="button" disabled aria-busy className={cn(base, "border border-brand-300 bg-brand-50 text-ink")}>
          {/* The fill grows as each step finishes. */}
          <span aria-hidden className="absolute inset-y-0 left-0 bg-gradient-to-r from-brand-200 via-brand-300 to-brand-400 transition-[width] duration-700 ease-out" style={{ width: `${Math.round(phase.progress * 100)}%` }} />
          <span className="relative inline-flex items-center gap-2">
            <Loader2 className="size-4 wj-animate-spin" aria-hidden /> Generating Custom Resume…
          </span>
        </button>
        <span className="sr-only" role="status">
          {Math.round(phase.progress * 100)}% done
        </span>
      </div>
    );
  }
  if (phase.kind === "ready" || fromBefore) {
    const resume = phase.kind === "ready" ? phase.resume : fromBefore!;
    return (
      <button type="button" onClick={() => download(resume)} className={cn(base, filled)}>
        <Download className="size-4" aria-hidden /> Download custom resume
      </button>
    );
  }
  if (phase.kind === "downloading") {
    return (
      <button type="button" disabled aria-busy className={cn(base, filled, "opacity-90")}>
        <Loader2 className="size-4 wj-animate-spin" aria-hidden /> Downloading resume…
      </button>
    );
  }
  if (phase.kind === "downloaded") {
    return (
      <div className="flex flex-col gap-1">
        <button type="button" onClick={() => void generate()} className={cn(base, plain)}>
          <RefreshCw className="size-4" aria-hidden /> Re-generate Resume
        </button>
        <Link href="/app/resume-studio" className="text-center text-[12px] text-ink-3 hover:underline">
          In {getTemplate(phase.resume.template.id)?.name ?? "your"} template · saved in My resumes
        </Link>
      </div>
    );
  }
  return (
    <button type="button" onClick={() => void generate()} className={cn(base, plain)}>
      Generate Customized Resume
    </button>
  );
}
