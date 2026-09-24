"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Lightbulb, Loader2 } from "lucide-react";
import { MISSING_CANDIDATE_FIELDS } from "@/domain/career/missingFields";
import { FitLabel } from "@/components/jobs/MatchBadge";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { useCareerStore } from "@/store/career";
import { useAIStore } from "@/store/ai";
import { useAutomationStore } from "@/store/automation";
import type { ArtifactType } from "@/domain/applications/types";
import { APPLICATION_STATUS_META } from "@/domain/applications/types";
import { ProviderError } from "@/domain/ai/types";
import { FallbackProvider, TemplateAIService, WonderJobsAIProvider } from "@/services/ai/service";
import { RemoteBYOKProvider } from "@/services/ai/client";
import { track } from "@/lib/analytics";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Tabs } from "@/components/common/Tabs";
import { Badge } from "@/components/common/Badge";
import { EmptyState, ErrorState } from "@/components/common/States";
import { ArtifactEditor } from "@/components/applications/ArtifactEditor";
import { toast } from "@/components/feedback/Toast";
import { cn } from "@/lib/cn";

type Tab = ArtifactType | "review";
const STEPS = ["Analyzing job requirements", "Matching your skills and experience", "Optimizing content", "Highlighting relevant achievements", "Finalizing tailored materials"];

export default function PrepareApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const app = useApplicationsStore((s) => s.applications[id]);
  const addVersion = useApplicationsStore((s) => s.addVersion);
  const updateVersionContent = useApplicationsStore((s) => s.updateVersionContent);
  const restoreVersion = useApplicationsStore((s) => s.restoreVersion);
  const setStatus = useApplicationsStore((s) => s.setStatus);
  const setNextAction = useApplicationsStore((s) => s.setNextAction);
  const job = useJobsStore((s) => (app ? s.jobs[app.jobId] : undefined));
  const match = useJobsStore((s) => (app ? s.matches[app.jobId] : undefined));
  const dna = useCareerStore((s) => s.dna);
  const aiConfig = useAIStore((s) => s.config);
  const recordUsage = useAIStore((s) => s.recordUsage);
  const policy = useAutomationStore((s) => s.policy);
  const [tab, setTab] = useState<Tab>("resume");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<{ step: number; total: number } | null>(null);
  const [error, setError] = useState<{ message: string; provider: string; type: ArtifactType } | null>(null);
  const [approved, setApproved] = useState(false);

  if (!app || !job) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={{ href: "/app/applications", label: "Applications" }} title="Application not found" />
        <EmptyState title="Nothing to prepare" action={{ label: "Back to applications", href: "/app/applications" }} />
      </div>
    );
  }

  const ai = () => {
    const p = aiConfig.activeProvider;
    const cost = { anthropic: { input: 5, output: 25 }, openai: { input: 2.5, output: 10 }, gemini: { input: 1.25, output: 10 } } as const;
    if (p === "wonderjobs") return new TemplateAIService(new WonderJobsAIProvider(), recordUsage, null);
    const provider = new FallbackProvider(new RemoteBYOKProvider(p, aiConfig.activeModel), new WonderJobsAIProvider(), () => aiConfig.allowPlatformFallback, (reason) => toast.info("Used WonderJobs AI for this request", reason));
    return new TemplateAIService(provider, recordUsage, cost[p]);
  };
  const artifact = (t: ArtifactType) => app.artifacts.find((a) => a.type === t);

  const generate = async (type: ArtifactType) => {
    if ((type === "resume" && policy.generate_resume === "off") || (type === "cover_letter" && policy.generate_cover_letter === "off")) {
      toast.info("Turned off in What Wonder can do", "Enable generation there, or write it manually.");
      return;
    }
    setError(null);
    setBusy((b) => ({ ...b, [type]: true }));
    if (app.status === "saved" || app.status === "preparing") setStatus(app.id, "preparing");
    track("application_preparation_started", { applicationId: app.id, artifact: type });
    try {
      const svc = ai();
      const input = { job, dna };
      let content = "";
      // The single call to the provider below is the real work; every step up to it fires immediately
      // beforehand so none is ever skipped over (previously steps jumped 2 → 4, visually implying step 3
      // ran and finished without ever showing as active).
      setProgress({ step: 1, total: STEPS.length });
      setProgress({ step: 2, total: STEPS.length });
      setProgress({ step: 3, total: STEPS.length });
      if (type === "resume") content = await svc.generateResume(input);
      else if (type === "cover_letter") content = await svc.generateCoverLetter(input);
      else content = await svc.generateScreeningAnswers(input);
      setProgress({ step: 4, total: STEPS.length });
      addVersion(app.id, type, { provenance: "AI_GENERATED", content, note: `Generated with ${aiConfig.activeProvider === "wonderjobs" ? "WonderJobs AI" : aiConfig.activeModel}` });
      setProgress({ step: 5, total: STEPS.length });
      track("application_preparation_completed", { applicationId: app.id, artifact: type });
      toast.success(`${type === "resume" ? "Resume" : type === "cover_letter" ? "Cover letter" : "Answers"} ready`, "Review and edit before you continue.");
    } catch (e) {
      const provider = e instanceof ProviderError ? e.provider : aiConfig.activeProvider;
      setError({ message: e instanceof Error ? e.message : "Generation failed.", provider, type });
    } finally {
      setBusy((b) => ({ ...b, [type]: false }));
      setTimeout(() => setProgress(null), 600);
    }
  };

  const allReady = (["resume", "cover_letter", "answers"] as ArtifactType[]).every((t) => artifact(t));
  const finish = () => {
    setStatus(app.id, "ready_for_review", { type: "prepared", title: "Application prepared", detail: "Reviewed and approved by you" });
    setNextAction(app.id, "Submit on the employer's site, then mark as submitted");
    // The hand-off itself: Wonder opens the employer's page with materials ready. It never submits
    // on the candidate's behalf — that's the candidate's own next click, on the employer's own site.
    window.open(job.applyUrl, "_blank", "noopener,noreferrer");
    toast.success("Opened the employer's application page", "Submit there with your materials ready, then come back and mark this application as submitted.");
    router.push(`/app/applications/${app.id}`);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        back={{ href: `/app/applications/${app.id}`, label: "Application" }}
        title="Application Pack"
        description={`Everything to apply for ${job.title} at ${job.company}, in one place.`}
        actions={
          <>
            {allReady && tab !== "review" && (
              <Button size="sm" variant="outline" onClick={() => setTab("review")}>
                Review Application
              </Button>
            )}
            <Badge tone={APPLICATION_STATUS_META[app.status].tone}>{APPLICATION_STATUS_META[app.status].label}</Badge>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <Tabs value={tab} onChange={setTab} label="Materials" items={[{ value: "resume", label: "Resume" }, { value: "cover_letter", label: "Cover Letter" }, { value: "answers", label: "Answers" }, { value: "review", label: "Review" }]} className="mb-4" />
          {error && (
            <ErrorState
              className="mb-4"
              title={`${error.provider === "wonderjobs" ? "WonderJobs AI" : error.provider} couldn't complete your ${error.type === "resume" ? "resume" : error.type === "cover_letter" ? "cover letter" : "screening answers"}`}
              body={error.message}
              actions={[
                { label: "Retry", variant: "primary", onClick: () => generate(error.type) },
                { label: "Change provider", href: "/app/settings/ai" },
                ...(error.provider !== "wonderjobs" ? [{ label: "Use WonderJobs AI (included in plan)", href: "/app/settings/ai?switch=wonderjobs" }] : []),
              ]}
            />
          )}
          <Card>
            {progress && (
              <div className="mb-5 rounded-[14px] border border-line bg-surface-2 p-4" role="status" aria-live="polite">
                <div className="mb-3 flex items-center gap-2 text-[14px] font-medium text-ink">
                  <Loader2 className="size-4 wj-animate-spin text-brand-600" aria-hidden /> Tailoring your {tab === "review" ? "materials" : tab.replace("_", " ")}…
                </div>
                <ol className="flex flex-col gap-1.5">
                  {STEPS.map((s, i) => {
                    const done = i + 1 < progress.step;
                    const active = i + 1 === progress.step;
                    return (
                      <li key={s} className={cn("flex items-center gap-2 text-[13px]", done ? "text-ink" : active ? "text-brand-700" : "text-ink-4")}>
                        {done ? <CheckCircle2 className="size-4 text-success-600" aria-hidden /> : active ? <Loader2 className="size-4 wj-animate-spin" aria-hidden /> : <span className="size-4 rounded-full border border-line-strong" aria-hidden />}
                        {s}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
            {tab !== "review" ? (
              // key={tab} forces a fresh instance per artifact type: without it, switching tabs mid-edit
              // reused the same component (same position, same element type), leaving stale draft text
              // and edit mode active — a "Save version" click right after switching would then attribute
              // the previous artifact's edited text to whichever type the tab just changed to.
              <ArtifactEditor
                key={tab}
                type={tab}
                artifact={artifact(tab)}
                regenerating={!!busy[tab]}
                onRegenerate={() => generate(tab)}
                onSave={(content) => updateVersionContent(app.id, tab, content)}
                onRestore={(vid) => {
                  restoreVersion(app.id, tab, vid);
                  toast.success("Version restored");
                }}
              />
            ) : (
              <div>
                <h2 className="text-[15px] font-semibold text-ink">Review before you continue</h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {(["resume", "cover_letter", "answers"] as ArtifactType[]).map((t) => {
                    const a = artifact(t);
                    const label = { resume: "Resume", cover_letter: "Cover letter", answers: "Screening answers" }[t];
                    return (
                      <li key={t} className="flex items-center justify-between gap-3 rounded-[12px] border border-line p-3 text-[13px]">
                        <span className="flex items-center gap-2">
                          {a ? <CheckCircle2 className="size-4 text-success-600" aria-hidden /> : <span className="size-4 rounded-full border border-line-strong" aria-hidden />}
                          <span className="font-medium text-ink">{label}</span>
                          {a && <span className="text-ink-3">{a.versions.length} version{a.versions.length === 1 ? "" : "s"}</span>}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => setTab(t)}>
                          {a ? "Open" : "Create"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                <label className="mt-4 flex items-start gap-3 rounded-[12px] bg-surface-2 p-3 text-[13px] text-ink-2">
                  <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} className="mt-0.5 size-4 accent-brand-500" />
                  I&apos;ve reviewed these materials. They&apos;re accurate and I&apos;m happy to use them for this application.
                </label>
                <p className="mt-3 text-[12px] text-ink-4">&ldquo;Continue to Employer&rdquo; opens {job.company}&apos;s own application page with these materials ready. Wonder never submits on your behalf — you submit there, then come back and mark it as submitted.</p>
              </div>
            )}
          </Card>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {tab !== "review" ? (
              <>
                <Button variant="outline" size="lg" onClick={() => setTab((t) => (t === "resume" ? "cover_letter" : t === "cover_letter" ? "answers" : "review"))}>
                  Skip for now
                </Button>
                <Button size="lg" onClick={() => setTab((t) => (t === "resume" ? "cover_letter" : t === "cover_letter" ? "answers" : "review"))} disabled={!artifact(tab)}>
                  Continue
                </Button>
              </>
            ) : (
              <Button size="lg" onClick={finish} disabled={!approved || !allReady} iconRight={<ExternalLink className="size-4" aria-hidden />}>
                Continue to Employer
              </Button>
            )}
          </div>
        </div>
        <aside className="flex flex-col gap-4">
          <Card>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Target role</p>
            <p className="mt-1 text-[14px] font-semibold text-ink">{job.title}</p>
            <p className="text-[13px] text-ink-3">{job.company}</p>
            <Link href={`/app/jobs/${job.id}`} className="mt-2 inline-block text-[13px] font-medium text-brand-600 hover:underline">
              View job
            </Link>
          </Card>
          {match && (
            <Card>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Fit summary</p>
              <div className="mt-1.5">
                <FitLabel fit={match.fit} score={match.score} />
              </div>
              <ul className="mt-2.5 flex flex-col gap-1.5 text-[13px] text-ink-2">
                {match.reasons
                  .slice()
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 2)
                  .map((r) => (
                    <li key={r.dimension} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success-600" aria-hidden /> {r.summary}
                    </li>
                  ))}
              </ul>
              <Link href={`/app/jobs/${job.id}`} className="mt-2 inline-block text-[12px] font-medium text-brand-600 hover:underline">
                See full match breakdown
              </Link>
            </Card>
          )}
          <Card>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Missing candidate information</p>
            <ul className="mt-2 flex flex-col gap-1.5 text-[13px] text-ink-2">
              {!dna.name.trim() && <li>Your name (add it to Career DNA)</li>}
              {MISSING_CANDIDATE_FIELDS.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-ink-4">Wonder doesn&apos;t collect these yet, so {job.company}&apos;s form will ask you to fill them in yourself.</p>
          </Card>
          <Card>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Key requirements</p>
            <ul className="mt-2 flex flex-col gap-1.5 text-[13px] text-ink-2">
              {job.requirements.map((r) => (
                <li key={r} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success-600" aria-hidden /> {r}
                </li>
              ))}
            </ul>
          </Card>
          <div className="flex gap-3 rounded-[16px] border border-warning-600/20 bg-warning-100/50 p-4 text-[12px] text-ink-2">
            <Lightbulb className="size-4 shrink-0 text-warning-600" aria-hidden />
            <p>
              <strong className="text-ink">Pro tip</strong> — You can edit the resume at any time and rerun this step with your changes.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
