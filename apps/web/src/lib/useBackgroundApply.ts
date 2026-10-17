"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { baseResumeFor } from "@/domain/career/roles";
import { resumeOptionsFor } from "@/domain/jobs-apply/resumeOptions";
import { FILLABLE, TERMINAL } from "@/domain/jobs-apply/states";
import type { InterventionItem } from "@/domain/jobs-apply/types";
import { pickOnPortal } from "@/domain/jobs-apply/waiting";
import { useApplicationsStore } from "@/store/applications";
import { useAuthStore } from "@/store/auth";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { useResumeFilesStore } from "@/store/resumeFiles";
import { HANDOFF_TITLES } from "@/domain/applications/types";
import { buildPack, jobsApplyApi, JobsApplyApiError, type SessionView } from "@/services/jobs-apply/client";
import { recordHandoff, recordSubmission } from "@/services/jobs-apply/record";
import type { ResolveBody } from "@/components/jobs-apply/InterventionQueue";
import { track } from "@/lib/analytics";

/**
 * Apply for this job (WJ-311): Wonder fills the employer's form in a cloud browser nobody watches, shows
 * its progress and the questions only the candidate can answer here, and offers "Submit this application"
 * once the form's last page is complete. The candidate's press is the only thing that lets the helper press
 * the employer's Submit (`submitOverride: "on"` for this one application, checked again on the server).
 *
 * Everything runs through the same Apply with Wonder session, gate and audit as the Apply page; this hook
 * only drives it. Sign-ins and verification checks stay the candidate's: the Apply page shows that page.
 */
export type BackgroundPhase = "idle" | "starting" | "filling" | "needs_you" | "ready" | "submitting" | "submitted" | "blocked" | "error";

const POLL_MS = 2500;
/** Ask the helper to fill again at most this often while fields are waiting (it fills page after page by itself). */
const NUDGE_MS = 5000;
const BLOCKED = new Set(["AUTHENTICATION_REQUIRED", "VERIFICATION", "PAUSED", "BLOCKED", "UNKNOWN", "FAILED"]);

export function useBackgroundApply(jobId: string) {
  const job = useJobsStore((s) => s.jobs[jobId]);
  const applications = useApplicationsStore((s) => s.applications);
  const app = useMemo(() => Object.values(applications).find((a) => a.jobId === jobId), [applications, jobId]);
  const dna = useCareerStore((s) => s.dna);
  const savedResumes = useCareerStore((s) => s.savedResumes);
  const accountBase = useCareerStore((s) => s.baseResume);
  const roles = useCareerStore((s) => s.roles);
  const answerMemory = useCareerStore((s) => s.answerMemory);
  const email = useAuthStore((s) => s.email);
  const uploads = useResumeFilesStore((s) => s.files);

  const [view, setView] = useState<SessionView | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitRequested, setSubmitRequested] = useState(false);
  const [error, setError] = useState<{ message: string; applicationId?: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const lastNudge = useRef(0);
  const recorded = useRef<string | null>(null);

  // The résumé Wonder attaches: the same first choice the Apply page offers (tailored, the role's, the base, a file).
  const { ref: baseResume, role: baseRole } = useMemo(() => baseResumeFor(roles, job?.foundAs, accountBase), [roles, job?.foundAs, accountBase]);
  const resume = useMemo(() => {
    const art = app?.artifacts.find((a) => a.type === "resume");
    const v = art?.versions.find((x) => x.id === art.currentVersionId);
    return resumeOptionsFor({ jobId, hasTailored: !!v, saved: savedResumes, uploads, base: baseResume, baseRoleTitle: baseRole?.title })[0];
  }, [app, jobId, savedResumes, uploads, baseResume, baseRole]);

  // A background fill already under way for this job (the page reopened): pick it up.
  useEffect(() => {
    let off = false;
    jobsApplyApi
      .list()
      .then(async (r) => {
        const latest = r.sessions.filter((s) => s.jobId === jobId && s.status !== "CANCELLED").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        if (!latest || off || !(latest.cloud?.headless || latest.status === "SUBMITTED" || latest.status === "TRACKED")) return;
        const v = await jobsApplyApi.get(latest.id);
        if (!off) setView(v);
      })
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [jobId]);

  const s = view?.session;
  const id = s?.id;
  const live = !!s && !TERMINAL.has(s.status) && s.status !== "SUBMITTED";

  // Reopen the background browser if it closed (idle, or the worker restarted). Answers already given are kept.
  const reopen = useCallback(async (sid: string) => {
    try {
      await jobsApplyApi.cloud.start(sid, { headless: true });
      lastNudge.current = 0;
      return true;
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : "Couldn't reach the application right now." });
      return false;
    }
  }, []);

  const nudge = useCallback(
    async (sid: string) => {
      lastNudge.current = Date.now();
      try {
        await jobsApplyApi.cloud.fill(sid);
      } catch (e) {
        if (e instanceof JobsApplyApiError && e.detail.code === "NO_CLOUD" && (await reopen(sid))) return;
        if (!(e instanceof JobsApplyApiError && e.status === 409)) setError({ message: e instanceof Error ? e.message : "Couldn't fill the form." });
      }
    },
    [reopen],
  );

  // Live progress, and the nudge that keeps the helper filling while there is something to fill.
  useEffect(() => {
    if (!id || !live) return;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      jobsApplyApi
        .get(id)
        .then((v) => {
          setView((cur) => (cur && cur.session.updatedAt === v.session.updatedAt ? cur : v));
          const vs = v.session;
          const cloudOpen = !!vs.cloud && !vs.cloud.endedAt;
          if (!cloudOpen && vs.cloud?.headless && !TERMINAL.has(vs.status)) void reopen(id);
          else if (cloudOpen && FILLABLE.has(vs.status) && (v.progress.fillable > 0 || submitRequested) && Date.now() - lastNudge.current > NUDGE_MS) void nudge(id);
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [id, live, nudge, reopen, submitRequested]);

  // Wonder pressed Submit and the employer confirmed it: record it in the tracker, once.
  useEffect(() => {
    if (!view || recorded.current === view.session.id || !view.session.wonderSubmittedAt || view.session.status !== "SUBMITTED") return;
    recorded.current = view.session.id;
    void recordSubmission(view, app?.id, "wonder").then((t) => t && setView(t));
  }, [view, app?.id]);

  const start = useCallback(async () => {
    if (!job || !resume) return;
    setStarting(true);
    setError(null);
    setSubmitRequested(false);
    try {
      const jobsState = useJobsStore.getState();
      if (!jobsState.saved[jobId]) jobsState.save(jobId);
      const application = app ?? useApplicationsStore.getState().create(jobId, "preparing");
      const pack = await buildPack({
        app: application,
        job,
        dna,
        accountEmail: email ?? undefined,
        memory: answerMemory,
        resume: resume.kind === "saved" && resume.saved ? { kind: "saved", saved: resume.saved } : resume.kind === "upload" && resume.upload ? { kind: "upload", file: resume.upload } : { kind: "tailored" },
        includeCover: !!application.artifacts.some((a) => a.type === "cover_letter" && a.versions.length),
      });
      let v = await jobsApplyApi.create({
        // "Never" for this application always wins; nothing here turns submission on.
        ...(application.autoSubmit === "off" ? { submit: "off" as const } : {}),
        job: { id: job.id, title: job.title, company: job.company, applyUrl: job.applyUrl, companyDomain: job.companyDomain, onEmployerSite: job.onEmployerSite, lake: job.lake },
        pack,
        mode: "assisted",
      });
      if (v.session.status === "READY") v = await jobsApplyApi.act(v.session.id, "start");
      if (!v.resumed) {
        recordHandoff(v, application.id, job.company, "assisted");
        useApplicationsStore.getState().addEvent(application.id, { type: "note", title: HANDOFF_TITLES.helper, detail: `On ${v.session.destination.domain}, filled by Wonder in the background.` });
      }
      setView(v);
      await jobsApplyApi.cloud.start(v.session.id, { headless: true });
      lastNudge.current = 0;
      track("jobsapply_started", { sessionId: v.session.id, mode: "background", provider: v.session.destination.provider ?? "generic" });
    } catch (e) {
      if (e instanceof JobsApplyApiError && e.detail.code === "DUPLICATE_APPLICATION") setError({ message: "You've already applied for this job.", applicationId: e.detail.duplicate?.applicationId || undefined });
      else setError({ message: e instanceof Error ? e.message : "Couldn't start the application." });
    } finally {
      setStarting(false);
    }
  }, [job, resume, jobId, app, dna, email, answerMemory]);

  const resolve = useCallback(
    async (item: InterventionItem, body: ResolveBody) => {
      if (!id) return;
      setBusyId(item.id);
      try {
        setView(await jobsApplyApi.resolve(id, item.id, body));
        // Fill what the candidate just answered.
        await nudge(id);
      } catch (e) {
        setError({ message: e instanceof Error ? e.message : "Couldn't save that answer." });
      } finally {
        setBusyId(null);
      }
    },
    [id, nudge],
  );

  /** The candidate's press: this application's "Submit for me" goes on, and the helper submits the complete page once. */
  const submit = useCallback(async () => {
    if (!id || !app) return;
    if (app.autoSubmit === "off") return setError({ message: "You chose Never for this application — submit it on the employer's page instead." });
    setSubmitRequested(true);
    setError(null);
    try {
      useApplicationsStore.getState().setAutoSubmit(app.id, "on");
      setView(await jobsApplyApi.setSubmit(id, "on"));
      await nudge(id);
      track("jobsapply_background_submit", { sessionId: id });
    } catch (e) {
      setSubmitRequested(false);
      setError({ message: e instanceof Error ? e.message : "Couldn't submit right now." });
    }
  }, [id, app, nudge]);

  const cancel = useCallback(async () => {
    if (!id) return;
    await jobsApplyApi.cloud.end(id).catch(() => undefined);
    setView(await jobsApplyApi.act(id, "cancel").catch(() => null));
    setSubmitRequested(false);
  }, [id]);

  const phase: BackgroundPhase = useMemo(() => {
    if (starting) return "starting";
    if (!s) return error ? "error" : "idle";
    if (s.status === "SUBMITTED" || s.status === "TRACKED") return "submitted";
    if (s.status === "CANCELLED") return error ? "error" : "idle";
    if (s.status === "SUBMITTING" || (submitRequested && !s.wonderSubmittedAt)) return "submitting";
    if (TERMINAL.has(s.status)) return "error";
    // The page opened but holds no application form (a job listing): waiting longer won't change that.
    if (BLOCKED.has(s.status) || s.stopped || s.failure === "FORM_NOT_FOUND") return "blocked";
    if (view?.decisions?.fill === "skip") return "blocked";
    if (pickOnPortal(s).length) return "blocked";
    if (s.interventions.some((i) => i.status === "open" && i.required)) return "needs_you";
    if (s.finalStep && s.finalStep.waiting === 0 && (view?.progress.fillable ?? 0) === 0 && FILLABLE.has(s.status)) return "ready";
    return error ? "error" : "filling";
  }, [starting, s, error, submitRequested, view]);

  return { job, app, resume, view, phase, error, busyId, start, resolve, submit, cancel };
}
