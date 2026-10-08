"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { buildApplicationProfile, missingProfileFields } from "@/domain/jobs-apply/profile";
import { describeApplicationPack, PACK_ITEM_LABEL } from "@/domain/applications/pack";
import { describeDecision } from "@/domain/jobs/decision";
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

type Tab = ArtifactType | "review";

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
  const quality = useJobsStore((s) => (app ? s.quality[app.jobId] : undefined));
  const dna = useCareerStore((s) => s.dna);
  const aiConfig = useAIStore((s) => s.config);
  const recordUsage = useAIStore((s) => s.recordUsage);
  const policy = useAutomationStore((s) => s.policy);
  const [tab, setTab] = useState<Tab>("resume");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
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
      toast.info("Turned off in Automation", "Enable generation there, or write it manually.");
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
      // One provider request is the whole job, so the UI shows one honest "drafting…" state for it
      // rather than a list of sub-steps that never actually ran separately.
      if (type === "resume") content = await svc.generateResume(input);
      else if (type === "cover_letter") content = await svc.generateCoverLetter(input);
      else content = await svc.generateScreeningAnswers(input);
      addVersion(app.id, type, { provenance: "AI_GENERATED", content, note: `Generated with ${aiConfig.activeProvider === "wonderjobs" ? "WonderJobs AI" : aiConfig.activeModel}` });
      track("application_preparation_completed", { applicationId: app.id, artifact: type });
      const latest = useApplicationsStore.getState().applications[app.id];
      if (latest && describeApplicationPack(latest).ready) track("application_pack_completed", { applicationId: app.id });
      toast.success(`${type === "resume" ? "Resume" : type === "cover_letter" ? "Cover letter" : "Answers"} ready`, "Review and edit before you continue.");
    } catch (e) {
      const provider = e instanceof ProviderError ? e.provider : aiConfig.activeProvider;
      setError({ message: e instanceof Error ? e.message : "Generation failed.", provider, type });
    } finally {
      setBusy((b) => ({ ...b, [type]: false }));
    }
  };

  const pack = describeApplicationPack(app);
  const allReady = pack.ready;
  const concerns = describeDecision(job, match, quality).consider;
  // What the employer's form will ask for that the Career Profile doesn't hold (email falls back to the sign-in address).
  const missingInfo = missingProfileFields(buildApplicationProfile(dna)).filter((m) => m !== "Email");
  const generating = (Object.keys(busy) as ArtifactType[]).find((t) => busy[t]);
  const providerName = aiConfig.activeProvider === "wonderjobs" ? "WonderJobs AI" : aiConfig.activeModel;
  const finish = () => {
    track("external_handoff_started", { applicationId: app.id });
    setStatus(app.id, "ready_for_review", { type: "prepared", title: "Application prepared", detail: "Reviewed and approved by you" });
    setNextAction(app.id, "Submit on the employer's site, then mark as submitted");
    // The hand-off itself: Wonder opens the employer's page with materials ready. It never submits
    // on the candidate's behalf — that's the candidate's own next click, on the employer's own site.
    window.open(job.applyUrl, "_blank", "noopener,noreferrer");
    toast.success("Opened the employer's application page", "Submit there with your materials ready, then come back and mark this application as submitted.");
    router.push(`/app/applications/${app.id}`);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: `/app/applications/${app.id}`, label: "Application" }}
        title="Application Pack"
        description={`${job.title} · ${job.company}`}
        actions={
          <>
            <Badge tone={APPLICATION_STATUS_META[app.status].tone}>{APPLICATION_STATUS_META[app.status].label}</Badge>
          </>
        }
      />
      <Card className="mb-5" aria-labelledby="wj-pack-summary">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="wj-pack-summary" className="flex items-center gap-2 text-[18px] font-semibold text-ink">
              {pack.ready && <CheckCircle2 className="size-5 text-success-600" aria-hidden />}
              {pack.title}
            </h2>
          </div>
          {pack.ready ? (
            tab !== "review" && (
              <Button size="sm" onClick={() => setTab("review")}>
                Review and continue
              </Button>
            )
          ) : null}
        </div>
        {missingInfo.length > 0 && (
          <p className="mt-3 text-[13px] text-ink-2">
            {job.company}&apos;s form will ask for: {missingInfo.join(", ")} (not in your <Link href="/app/career-dna" className="font-medium text-brand-600 hover:underline">Career Profile</Link>).
          </p>
        )}
        {concerns.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {concerns.map((c) => (
              <li key={c} className="flex items-start gap-2 text-[13px] text-ink-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning-600" aria-hidden /> {c}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div>
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
            {generating && (
              <div className="mb-5 flex items-center gap-2 rounded-[14px] border border-line bg-surface-2 p-4 text-[14px] font-medium text-ink" role="status" aria-live="polite">
                <Loader2 className="size-4 wj-animate-spin text-brand-600" aria-hidden /> Drafting your {PACK_ITEM_LABEL[generating].toLowerCase()} with {providerName}…
              </div>
            )}
            {tab !== "review" ? (
              // key={tab} forces a fresh instance per artifact type: without it, switching tabs mid-edit
              // reused the same component (same position, same element type), leaving stale draft text
              // and edit mode active — a "Save version" click right after switching would then attribute
              // the previous artifact's edited text to whichever type the tab just changed to.
              <>
              {tab === "resume" && (
                <Link href={`/app/resume-studio?job=${encodeURIComponent(app.jobId)}&app=${encodeURIComponent(app.id)}`} className="mb-4 inline-block text-[13px] font-medium text-brand-600 hover:underline">
                  Want a designed PDF or Word file? Choose a résumé template
                </Link>
              )}
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
              </>
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
                  <input
                    type="checkbox"
                    checked={approved}
                    onChange={(e) => {
                      setApproved(e.target.checked);
                      if (e.target.checked) track("application_reviewed", { applicationId: app.id });
                    }} className="mt-0.5 size-4 accent-brand-500" />
                  I&apos;ve reviewed these materials. They&apos;re accurate and I&apos;m happy to use them for this application.
                </label>
                <p className="mt-3 text-[12px] text-ink-4">You submit on {job.company}&apos;s site, then mark it submitted — unless Submit for me is on, when Wonder&apos;s helper submits.</p>
              </div>
            )}
          </Card>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {tab !== "review" ? (
              <Button size="lg" onClick={() => setTab((t) => (t === "resume" ? "cover_letter" : t === "cover_letter" ? "answers" : "review"))}>
                {artifact(tab) ? "Continue" : "Skip for now"}
              </Button>
            ) : (
              <>
                <Button size="lg" variant="outline" href={`/app/jobs/${job.id}/apply`} disabled={!approved || !app.artifacts.some((a) => a.type === "resume")}>
                  Apply with Wonder
                </Button>
                <Button size="lg" onClick={finish} disabled={!approved || !allReady} iconRight={<ExternalLink className="size-4" aria-hidden />}>
                  Continue to Employer
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
