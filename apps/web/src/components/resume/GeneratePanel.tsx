"use client";
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, Download, Loader2, XCircle } from "lucide-react";
import type { CareerDNA } from "@/domain/career/types";
import type { TargetJob } from "@/domain/resume/document";
import type { ResumeTemplate } from "@/domain/resume/templates";
import { generateResume, STAGE_LABEL, type GeneratedResume, type GenerationStage } from "@/services/resume/generate";
import { downloadDocx, downloadPdf } from "@/services/resume/download";
import { useCareerStore } from "@/store/career";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { toast } from "@/components/feedback/Toast";
import { ResumeViewer } from "./ResumeViewer";

type State = { kind: "idle" } | { kind: "running"; done: GenerationStage[]; current: GenerationStage } | { kind: "done"; result: GeneratedResume } | { kind: "error"; message: string };

/**
 * Generate → validate → preview → download (spec §32–34, §73–76). Downloads stay disabled until the
 * résumé passes every critical check; warnings are shown before "Download anyway". A résumé that
 * passes is saved to My resumes as a snapshot with its template version.
 */
export function GeneratePanel({ dna, template, target, applicationId, onChooseAnother }: { dna: CareerDNA; template: ResumeTemplate; target?: TargetJob; applicationId?: string; onChooseAnother: () => void }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [busy, setBusy] = useState<"pdf" | "docx" | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const saveResume = useCareerStore((s) => s.saveResume);
  const stages: GenerationStage[] = target ? ["select", "tailor", "render", "paginate", "ats"] : ["select", "render", "paginate", "ats"];

  const run = async () => {
    setAcknowledged(false);
    const done: GenerationStage[] = [];
    try {
      const result = await generateResume(dna, template.id, {
        target,
        onStage: (s) => {
          setState({ kind: "running", done: [...done], current: s });
          done.push(s);
        },
      });
      setState({ kind: "done", result });
      if (result.report.ok) saveResume({ templateId: template.id, templateVersion: template.version, document: result.document, pageCount: result.layout.pages.length, target: target ? { jobId: target.id, title: target.title, company: target.company, applicationId } : undefined });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Something went wrong" });
    }
  };

  const download = async (kind: "pdf" | "docx", g: GeneratedResume) => {
    setBusy(kind);
    try {
      if (kind === "pdf") await downloadPdf(g);
      else downloadDocx(g);
    } catch {
      toast.error("The download didn't work", "Your résumé is unchanged. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card aria-labelledby="generate-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="generate-title" className="text-[16px] font-semibold text-ink">
            {template.name} selected
          </h2>
          <p className="text-[13px] text-ink-3">
            Your résumé will be generated using {template.name} v{template.version}
            {target ? ` for ${target.title} at ${target.company}` : ""}. Only presentation changes — your Career Profile is never edited.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onChooseAnother}>
            Choose another
          </Button>
          <Button size="sm" onClick={run} loading={state.kind === "running"}>
            {state.kind === "done" || state.kind === "error" ? "Generate again" : "Generate resume"}
          </Button>
        </div>
      </div>

      {state.kind === "running" && (
        <div aria-live="polite">
          <p className="mb-2 text-[13px] font-medium text-ink">Preparing your résumé</p>
          <ol className="flex flex-col gap-1.5">
            {stages.map((s) => {
              const done = state.done.includes(s) && s !== state.current;
              const cur = s === state.current;
              return (
                <li key={s} className="flex items-center gap-2 text-[13px]">
                  {done ? <CheckCircle2 className="size-4 text-success-600" aria-label="Done" /> : cur ? <Loader2 className="size-4 animate-spin text-brand-600 motion-reduce:animate-none" aria-label="In progress" /> : <Circle className="size-4 text-ink-4" aria-label="Waiting" />}
                  <span className={cur ? "font-medium text-ink" : done ? "text-ink-2" : "text-ink-4"}>{STAGE_LABEL[s](template, target)}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {state.kind === "error" && (
        <div role="alert" className="rounded-[12px] border border-danger-100 bg-danger-100/40 p-3">
          <p className="text-[14px] font-medium text-danger-600">We couldn&apos;t generate this résumé.</p>
          <p className="text-[13px] text-ink-2">Your Career Profile is safe. ({state.message})</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={run}>
              Try again
            </Button>
            <Button size="sm" variant="outline" onClick={onChooseAnother}>
              Choose another template
            </Button>
          </div>
        </div>
      )}

      {state.kind === "done" && <Result g={state.result} busy={busy} acknowledged={acknowledged} onAcknowledge={() => setAcknowledged(true)} onDownload={download} onRetry={run} onChooseAnother={onChooseAnother} />}
    </Card>
  );
}

function Result({ g, busy, acknowledged, onAcknowledge, onDownload, onRetry, onChooseAnother }: { g: GeneratedResume; busy: "pdf" | "docx" | null; acknowledged: boolean; onAcknowledge: () => void; onDownload: (k: "pdf" | "docx", g: GeneratedResume) => void; onRetry: () => void; onChooseAnother: () => void }) {
  const { report } = g;
  const critical = report.issues.filter((i) => i.level === "critical");
  const warnings = report.issues.filter((i) => i.level === "warning");
  const layoutProblem = critical.some((i) => i.group === "layout");
  const canDownload = report.ok && (warnings.length === 0 || acknowledged);
  return (
    <div className="flex flex-col gap-4">
      {!report.ok ? (
        <div role="alert" className="rounded-[12px] border border-danger-100 bg-danger-100/40 p-3">
          <p className="text-[14px] font-medium text-danger-600">{layoutProblem ? "This template needs attention." : "This résumé isn't ready yet."}</p>
          <p className="text-[13px] text-ink-2">{layoutProblem ? "Wonder couldn't validate the generated layout. Your content was not changed." : "Your Career Profile is safe — fix the items below and generate again."}</p>
          <ul className="mt-2 list-disc pl-5 text-[13px] text-ink-2">
            {critical.map((i) => (
              <li key={i.message}>{i.message}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            {!layoutProblem && (
              <Button size="sm" href="/app/career-dna">
                Update Career Profile
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
            <Button size="sm" variant="outline" onClick={onChooseAnother}>
              Try another template
            </Button>
          </div>
        </div>
      ) : (
        <div className={warnings.length ? "rounded-[12px] bg-warning-100 p-3" : "rounded-[12px] bg-success-100 p-3"} role="status">
          <p className={warnings.length ? "text-[14px] font-medium text-warning-600" : "text-[14px] font-medium text-success-600"}>
            {warnings.length ? `Résumé ready with ${warnings.length} item${warnings.length === 1 ? "" : "s"} to review` : "Résumé ready"} · saved to My resumes
          </p>
          {warnings.length > 0 && (
            <ul className="mt-1 flex flex-col gap-1">
              {warnings.map((w) => (
                <li key={w.message} className="flex items-start gap-1.5 text-[13px] text-ink-2">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning-600" aria-hidden /> {w.message}
                </li>
              ))}
            </ul>
          )}
          {warnings.length > 0 && !acknowledged && (
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" href="/app/career-dna">
                Review
              </Button>
              <Button size="sm" onClick={onAcknowledge}>
                Download anyway
              </Button>
            </div>
          )}
        </div>
      )}

      <ul className="grid gap-1.5 sm:grid-cols-2" aria-label="Validation">
        {report.checks.map((c) => (
          <li key={c.group} className="flex items-center gap-2 text-[13px]">
            {c.ok ? <CheckCircle2 className="size-4 shrink-0 text-success-600" aria-label="Passed" /> : <XCircle className="size-4 shrink-0 text-danger-600" aria-label="Failed" />}
            <span className="text-ink-2">{c.label}</span>
          </li>
        ))}
      </ul>

      <ResumeViewer layout={g.layout} title={`${g.template.name} v${g.template.version}`} />

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onDownload("pdf", g)} disabled={!canDownload} loading={busy === "pdf"} icon={<Download className="size-4" aria-hidden />}>
          Download PDF
        </Button>
        <Button variant="outline" onClick={() => onDownload("docx", g)} disabled={!canDownload} loading={busy === "docx"} icon={<Download className="size-4" aria-hidden />}>
          Download DOCX
        </Button>
        {!canDownload && report.ok && <p className="self-center text-[12px] text-ink-3">Review the items above to enable downloads.</p>}
      </div>
      <p className="text-[12px] text-ink-4">
        The PDF is built on your device from exactly what you see above. <Link href="/app/resume-studio?tab=mine" className="text-brand-600 hover:underline">My resumes</Link> keeps every version with the template it used.
      </p>
    </div>
  );
}
