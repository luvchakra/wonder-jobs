"use client";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, Download, PauseCircle, RefreshCw, XCircle } from "lucide-react";
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
import { useResumeFilesStore } from "@/store/resumeFiles";
import { baseResumeFor } from "@/domain/career/roles";
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
import { Fold } from "@/components/common/Fold";
import { EmptyState, PageLoading } from "@/components/common/States";
import { Segmented } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { ApplyStepper } from "@/components/jobs-apply/ApplyStepper";
import { ApplicationReview } from "@/components/jobs-apply/ApplicationReview";
import { CloudBrowser } from "@/components/jobs-apply/CloudBrowser";
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
import type { CloudStream } from "@/services/jobs-apply/client";
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
/**
 * The application is in: record it in the tracker (status, follow-up, audit) and close the session.
 * `by`: the candidate confirmed it, or Wonder's helper submitted it under "Submit applications" (WJ-249).
 */
async function recordSubmission(v: SessionView, appId: string | undefined, by: "you" | "wonder"): Promise<SessionView | null> {
  if (!appId) return null;
  const store = useApplicationsStore.getState();
  const cur = store.applications[appId];
  const seen = [...v.session.evidence].reverse().find((e) => e.kind === "confirmation_number" || e.kind === "confirmation_page");
  if (cur && !SENT.has(cur.status)) {
    store.setStatus(appId, "submitted", {
      type: "submitted",
      title: by === "wonder" ? "Submitted by Wonder" : "Submitted",
      detail:
        (by === "wonder" ? "Wonder pressed Submit because “Submit applications” is on for this application" : "Confirmed by you after applying with Wonder") +
        (seen ? ` · ${seen.kind === "confirmation_number" ? `confirmation ${seen.detail}` : "confirmation page seen"}` : ""),
    });
    const due = new Date(Date.now() + 5 * 86_400_000).toISOString();
    store.addFollowUp(appId, { dueAt: due, kind: "follow_up", note: "Follow up if there is no response" });
    store.setNextAction(appId, "Wait for response · follow up in 5 days", due);
  }
  const handoff = useActionsStore.getState().byKey(`jobsapply-handoff:${v.session.id}`);
  if (handoff)
    auditAction({
      actionId: handoff.id,
      actionType: "submit_application",
      event: by === "wonder" ? "wonder_submitted" : "candidate_confirmed_submitted",
      detail: by === "wonder" ? `submit:${v.session.jobId}:me · ${seen ? "with confirmation evidence" : "no confirmation seen"}` : seen ? "with confirmation evidence" : "candidate confirmation",
    });
  track(by === "wonder" ? "jobsapply_wonder_submitted" : "jobsapply_candidate_submitted", { sessionId: v.session.id, evidence: seen?.kind ?? "none" });
  return v.session.status === "SUBMITTED" ? jobsApplyApi.act(v.session.id, "tracked") : null;
}

export default function ApplyWithWonderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: jobId } = use(params);
  const job = useJobsStore((s) => s.jobs[jobId]);
  const jobs = useJobsStore((s) => s.jobs);
  const saved = useJobsStore((s) => !!s.saved[jobId]);
  const saveJob = useJobsStore((s) => s.save);
  const unsaveJob = useJobsStore((s) => s.unsave);
  const applications = useApplicationsStore((s) => s.applications);
  const app = useMemo(
    () => Object.values(applications).find((a) => a.jobId === jobId),
    [applications, jobId],
  );
  const dna = useCareerStore((s) => s.dna);
  const savedResumes = useCareerStore((s) => s.savedResumes);
  const accountBase = useCareerStore((s) => s.baseResume);
  const roles = useCareerStore((s) => s.roles);
  // A job found by one of the candidate's role searches offers that role's résumé first.
  const foundAs = job?.foundAs;
  const { ref: baseResume, role: baseRole } = useMemo(() => baseResumeFor(roles, foundAs, accountBase), [roles, foundAs, accountBase]);
  const resumeFiles = useResumeFilesStore((s) => s.files);
  const resumeFilesStatus = useResumeFilesStore((s) => s.status);
  const loadResumeFiles = useResumeFilesStore((s) => s.load);
  const answerMemory = useCareerStore((s) => s.answerMemory);
  const rememberAnswer = useCareerStore((s) => s.rememberAnswer);
  const email = useAuthStore((s) => s.email);
  const policy = useAutomationStore((s) => s.policy);
  const level = useAutomationStore((s) => s.defaultLevel);
  const helperInstalled = useExtensionInstalled(1500);
  const ai = useAIService();

  const [view, setView] = useState<SessionView | null>(null);
  // Wonder pressed Submit under "Submit applications" and the employer confirmed it: record it, once.
  const recordedWonder = useRef<string | null>(null);
  useEffect(() => {
    if (!view || view.session.status !== "SUBMITTED" || !view.session.wonderSubmittedAt || recordedWonder.current === view.session.id) return;
    recordedWonder.current = view.session.id;
    void recordSubmission(view, app?.id, "wonder").then((t) => t && setView(t));
  }, [view, app?.id]);
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
      uploads: resumeFiles,
      base: baseResume,
      baseRoleTitle: baseRole?.title,
    });
  }, [app, jobId, savedResumes, resumeFiles, baseResume, baseRole]);
  useEffect(() => {
    void loadResumeFiles();
  }, [loadResumeFiles]);
  const resumeFilesPending =
    resumeFilesStatus === "idle" || resumeFilesStatus === "loading";
  const [resumeKey, setResumeKey] = useState<string>("");
  const effectiveResumeKey = resumeOptions.some((o) => o.key === resumeKey)
    ? resumeKey
    : (resumeOptions[0]?.key ?? "");
  const windowRef = useRef<Window | null>(null);

  // The cloud browser (no extension needed — phones): offered when this deployment has one.
  const [cloudAvailable, setCloudAvailable] = useState<boolean | null>(null);
  // Kept with its session id, so a stream never outlives the session it was opened for.
  const [cloudFor, setCloudFor] = useState<{ sessionId: string; stream: CloudStream } | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudClosed, setCloudClosed] = useState(false);
  useEffect(() => {
    jobsApplyApi.cloud
      .available()
      .then((r) => setCloudAvailable(r.available))
      .catch(() => setCloudAvailable(false));
  }, []);

  const fillPolicy = fillDecision(policy, level);
  const handoffPolicy = handoffDecision(policy, level);
  const chosenMethod: Method = methodTouched
    ? method
    : (helperInstalled === false && cloudAvailable !== true) || fillPolicy === "skip"
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

  // Answers the candidate typed on the employer's form, learned by the helper: into their Career Profile's
  // Application answers, so the next form fills them.
  const sessionMemory = view?.session.pack.memory;
  useEffect(() => {
    if (!sessionMemory?.length) return;
    const mine = useCareerStore.getState().answerMemory ?? [];
    for (const m of sessionMemory) {
      const have = mine.find((x) => x.key === m.key && (m.key !== "custom" || x.question === m.question));
      if (!have || have.confirmedAt < m.confirmedAt) useCareerStore.getState().rememberAnswer(m.key, m.value, m.question, m.confirmedAt);
    }
  }, [sessionMemory]);

  // Helper tokens last 30 minutes; while this page is open, keep the pairing fresh.
  const helperMode =
    !!view && view.session.mode !== "guided" && !view.session.stopped;
  useEffect(() => {
    if (!sessionId || !live || !helperMode || helperInstalled !== true) return;
    const t = setInterval(() => void pairHelper(sessionId), 20 * 60_000);
    return () => clearInterval(t);
  }, [sessionId, live, helperMode, helperInstalled]);

  // No extension here (a phone, or Chrome without it): the helper runs in the cloud browser instead.
  const useCloud = helperMode && helperInstalled === false && cloudAvailable === true;
  const startCloud = useCallback(async (id: string): Promise<CloudStream | null> => {
    try {
      const st = await jobsApplyApi.cloud.start(id);
      setCloudError(null);
      setCloudClosed(false);
      // Rejoining keeps the same browser; only a new one replaces the stream (and reconnects).
      setCloudFor((cur) => (cur && cur.sessionId === id && cur.stream.cloudId === st.cloudId ? cur : { sessionId: id, stream: st }));
      return st;
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : "Couldn't open the cloud browser.");
      return null;
    }
  }, []);
  const cloud = cloudFor && cloudFor.sessionId === sessionId && live ? cloudFor.stream : null;
  useEffect(() => {
    if (!useCloud || !sessionId || !live || cloud || cloudError || cloudClosed) return;
    const t = setTimeout(() => void startCloud(sessionId), 0);
    return () => clearTimeout(t);
  }, [useCloud, sessionId, live, cloud, cloudError, cloudClosed, startCloud]);
  // The helper's token in the cloud page lasts 30 minutes; rejoining refreshes it.
  useEffect(() => {
    if (!useCloud || !sessionId || !live || !cloud) return;
    const t = setInterval(() => void startCloud(sessionId), 20 * 60_000);
    return () => clearInterval(t);
  }, [useCloud, sessionId, live, cloud, startCloud]);

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
  // A session already under way (this page reopened, or the helper only answered late): connect the
  // helper to it now rather than reporting it as disconnected until the candidate clicks Reconnect.
  useEffect(() => {
    if (!sessionId || !live || !helperMode || helperInstalled !== true) return;
    let alive = true;
    void pairHelper(sessionId).then((p) => {
      if (alive) setHelperConnected(p.ok);
    });
    return () => {
      alive = false;
    };
  }, [sessionId, live, helperMode, helperInstalled]);
  const connect = useCallback(
    async (id: string) => {
      if (helperInstalled === false && cloudAvailable === true) return !!(await startCloud(id));
      return pair(id);
    },
    [helperInstalled, cloudAvailable, startCloud, pair],
  );

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
          source:
            choice.kind === "saved"
              ? "template-pdf"
              : choice.kind === "upload"
                ? "uploaded"
                : "tailored-docx",
          versionId: choice.key,
          provenance:
            choice.kind === "upload" ? "USER_PROVIDED" : "SYSTEM_DERIVED",
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
            : choice.kind === "upload" && choice.upload
              ? { kind: "upload", file: choice.upload }
              : { kind: "tailored" },
        includeCover: hasCover && includeCover,
      });
      let v = await jobsApplyApi.create({
        ...(app.autoSubmit ? { submit: app.autoSubmit } : {}),
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
      // A session already in progress takes this application's current "Submit for me" choice.
      if (v.resumed && (app.autoSubmit ?? "default") !== (v.session.submitOverride ?? "default")) v = await jobsApplyApi.setSubmit(v.session.id, app.autoSubmit ?? "default");
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
        "Drafting is turned off in Automation (Generate cover letter).",
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

  const recordSubmitted = async (v: SessionView, by: "you" | "wonder") => {
    const tracked = await recordSubmission(v, app?.id, by);
    if (tracked) setView(tracked);
  };

  const confirm = async (answer: "yes" | "not_yet" | "unsure") => {
    if (!view) return;
    setBusy(true);
    try {
      const v = await jobsApplyApi.confirm(view.session.id, answer);
      setView(v);
      if (answer === "yes" && app) {
        await recordSubmitted(v, "you");
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
        actions={
          <Button variant="outline" size="sm" icon={<Bookmark className="size-4" fill={saved ? "currentColor" : "none"} aria-hidden />} aria-pressed={saved} onClick={() => (saved ? unsaveJob(job.id) : saveJob(job.id))}>
            {saved ? "Saved" : "Save"}
          </Button>
        }
      />
      <ApplyStepper current={step} />

      {!loaded || (resumeFilesPending && !resumeOptions.length) ? (
        <PageLoading rows={3} />
      ) : !resumeOptions.length && !(s && inSession) ? (
        <>
          {duplicateCard}
          <EmptyState
            title="Add a résumé first"
            body="Apply with Wonder needs a résumé. Upload the one you already use in Resume Studio, prepare one in the Application Pack, or generate one from a template — then come back."
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
                      await connect(s.id);
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
                () => s.mode !== "guided" && connect(s.id),
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
              {!guided && useCloud && cloud && (
                <CloudBrowser
                  stream={cloud}
                  fillable={view.progress.fillable}
                  fillDecision={view.decisions ? effectiveFill(view.decisions.fill, s.mode) : undefined}
                  busy={cloudBusy}
                  onFill={() => {
                    setCloudBusy(true);
                    jobsApplyApi.cloud
                      .fill(s.id)
                      .catch((e) => toast.error("Couldn't fill", e instanceof Error ? e.message : undefined))
                      .finally(() => setCloudBusy(false));
                  }}
                  onEnd={() => {
                    setCloudClosed(true);
                    setCloudFor(null);
                    jobsApplyApi.cloud.end(s.id).catch(() => undefined);
                  }}
                  onReconnect={() => startCloud(s.id)}
                />
              )}
              {!guided && useCloud && !cloud && (cloudError || cloudClosed) && (
                <p role={cloudError ? "alert" : undefined} className="flex flex-wrap items-center gap-2 rounded-[12px] bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
                  {cloudError ?? "The cloud browser is closed."}
                  <Button size="sm" variant="outline" onClick={() => void startCloud(s.id)}>
                    {cloudError ? "Try again" : "Open the cloud browser"}
                  </Button>
                </p>
              )}
              {!guided && (
                <SessionProgress
                  session={s}
                  progress={view.progress}
                  cloud={useCloud && !!cloud}
                  helperConnected={
                    useCloud ? !!cloud : helperInstalled === false ? false : helperConnected
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
                  memory={answerMemory}
                  onOpen={openEmployer}
                  onDownloadFile={downloadFile}
                  onRemember={rememberAnswer}
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
              {helperInstalled === false && !guided && cloudAvailable !== true && (
                <p className="text-[12px] text-ink-2">
                  The browser helper isn&apos;t installed.{" "}
                  <Link href="/extension" className="font-medium text-brand-600 hover:underline">
                    Install it
                  </Link>
                  , or choose Guide me under Options. Just installed or updated it? Reload this page.
                </p>
              )}
              {/* Everything that isn't the next step: how much Wonder does, stop, the pack, cancel. */}
              <Fold title="Options" hint={`${s.mode === "guided" ? "Guide me" : s.mode === "assisted" ? "Fill for me" : "Independently"} · stop, download or cancel`}>
                <Segmented
                  size="sm"
                  label="How much should Wonder do?"
                  value={s.mode}
                  onChange={(m) =>
                    withSession((id) => jobsApplyApi.setMode(id, m)).then(
                      () => m !== "guided" && connect(s.id),
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
                {!guided && (
                  <div className="mt-4">
                    <Segmented
                      size="sm"
                      label="Submit for me"
                      value={s.submitOverride ?? "default"}
                      onChange={(v) => {
                        if (app) useApplicationsStore.getState().setAutoSubmit(app.id, v === "default" ? undefined : v);
                        void withSession((id) => jobsApplyApi.setSubmit(id, v));
                      }}
                      options={[
                        { value: "default", label: `Default (${view.decisions?.submit === "run" ? "on" : "off"})` },
                        { value: "on", label: "Always" },
                        { value: "off", label: "Never" },
                      ]}
                    />
                    <p className="mt-2 text-[12px] text-ink-3">
                      {(s.submitOverride ?? (view.decisions?.submit === "run" ? "on" : "off")) === "on"
                        ? "The helper presses the employer's Submit once every required field holds your own answer."
                        : "You press the employer's Submit yourself."}
                    </p>
                  </div>
                )}
                <div className="mt-3 flex flex-col items-start gap-1">
                  {!guided && helperConnected === false && helperInstalled !== false && (
                    <Button size="sm" variant="ghost" onClick={() => pair(s.id)} icon={<RefreshCw className="size-3.5" aria-hidden />}>
                      Reconnect helper
                    </Button>
                  )}
                  {!s.stopped && !guided && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        withSession(
                          (id) => jobsApplyApi.act(id, "stop"),
                          s.wonderSubmittedAt ? "Stopped." : "Stopped. Fields already entered stay on the page; nothing was submitted.",
                        ).then(() =>
                          track("jobsapply_stopped", { sessionId: s.id }),
                        )
                      }
                      icon={<PauseCircle className="size-3.5" aria-hidden />}
                    >
                      Stop the helper
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => exportPack()} icon={<Download className="size-3.5" aria-hidden />}>
                    Download Application Pack
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      withSession(
                        (id) => jobsApplyApi.act(id, "cancel"),
                        s.wonderSubmittedAt ? "Application session cancelled." : "Application session cancelled. Nothing was submitted.",
                      )
                    }
                    icon={<XCircle className="size-3.5" aria-hidden />}
                  >
                    Cancel this application
                  </Button>
                </div>
              </Fold>
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
            cloudAvailable={cloudAvailable === true}
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
