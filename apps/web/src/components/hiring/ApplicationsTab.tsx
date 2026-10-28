"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { APPLICATION_STATUS_LABEL, NEXT_STATUSES, type ApplicationEvent, type ApplicationStatus } from "@/domain/org/careers";
import { RECOMMENDATION_LABEL, RECOMMENDATIONS, type ApplicationReview, type Recommendation } from "@/domain/org/review";
import { hiringApi, type ApplicationView } from "@/services/hiring/client";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Field, Input, Select, Textarea } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { Tabs } from "@/components/common/Tabs";
import { toast } from "@/components/feedback/Toast";

const TONE: Record<ApplicationStatus, "neutral" | "brand" | "success" | "warning"> = { new: "brand", reviewing: "neutral", interview: "success", offer: "success", hired: "success", rejected: "warning", withdrawn: "warning" };
const ACTION_LABEL: Partial<Record<ApplicationStatus, string>> = { reviewing: "Start review", interview: "Invite to interview", offer: "Make an offer", hired: "Mark hired", rejected: "Decline" };
const LINK_HINT: Partial<Record<ApplicationStatus, string>> = { interview: "A scheduling page (Calendly, Google Calendar…) — the email's button opens it.", offer: "Where the offer letter is — the email's button opens it.", hired: "Onboarding details, if you have a page for them." };

type Decision = Exclude<ApplicationStatus, "new" | "withdrawn">;

/** The pipeline's stages, left to right (Greenhouse / Ashby style); declined and withdrawn share the last one. */
type Stage = "new" | "reviewing" | "interview" | "offer" | "hired" | "closed";
const STAGES: { value: Stage; label: string; has: ApplicationStatus[] }[] = [
  { value: "new", label: "New", has: ["new"] },
  { value: "reviewing", label: "Reviewing", has: ["reviewing"] },
  { value: "interview", label: "Interview", has: ["interview"] },
  { value: "offer", label: "Offer", has: ["offer"] },
  { value: "hired", label: "Hired", has: ["hired"] },
  { value: "closed", label: "Declined", has: ["rejected", "withdrawn"] },
];
const stageOf = (s: ApplicationStatus): Stage => STAGES.find((x) => x.has.includes(s))!.value;
const fitShare = (a: ApplicationView) => (a.fit ? a.fit.matched.length / Math.max(1, a.fit.matched.length + a.fit.missing.length) : -1);
/** Within a stage: those who meet every must-have first, then the best skill fit, then the newest. */
const byPromise = (x: ApplicationView, y: ApplicationView) => Number(x.unmet.length > 0) - Number(y.unmet.length > 0) || fitShare(y) - fitShare(x) || y.createdAt.localeCompare(x.createdAt);

/** The applicant's line under their name: skills fit, the team's leaning, and must-haves not met — only what's known. */
function signals(a: ApplicationView) {
  const out: { text: string; warn?: boolean }[] = [];
  if (a.fit) out.push({ text: `${a.fit.matched.length} of ${a.fit.matched.length + a.fit.missing.length} skills` });
  if (a.reviews.total) out.push({ text: `Team: ${a.reviews.leaning === "split" ? "split" : a.reviews.leaning === "yes" ? "yes" : "no"} (${a.reviews.total})` });
  if (a.unmet.length) out.push({ text: `Doesn't meet ${a.unmet.length} must-have${a.unmet.length === 1 ? "" : "s"}`, warn: true });
  return out;
}

/**
 * Applications to the workspace's jobs — from career sites and WonderJobs Easy Apply — as a pipeline (owner,
 * 2026-10-28): stages as tabs with counts, one job or all, the most promising first in each stage (must-haves met,
 * then skills fit). Each one opens its details, answers and the team's scorecards; a hiring manager or owner moves it
 * on, and WonderJobs emails the applicant a message written for that step. The server checks the role again.
 */
export function ApplicationsTab({ orgId, canDecide, openId, jobId, onJob }: { orgId: string; canDecide: boolean; openId: string | null; jobId?: string | null; onJob?: (jobId: string | null) => void }) {
  const [list, setList] = useState<ApplicationView[] | null>(null);
  const [open, setOpen] = useState<string | null>(openId);
  const [stage, setStage] = useState<Stage | null>(null);
  const load = useCallback(() => {
    hiringApi
      .applications(orgId)
      .then((d) => setList(d.applications))
      .catch((e: Error) => toast.error("Couldn't load applications", e.message));
  }, [orgId]);
  useEffect(load, [load]);

  const jobs = useMemo(() => [...new Map((list ?? []).map((a) => [a.jobId, a.jobTitle])).entries()], [list]);
  const forJob = useMemo(() => (list ?? []).filter((a) => !jobId || a.jobId === jobId), [list, jobId]);
  const counts = useMemo(() => Object.fromEntries(STAGES.map((s) => [s.value, forJob.filter((a) => s.has.includes(a.status)).length])) as Record<Stage, number>, [forJob]);
  // Opens on the first stage with someone waiting in it, else New.
  const shownStage: Stage = stage ?? STAGES.find((s) => s.value !== "closed" && counts[s.value] > 0)?.value ?? "new";
  const shown = useMemo(() => forJob.filter((a) => stageOf(a.status) === shownStage).sort(byPromise), [forJob, shownStage]);

  if (list === null) return <p className="text-[13px] text-ink-3">Loading…</p>;
  const current = list.find((a) => a.id === open);
  return (
    <div>
      {jobs.length > 1 && onJob && (
        <Select aria-label="Job" value={jobId ?? ""} onChange={(e) => onJob(e.target.value || null)} className="mb-3 h-10 w-full sm:w-auto">
          <option value="">All jobs ({list.filter((a) => a.status !== "withdrawn").length})</option>
          {jobs.map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </Select>
      )}
      <Tabs value={shownStage} onChange={setStage} items={STAGES.map((s) => ({ value: s.value, label: s.label, count: counts[s.value] }))} label="Applications by stage" className="mb-3" />
      {shown.length === 0 ? (
        <p className="rounded-[16px] border border-line bg-surface p-4 text-[14px] text-ink-3">{list.length ? `No one in ${STAGES.find((s) => s.value === shownStage)!.label}.` : "No applications yet. Open a job: job seekers apply with Easy Apply, and career sites send theirs here too."}</p>
      ) : (
        <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
          {shown.map((a) => (
            <li key={a.id} className="border-b border-line last:border-b-0">
              <button type="button" onClick={() => setOpen(a.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-surface-2">
                <span className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                  <span className="block truncate text-[15px] font-semibold text-ink">{a.name}</span>
                  <span className="block truncate text-[12px] text-ink-3">{[!jobId && a.jobTitle, a.siteName ? `via ${a.siteName}` : a.via === "wonderjobs" && "Easy Apply", `applied ${relativeTime(a.createdAt)}`].filter(Boolean).join(" · ")}</span>
                  {signals(a).length > 0 && (
                    <span className="block truncate text-[12px] text-ink-2">
                      {signals(a).map((x, i) => (
                        <span key={x.text} className={cn(x.warn && "font-medium text-warning-600")}>
                          {i > 0 && " · "}
                          {x.text}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                {shownStage === "closed" && <Badge tone={TONE[a.status]}>{APPLICATION_STATUS_LABEL[a.status]}</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {current && <ApplicationDetail orgId={orgId} a={current} canDecide={canDecide} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

function ApplicationDetail({ orgId, a, canDecide, onClose, onChanged }: { orgId: string; a: ApplicationView; canDecide: boolean; onClose: () => void; onChanged: () => void }) {
  const [step, setStep] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<ApplicationEvent[] | null>(null);
  useEffect(() => {
    hiringApi
      .applicationHistory(orgId, a.id)
      .then((d) => setEvents(d.events))
      .catch(() => setEvents([]));
  }, [orgId, a.id, a.status]);

  const send = async () => {
    if (!step) return;
    setBusy(true);
    setError(null);
    try {
      const r = await hiringApi.decide(orgId, a.id, step, note, link);
      // The email is a real send; say what happened, not what was hoped.
      if (r.emailed) toast.success(`${APPLICATION_STATUS_LABEL[r.status]} — ${a.name} has been emailed`);
      else toast.error(`${APPLICATION_STATUS_LABEL[r.status]} saved, but the email to ${a.name} wasn't sent`, "Email isn't set up on this deployment, or it failed. Reach them at " + a.email);
      setStep(null);
      setNote("");
      setLink("");
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const next = (NEXT_STATUSES[a.status] as Decision[]).filter((s) => s in ACTION_LABEL);
  const row = (label: string, value?: string, href?: string) =>
    value ? (
      <div className="flex gap-3 py-1 text-[13px]">
        <span className="w-28 shrink-0 text-ink-3">{label}</span>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all text-brand-600 hover:underline">
            {value}
          </a>
        ) : (
          <span className="min-w-0 break-words text-ink">{value}</span>
        )}
      </div>
    ) : null;
  const httpsOnly = (u?: string) => (u && /^https:\/\//i.test(u) ? u : undefined);

  return (
    <Modal
      open
      onClose={onClose}
      title={a.name}
      size="lg"
      footer={
        step ? (
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            {error && (
              <p role="alert" className="mr-auto basis-full text-[13px] text-danger-600 sm:basis-auto">
                {error}
              </p>
            )}
            <Button variant="ghost" onClick={() => setStep(null)}>
              Back
            </Button>
            <Button onClick={send} loading={busy} variant={step === "rejected" ? "danger" : "primary"}>
              {ACTION_LABEL[step]} and email {a.name.split(" ")[0]}
            </Button>
          </div>
        ) : canDecide && next.length ? (
          <div className="flex w-full flex-wrap justify-end gap-2">
            {next.map((s) => (
              <Button key={s} variant={s === "rejected" ? "ghost" : "outline"} onClick={() => setStep(s)}>
                {ACTION_LABEL[s]}
              </Button>
            ))}
          </div>
        ) : undefined
      }
    >
      {step ? (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-ink-2">
            {a.name} gets an email for this step, written for you, from WonderJobs on behalf of your company. Replies come to you. Add a note to make it personal.
          </p>
          <Field label="Note to the applicant (optional)" htmlFor="ap-note">
            <Textarea id="ap-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
          </Field>
          {LINK_HINT[step] && (
            <Field label="Next-step link (optional)" htmlFor="ap-link" hint={LINK_HINT[step]}>
              <Input id="ap-link" value={link} onChange={(e) => setLink(e.target.value)} maxLength={500} placeholder="https://" />
            </Field>
          )}
        </div>
      ) : (
        <div>
          <p className="mb-2 flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
            <Badge tone={TONE[a.status]}>{APPLICATION_STATUS_LABEL[a.status]}</Badge> {a.jobTitle} · applied {relativeTime(a.createdAt)}
            {a.siteName ? ` via ${a.siteName}` : a.via === "wonderjobs" ? " via WonderJobs Easy Apply" : ""}
          </p>
          {row("Email", a.email, `mailto:${a.email}`)}
          {row("Phone", a.phone)}
          {row("Location", a.location)}
          {a.via === "wonderjobs" ? row("Résumé", "Download", `/api/hiring/${encodeURIComponent(orgId)}/applications/${encodeURIComponent(a.id)}/resume`) : row("Résumé", a.resumeUrl, httpsOnly(a.resumeUrl))}
          {row("LinkedIn", a.linkedinUrl, httpsOnly(a.linkedinUrl))}
          {a.coverNote && <p className="mt-2 whitespace-pre-wrap rounded-[10px] bg-surface-2 px-3 py-2 text-[13px] text-ink-2">{a.coverNote}</p>}
          {a.answers && a.questions.length > 0 && (
            <section aria-label="Screening answers" className="mt-3">
              <h3 className="text-[13px] font-semibold text-ink">Screening answers</h3>
              <dl className="mt-1 flex flex-col gap-1.5">
                {a.questions.map((q) => {
                  const unmet = a.unmet.includes(q.prompt);
                  const ans = a.answers?.[q.id];
                  return (
                    <div key={q.id} className="text-[13px]">
                      <dt className="text-ink-3">{q.prompt}</dt>
                      <dd className={cn("text-ink", unmet && "font-medium text-warning-600")}>
                        {ans ? (ans === "yes" ? "Yes" : ans === "no" ? "No" : ans) : "Not answered"}
                        {unmet && " — doesn't meet the must-have"}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          )}
          {a.fit && (
            <section aria-label="Skills" className="mt-3">
              <h3 className="text-[13px] font-semibold text-ink">
                Skills · {a.fit.matched.length} of {a.fit.matched.length + a.fit.missing.length} the job lists
              </h3>
              <p className="mt-1 text-[12px] text-ink-3">From the Career Profile they shared{a.profile?.yearsExperience != null ? ` · ${a.profile.yearsExperience} years' experience` : ""}{a.profile?.headline ? ` · ${a.profile.headline}` : ""}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {a.fit.matched.map((s) => (
                  <Badge key={s} tone="success">
                    {s}
                  </Badge>
                ))}
                {a.fit.missing.map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
            </section>
          )}
          <Scorecards orgId={orgId} applicationId={a.id} onChanged={onChanged} />

          {!canDecide && <p className="mt-3 text-[12px] text-ink-3">Hiring managers and owners decide on applications.</p>}
          <details className="mt-3 text-[12px] text-ink-3">
            <summary className="min-h-10 cursor-pointer py-2 font-medium text-ink-2">History</summary>
            {events === null ? (
              <p>Loading…</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {events.map((e, i) => (
                  <li key={i}>
                    {new Date(e.at).toLocaleString()} · {e.event.replace("status:", "moved to ").replace("email:applicant_failed", "email to applicant not sent").replace("email:applicant", "emailed applicant").replace("email:team", "emailed hiring team")}
                    {e.detail ? ` — ${e.detail}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </details>
        </div>
      )}
    </Modal>
  );
}

const REC_TONE: Record<Recommendation, string> = { strong_no: "text-danger-600", no: "text-warning-600", yes: "text-success-600", strong_yes: "text-success-600" };

/**
 * The hiring team's scorecards on one application: each person's recommendation (Strong no … Strong yes) and notes,
 * newest last, and a form to add one. The team's own — never shown or sent to the applicant.
 */
function Scorecards({ orgId, applicationId, onChanged }: { orgId: string; applicationId: string; onChanged: () => void }) {
  const [list, setList] = useState<ApplicationReview[] | null>(null);
  const [rec, setRec] = useState<Recommendation | undefined>();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    hiringApi
      .reviews(orgId, applicationId)
      .then((d) => setList(d.reviews))
      .catch(() => setList([]));
  }, [orgId, applicationId]);
  useEffect(load, [load]);
  const save = async () => {
    setBusy(true);
    try {
      await hiringApi.addReview(orgId, applicationId, rec, note.trim());
      setRec(undefined);
      setNote("");
      load();
      onChanged();
    } catch (e) {
      toast.error("Couldn't save it", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Team scorecards" className="mt-4 rounded-[14px] border border-line p-3">
      <h3 className="text-[13px] font-semibold text-ink">Team scorecards</h3>
      <p className="text-[12px] text-ink-3">Only your team sees these.</p>
      {list && list.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {list.map((r) => (
            <li key={r.id} className="text-[13px]">
              <span className="font-medium text-ink">{r.authorName}</span>
              {r.recommendation && <span className={cn("font-medium", REC_TONE[r.recommendation])}> · {RECOMMENDATION_LABEL[r.recommendation]}</span>}
              <span className="text-ink-4"> · {relativeTime(r.createdAt)}</span>
              {r.note && <p className="whitespace-pre-wrap text-ink-2">{r.note}</p>}
            </li>
          ))}
        </ul>
      )}
      <div role="radiogroup" aria-label="Your recommendation" className="mt-3 flex flex-wrap gap-1.5">
        {RECOMMENDATIONS.map((r) => (
          <button key={r} type="button" role="radio" aria-checked={rec === r} onClick={() => setRec(rec === r ? undefined : r)} className={cn("min-h-9 rounded-full border px-3 text-[12.5px]", rec === r ? "border-brand-500 bg-brand-50 font-medium text-brand-700" : "border-line text-ink-2")}>
            {RECOMMENDATION_LABEL[r]}
          </button>
        ))}
      </div>
      <Textarea aria-label="Your note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="What stood out, what to ask next" className="mt-2" />
      <Button size="sm" className="mt-2" onClick={save} loading={busy} disabled={!rec && !note.trim()}>
        Add to scorecards
      </Button>
    </section>
  );
}
