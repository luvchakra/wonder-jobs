"use client";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, PauseCircle, RefreshCw, XCircle } from "lucide-react";
import { resolveCapability } from "@/domain/automation/policy";
import { adapterFor } from "@/domain/jobs-apply/adapters";
import { destinationFor } from "@/domain/jobs-apply/destination";
import {
  effectiveFill,
  fillDecision,
  handoffDecision,
} from "@/domain/jobs-apply/policy";
import { buildApplicationProfile } from "@/domain/jobs-apply/profile";
import { applyReadiness, findDuplicate } from "@/domain/jobs-apply/readiness";
import { stepOf, TERMINAL } from "@/domain/jobs-apply/states";
import type { ApplyMode, InterventionItem } from "@/domain/jobs-apply/types";
import { useApplicationsStore } from "@/store/applications";
import { useActionsStore } from "@/store/actions";
import { useAuthStore } from "@/store/auth";
import { useAutomationStore } from "@/store/automation";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import {
  buildPack,
  exportPackZip,
  jobsApplyApi,
  JobsApplyApiError,
  packFileBytes,
  pairHelper,
  rehydratePack,
  type ApiError,
  type SessionView,
} from "@/services/jobs-apply/client";
import { auditAction } from "@/lib/audit";
import { track } from "@/lib/analytics";
import { downloadBytes } from "@/lib/download";
import { useAIService } from "@/lib/useAIService";
import { useExtensionInstalled } from "@/lib/useExtensionInstalled";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { EmptyState, PageLoading } from "@/components/common/States";
import { Segmented } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { ApplyStepper } from "@/components/jobs-apply/ApplyStepper";
import { ApplicationReview } from "@/components/jobs-apply/ApplicationReview";
import { GuidedApplication } from "@/components/jobs-apply/GuidedApplication";
import {
  InterventionQueue,
  type ResolveBody,
} from "@/components/jobs-apply/InterventionQueue";
import {
  Preflight,
  resumeOptionsFor,
  type Method,
} from "@/components/jobs-apply/Preflight";
import {
  FilledSummary,
  SessionProgress,
} from "@/components/jobs-apply/SessionProgress";
import { StatusBanner } from "@/components/jobs-apply/StatusBanner";
import { SubmissionStatus } from "@/components/jobs-apply/SubmissionStatus";
import { WhatWonderDid } from "@/components/jobs-apply/WhatWonderDid";

const SENT = new Set([
  "submitted",
  "under_review",
  "interview",
  "offer",
  "rejected",
]);
const POLL_MS = 2500;

/**
 * Apply with Wonder (JobsApply). Method → Sign in → Fill & review → Submit on site → Track.
 * Wonder fills; the candidate reviews and submits on the employer's own site, then tells Wonder.
 */
export default function ApplyWithWonderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: jobId } = use(params);
  const job = useJobsStore((s) => s.jobs[jobId]);
  const jobs = useJobsStore((s) => s.jobs);
  const applications = useApplicationsStore((s) => s.applications);
  const app = useMemo(
    () => Object.values(applications).find((a) => a.jobId === jobId),
    [applications, jobId],
  );
  const dna = useCareerStore((s) => s.dna);
  const savedResumes = useCareerStore((s) => s.savedResumes);
  const answerMemory = useCareerStore((s) => s.answerMemory);
  const rememberAnswer = useCareerStore((s) => s.rememberAnswer);
  const email = useAuthStore((s) => s.email);
  const policy = useAutomationStore((s) => s.policy);
  const level = useAutomationStore((s) => s.defaultLevel);
  const helperInstalled = useExtensionInstalled(600);
  const ai = useAIService();

  const [view, setView] = useState<SessionView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<ApiError["duplicate"] | null>(
    null,
  );
  const [recovered, setRecovered] = useState(false);
  const [startOver, setStartOver] = useState(false);
  const [helperConnected, setHelperConnected] = useState<boolean | null>(null);
  const [method, setMethod] = useState<Method>("helper");
  const [methodTouched, setMethodTouched] = useState(false);
  const [independent, setIndependent] = useState(false);
  const [includeCover, setIncludeCover] = useState(true);
  const resumeOptions = useMemo(() => {
    const art = app?.artifacts.find((a) => a.type === "resume");
    const v = art?.versions.find((x) => x.id === art.currentVersionId);
    return resumeOptionsFor({
      jobId,
      hasTailored: !!v,
      tailoredSource: v
        ? v.provenance === "AI_GENERATED"
          ? "AI-generated draft"
          : v.provenance === "USER_MODIFIED"
            ? "AI draft edited by you"
            : "Written by you"
        : undefined,
      saved: savedResumes,
    });
  }, [app, jobId, savedResumes]);
  const [resumeKey, setResumeKey] = useState<string>("");
  const effectiveResumeKey = resumeOptions.some((o) => o.key === resumeKey)
    ? resumeKey
    : (resumeOptions[0]?.key ?? "");
  const windowRef = useRef<Window | null>(null);

  const fillPolicy = fillDecision(policy, level);
  const handoffPolicy = handoffDecision(policy, level);
  const chosenMethod: Method = methodTouched
    ? method
    : helperInstalled === false || fillPolicy === "skip"
      ? "guided"
      : "helper";

  // Load: an unfinished session for this job is offered for recovery (§71).
  useEffect(() => {
    let off = false;
    jobsApplyApi
      .list()
      .then(async (r) => {
        const latest = r.sessions
          .filter((s) => s.jobId === jobId && s.status !== "CANCELLED")
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        if (!latest || off) return;
        const v = await jobsApplyApi.get(latest.id);
        if (off) return;
        setView(v);
        if (
          !TERMINAL.has(v.session.status) &&
          v.session.status !== "SUBMITTED" &&
          v.session.status !== "READY"
        )
          setRecovered(true);
      })
      .catch(() => undefined)
      .finally(() => !off && setLoaded(true));
    return () => {
      off = true;
    };
  }, [jobId]);

  // Live updates while the helper works on the employer's page.
  const sessionId = view?.session.id;
  const live =
    !!view &&
    !TERMINAL.has(view.session.status) &&
    view.session.status !== "READY";
  useEffect(() => {
    if (!sessionId || !live) return;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      jobsApplyApi
        .get(sessionId)
        .then((v) =>
          setView((cur) =>
            cur &&
            cur.session.updatedAt === v.session.updatedAt &&
            cur.decisions?.fill === v.decisions?.fill
              ? cur
              : v,
          ),
        )
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [sessionId, live]);

  // Helper tokens last 30 minutes; while this page is open, keep the pairing fresh.
  const helperMode =
    !!view && view.session.mode !== "guided" && !view.session.stopped;
  useEffect(() => {
    if (!sessionId || !live || !helperMode || helperInstalled !== true) return;
    const t = setInterval(() => void pairHelper(sessionId), 20 * 60_000);
    return () => clearInterval(t);
  }, [sessionId, live, helperMode, helperInstalled]);

  const openEmployer = useCallback(() => {
    if (!view) return;
    // Return to the tab the candidate is filling rather than reloading it (which would lose their input).
    const existing = windowRef.current;
    if (existing && !existing.closed) {
      existing.focus();
    } else {
      const w = window.open(
        view.session.destination.url,
        `wj-apply-${view.session.id}`,
      );
      if (w) windowRef.current = w;
    }
    track("jobsapply_destination_opened", { sessionId: view.session.id });
  }, [view]);

  const pair = useCallback(async (id: string) => {
    const p = await pairHelper(id);
    setHelperConnected(p.ok);
    if (p.ok) track("jobsapply_helper_paired", { sessionId: id });
    return p.ok;
  }, []);

  if (!job) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          back={{ href: "/app/jobs", label: "Jobs" }}
          title="Job not found"
        />
        <EmptyState
          title="This job isn't in your catalog"
          body="It may have been removed in a newer run."
          action={{ label: "Back to jobs", href: "/app/jobs" }}
        />
      </div>
    );
  }

  const destination = destinationFor(job);
  const prepareHref = app
    ? `/app/applications/${app.id}/prepare`
    : `/app/jobs/${job.id}`;
  const clientDuplicate = !view
    ? findDuplicate(job, Object.values(applications), jobs)
    : null;
  const shownDuplicate =
    duplicate ?? (clientDuplicate && !startOver ? clientDuplicate : null);
  const hasCover = !!app?.artifacts.some(
    (a) => a.type === "cover_letter" && a.versions.length,
  );
  const choice = resumeOptions.find((o) => o.key === effectiveResumeKey);
  const draftProfile = buildApplicationProfile(dna, {
    accountEmail: email ?? undefined,
  });
  const readiness = applyReadiness({
    profile: draftProfile,
    resume: choice
      ? {
          kind: "resume",
          filename: choice.label,
          source: choice.kind === "saved" ? "template-pdf" : "tailored-docx",
          versionId: choice.key,
          provenance: "SYSTEM_DERIVED",
        }
      : undefined,
    coverLetter:
      hasCover && includeCover
        ? {
            kind: "cover_letter",
            filename: "Cover letter",
            source: "tailored-docx",
            versionId: "c",
            provenance: "USER_PROVIDED",
          }
        : undefined,
    answers: app?.artifacts.some((a) => a.type === "answers")
      ? [{ id: "x", question: "", answer: "", provenance: "USER_PROVIDED" }]
      : [],
    memory: answerMemory,
  });

  const start = async (acknowledgeDuplicate = false) => {
    if (!choice) return;
    // A saved template résumé can start an application for a job that has no Application Pack yet.
    const app = appOrNew();
    setBusy(true);
    setError(null);
    const mode: ApplyMode =
      chosenMethod === "helper"
        ? independent
          ? "fill"
          : "assisted"
        : "guided";
    // Open the employer's tab inside the click, so no popup blocker stands in the way; it navigates once the session exists.
    const pre = mode !== "guided" ? window.open("about:blank", "_blank") : null;
    try {
      const pack = await buildPack({
        app,
        job,
        dna,
        accountEmail: email ?? undefined,
        memory: answerMemory,
        resume:
          choice.kind === "saved" && choice.saved
            ? { kind: "saved", saved: choice.saved }
            : { kind: "tailored" },
        includeCover: hasCover && includeCover,
      });
      let v = await jobsApplyApi.create({
        job: {
          id: job.id,
          title: job.title,
          company: job.company,
          applyUrl: job.applyUrl,
          companyDomain: job.companyDomain,
          onEmployerSite: job.onEmployerSite,
          lake: job.lake,
        },
        pack,
        mode,
        startOver,
        acknowledgeDuplicate,
      });
      if (v.resumed) {
        pre?.close();
        setView(v);
        setRecovered(true);
        return;
      }
      v = await jobsApplyApi.act(v.session.id, "start");
      setView(v);
      setDuplicate(null);
      setStartOver(false);
      track("jobsapply_started", {
        sessionId: v.session.id,
        mode,
        provider: v.session.destination.provider ?? "generic",
      });
      // The hand-off is the external action: ledgered once per session and audited (CLAUDE.md).
      const key = `jobsapply-handoff:${v.session.id}`;
      const ledger = useActionsStore.getState();
      if (!ledger.byKey(key)) {
        const a = ledger.create({
          type: "submit_application",
          applicationId: app.id,
          idempotencyKey: key,
          label: `Open ${job.company}'s application (Apply with Wonder)`,
          content: "",
        });
        ledger.update(
          a.id,
          {
            status: "succeeded",
            attempts: 1,
            executedAt: new Date().toISOString(),
          },
          {
            event: "executed",
            detail: `Opened ${v.session.destination.domain}; the candidate submits there`,
          },
        );
        auditAction({
          actionId: a.id,
          actionType: "submit_application",
          event: "handoff_opened",
          detail: `JobsApply session ${v.session.id} · ${mode}`,
        });
      }
      useApplicationsStore
        .getState()
        .addEvent(app.id, {
          type: "note",
          title:
            mode === "guided"
              ? "Application opened in guided mode"
              : "Application opened with Wonder's browser helper",
          detail: `On ${v.session.destination.domain}. You submit there, then confirm here.`,
        });
      if (mode !== "guided") {
        await pair(v.session.id);
        if (pre) {
          pre.opener = null;
          pre.location.href = v.session.destination.url;
          windowRef.current = pre;
        }
      }
      if (chosenMethod === "pack") await exportPack(v);
    } catch (e) {
      pre?.close();
      if (
        e instanceof JobsApplyApiError &&
        e.detail.code === "DUPLICATE_APPLICATION"
      )
        setDuplicate(
          e.detail.duplicate ?? { applicationId: "", reason: "same job" },
        );
      else
        setError(
          e instanceof Error ? e.message : "Couldn't start the application.",
        );
    } finally {
      setBusy(false);
    }
  };

  const withSession = async (
    fn: (id: string) => Promise<SessionView>,
    done?: string,
  ) => {
    if (!view) return;
    setBusy(true);
    try {
      setView(await fn(view.session.id));
      if (done) toast.success(done);
    } catch (e) {
      toast.error(
        "Couldn't update the application",
        e instanceof Error ? e.message : undefined,
      );
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (item: InterventionItem, body: ResolveBody) => {
    if (!view) return;
    setBusyId(item.id);
    try {
      setView(await jobsApplyApi.resolve(view.session.id, item.id, body));
      track("jobsapply_intervention_resolved", {
        category: item.category,
        action: body.action,
      });
    } catch (e) {
      toast.error(
        "Couldn't save that",
        e instanceof Error ? e.message : undefined,
      );
    } finally {
      setBusyId(null);
    }
  };

  function appOrNew() {
    if (app) return app;
    const jobsState = useJobsStore.getState();
    if (!jobsState.saved[jobId]) jobsState.save(jobId);
    return useApplicationsStore.getState().create(jobId, "preparing");
  }

  const draft = async (question: string, metric?: string) => {
    // Drafting is AI generation: gated like the rest of it, and the candidate's click is the "ask".
    if (resolveCapability("generate_cover_letter", policy, level) === "skip")
      throw new Error(
        "Drafting is turned off in What Wonder can do (Generate cover letter).",
      );
    const text = await ai().answerApplicationQuestion({
      job,
      dna,
      question,
      metric,
    });
    track("jobsapply_answer_drafted", { withMetric: !!metric });
    return text;
  };

  const confirm = async (answer: "yes" | "not_yet" | "unsure") => {
    if (!view) return;
    setBusy(true);
    try {
      let v = await jobsApplyApi.confirm(view.session.id, answer);
      setView(v);
      if (answer === "yes" && app) {
        const store = useApplicationsStore.getState();
        const cur = store.applications[app.id];
        const seen = [...v.session.evidence]
          .reverse()
          .find(
            (e) =>
              e.kind === "confirmation_number" ||
              e.kind === "confirmation_page",
          );
        if (cur && !SENT.has(cur.status)) {
          store.setStatus(app.id, "submitted", {
            type: "submitted",
            title: "Submitted",
            detail: `Confirmed by you after applying with Wonder${seen ? ` · ${seen.kind === "confirmation_number" ? `confirmation ${seen.detail}` : "confirmation page seen"}` : ""}`,
          });
          const due = new Date(Date.now() + 5 * 86_400_000).toISOString();
          store.addFollowUp(app.id, {
            dueAt: due,
            kind: "follow_up",
            note: "Follow up if there is no response",
          });
          store.setNextAction(
            app.id,
            "Wait for response · follow up in 5 days",
            due,
          );
        }
        const ledger = useActionsStore.getState();
        const handoff = ledger.byKey(`jobsapply-handoff:${v.session.id}`);
        if (handoff)
          auditAction({
            actionId: handoff.id,
            actionType: "submit_application",
            event: "candidate_confirmed_submitted",
            detail: seen
              ? "with confirmation evidence"
              : "candidate confirmation",
          });
        track("jobsapply_candidate_submitted", {
          sessionId: v.session.id,
          evidence: seen?.kind ?? "none",
        });
        v = await jobsApplyApi.act(v.session.id, "tracked");
        setView(v);
      } else if (answer === "unsure" && app) {
        useApplicationsStore
          .getState()
          .setNextAction(
            app.id,
            `Check whether your application to ${job.company} went through`,
          );
        track("jobsapply_submission_unknown", { sessionId: v.session.id });
      }
    } catch (e) {
      toast.error(
        "Couldn't record that",
        e instanceof Error ? e.message : undefined,
      );
    } finally {
      setBusy(false);
    }
  };

  const downloadFile = async (kind: "resume" | "cover_letter") => {
    if (!view) return;
    const pack = await rehydratePack(view.session.pack, app, savedResumes);
    const f = kind === "resume" ? pack.resume : pack.coverLetter;
    const b = f ? packFileBytes(f) : null;
    if (!f || !b)
      return toast.error(
        "That document isn't available any more",
        "Open the Application Pack to download it.",
      );
    downloadBytes(b.bytes, f.filename, b.mime);
  };

  async function exportPack(v: SessionView | null = view) {
    if (!v) return;
    const pack = await rehydratePack(v.session.pack, app, savedResumes);
    const zip = exportPackZip(pack, v.session.destination.url);
    downloadBytes(
      zip,
      `Application_Pack_${job.company.replace(/[^\p{L}\p{N}]+/gu, "_")}.zip`,
      "application/zip",
    );
    track("jobsapply_pack_exported", { sessionId: v.session.id });
  }

  const s = view?.session;
  const inSession =
    !!s && s.status !== "CANCELLED" && !(startOver && !TERMINAL.has(s.status));
  const guided = !!s && (s.mode === "guided" || s.failure === "FORM_NOT_FOUND");
  const rawStep = s && inSession ? stepOf(s.status) : "method";
  const step = guided && rawStep === "sign_in" ? "fill" : rawStep;

  const duplicateCard = shownDuplicate ? (
    <Card
      className="mb-4 border-warning-100 bg-warning-100/40"
      role="alert"
      aria-labelledby="wj-dup"
    >
      <h2 id="wj-dup" className="text-[16px] font-semibold text-ink">
        Wonder found an existing application for this opportunity
      </h2>
      <p className="mt-1 text-[13px] text-ink-2">
        {shownDuplicate.appliedAt
          ? `Applied: ${new Date(shownDuplicate.appliedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
          : "Marked as submitted"}{" "}
        · matched by {shownDuplicate.reason}. Wonder won&apos;t start a
        duplicate application unless you choose to.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {shownDuplicate.applicationId && (
          <Button
            size="sm"
            href={`/app/applications/${shownDuplicate.applicationId}`}
          >
            View application
          </Button>
        )}
        {resumeOptions.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => start(true)}
            disabled={busy}
          >
            Continue anyway
          </Button>
        )}
      </div>
    </Card>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={{ href: `/app/jobs/${job.id}`, label: "Job" }}
        eyebrow="Apply with Wonder"
        title={job.title}
        description={`${job.company} · ${job.location}`}
      />
      <ApplyStepper current={step} />

      {!loaded ? (
        <PageLoading rows={3} />
      ) : !resumeOptions.length && !(s && inSession) ? (
        <>
          {duplicateCard}
          <EmptyState
            title="Prepare your application first"
            body="Apply with Wonder uses the résumé you prepared for this role. Prepare one in the Application Pack, or generate one from a template — then come back."
            action={{
              label: app ? "Open Application Pack" : "Back to the job",
              href: prepareHref,
            }}
          />
        </>
      ) : s &&
        inSession &&
        (s.status === "SUBMITTED" || s.status === "TRACKED") ? (
        <SubmissionStatus
          session={s}
          applicationHref={
            app ? `/app/applications/${app.id}` : "/app/applications"
          }
          followUpDue={app ? applications[app.id]?.followUpAt : undefined}
        />
      ) : s && inSession ? (
        <>
          {recovered && (
            <Card
              className="mb-4 border-brand-200"
              aria-labelledby="wj-recover"
            >
              <h2
                id="wj-recover"
                className="text-[16px] font-semibold text-ink"
              >
                Continue application
              </h2>
              <p className="mt-1 text-[13px] text-ink-2">
                We found your previous Apply with Wonder session for this role.
                Everything filled and answered so far is saved.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    setRecovered(false);
                    if (s.mode !== "guided") {
                      await jobsApplyApi
                        .act(s.id, "start")
                        .then(setView)
                        .catch(() => undefined);
                      await pair(s.id);
                    }
                  }}
                >
                  Continue
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRecovered(false);
                    setStartOver(true);
                  }}
                >
                  Start over
                </Button>
              </div>
            </Card>
          )}
          <StatusBanner
            session={s}
            busy={busy}
            onResume={() =>
              withSession((id) => jobsApplyApi.act(id, "resume")).then(
                () => s.mode !== "guided" && pair(s.id),
              )
            }
            onApproveDomain={(host) =>
              withSession(
                (id) => jobsApplyApi.approveDomain(id, host),
                `Continuing on ${host}`,
              )
            }
            onStop={() =>
              withSession(
                (id) => jobsApplyApi.act(id, "stop"),
                "Stopped. Nothing was submitted.",
              )
            }
            onOpen={openEmployer}
            onGuided={() =>
              withSession((id) => jobsApplyApi.setMode(id, "guided")).then(() =>
                track("jobsapply_guided_used", { sessionId: s.id }),
              )
            }
          />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex min-w-0 flex-col gap-5">
              {!guided && (
                <SessionProgress
                  session={s}
                  progress={view.progress}
                  helperConnected={
                    helperInstalled === false ? false : helperConnected
                  }
                  fillDecision={
                    view.decisions
                      ? effectiveFill(view.decisions.fill, s.mode)
                      : undefined
                  }
                  onPair={() => pair(s.id)}
                  onOpen={openEmployer}
                />
              )}
              {!guided && (
                <InterventionQueue
                  session={s}
                  onResolve={resolve}
                  onDraft={draft}
                  onRemember={rememberAnswer}
                  busyId={busyId}
                />
              )}
              {guided && (
                <GuidedApplication
                  pack={s.pack}
                  applyUrl={s.destination.url}
                  onOpen={openEmployer}
                  onDownloadFile={downloadFile}
                  onExport={() => exportPack()}
                />
              )}
              <ApplicationReview
                session={s}
                progress={view.progress}
                onOpen={openEmployer}
                onConfirm={confirm}
                busy={busy}
              />
              <WhatWonderDid audit={s.audit} />
            </div>
            <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
              {!guided && (
                <FilledSummary session={s} progress={view.progress} />
              )}
              <Card aria-labelledby="wj-controls">
                <h2
                  id="wj-controls"
                  className="text-[15px] font-semibold text-ink"
                >
                  How much should Wonder do?
                </h2>
                <Segmented
                  className="mt-3"
                  size="sm"
                  label="How much should Wonder do?"
                  value={s.mode}
                  onChange={(m) =>
                    withSession((id) => jobsApplyApi.setMode(id, m)).then(
                      () => m !== "guided" && pair(s.id),
                    )
                  }
                  options={[
                    { value: "guided", label: "Guide me" },
                    { value: "assisted", label: "Fill for me" },
                    { value: "fill", label: "Independently" },
                  ]}
                />
                <p className="mt-2 text-[12px] text-ink-3">
                  {s.mode === "guided"
                    ? "You fill the form; everything is ready to copy."
                    : s.mode === "assisted"
                      ? "The helper fills safe fields when you click Fill."
                      : view.decisions &&
                          effectiveFill(view.decisions.fill, s.mode) === "run"
                        ? "The helper fills safe fields as soon as the form opens."
                        : "Your “Fill application forms” setting is Ask, so the helper still waits for your click."}
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={openEmployer}
                    iconRight={
                      <ExternalLink className="size-3.5" aria-hidden />
                    }
                  >
                    Open application
                  </Button>
                  {!guided && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => pair(s.id)}
                      icon={<RefreshCw className="size-3.5" aria-hidden />}
                    >
                      Reconnect helper
                    </Button>
                  )}
                  {!s.stopped && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        withSession(
                          (id) => jobsApplyApi.act(id, "stop"),
                          "Stopped. Fields already entered stay on the page; nothing was submitted.",
                        ).then(() =>
                          track("jobsapply_stopped", { sessionId: s.id }),
                        )
                      }
                      icon={<PauseCircle className="size-3.5" aria-hidden />}
                    >
                      Stop
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => exportPack()}
                  >
                    Download Application Pack
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      withSession(
                        (id) => jobsApplyApi.act(id, "cancel"),
                        "Application session cancelled. Nothing was submitted.",
                      )
                    }
                    icon={<XCircle className="size-3.5" aria-hidden />}
                  >
                    Cancel this application
                  </Button>
                </div>
                {helperInstalled === false && !guided && (
                  <p className="mt-3 text-[12px] text-ink-2">
                    The browser helper isn&apos;t installed.{" "}
                    <Link
                      href="/extension"
                      className="font-medium text-brand-600 hover:underline"
                    >
                      Install it
                    </Link>
                    , or choose Guide me.
                  </p>
                )}
              </Card>
            </aside>
          </div>
        </>
      ) : (
        <>
          {duplicateCard}
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-[12px] bg-danger-100 px-3 py-2 text-[13px] text-danger-600"
            >
              Wonder couldn&apos;t continue: {error} Nothing was submitted.
            </p>
          )}
          <Preflight
            company={job.company}
            prepareHref={prepareHref}
            readiness={readiness}
            destination={destination}
            adapterName={adapterFor(destination?.provider)?.name}
            resumeOptions={resumeOptions}
            resumeKey={effectiveResumeKey}
            onResume={setResumeKey}
            hasCover={hasCover}
            includeCover={includeCover}
            onIncludeCover={setIncludeCover}
            method={chosenMethod}
            onMethod={(m) => {
              setMethod(m);
              setMethodTouched(true);
            }}
            independent={independent}
            onIndependent={setIndependent}
            fillPolicy={fillPolicy}
            handoffPolicy={handoffPolicy}
            helperInstalled={helperInstalled}
            busy={busy}
            blockedReason={
              shownDuplicate
                ? "Choose “Continue anyway” above to apply again."
                : undefined
            }
            onStart={() => start(false)}
          />
        </>
      )}
    </div>
  );
}
