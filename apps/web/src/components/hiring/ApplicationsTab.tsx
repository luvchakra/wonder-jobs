"use client";
import { useCallback, useEffect, useState } from "react";
import { APPLICATION_STATUS_LABEL, NEXT_STATUSES, type ApplicationEvent, type ApplicationStatus } from "@/domain/org/careers";
import { hiringApi, type ApplicationView } from "@/services/hiring/client";
import { relativeTime } from "@/lib/format";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Field, Input, Textarea } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";

const TONE: Record<ApplicationStatus, "neutral" | "brand" | "success" | "warning"> = { new: "brand", reviewing: "neutral", interview: "success", offer: "success", hired: "success", rejected: "warning", withdrawn: "warning" };
const ACTION_LABEL: Partial<Record<ApplicationStatus, string>> = { reviewing: "Start review", interview: "Invite to interview", offer: "Make an offer", hired: "Mark hired", rejected: "Decline" };
const LINK_HINT: Partial<Record<ApplicationStatus, string>> = { interview: "A scheduling page (Calendly, Google Calendar…) — the email's button opens it.", offer: "Where the offer letter is — the email's button opens it.", hired: "Onboarding details, if you have a page for them." };

type Decision = Exclude<ApplicationStatus, "new" | "withdrawn">;

/**
 * Applications that came in through the workspace's career sites. Each one opens its details; a hiring manager
 * or owner moves it on, and WonderJobs emails the applicant a message written for that step (with the person's
 * optional note and next-step link). The server checks the role, and that the step is allowed, again.
 */
export function ApplicationsTab({ orgId, canDecide, openId }: { orgId: string; canDecide: boolean; openId: string | null }) {
  const [list, setList] = useState<ApplicationView[] | null>(null);
  const [open, setOpen] = useState<string | null>(openId);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const load = useCallback(() => {
    hiringApi
      .applications(orgId)
      .then((d) => setList(d.applications))
      .catch((e: Error) => toast.error("Couldn't load applications", e.message));
  }, [orgId]);
  useEffect(load, [load]);

  if (list === null) return <p className="text-[13px] text-ink-3">Loading…</p>;
  const isOpen = (a: ApplicationView) => ["new", "reviewing", "interview", "offer"].includes(a.status);
  const shown = filter === "open" ? list.filter(isOpen) : list;
  const current = list.find((a) => a.id === open);
  return (
    <div>
      <div className="mb-3 flex gap-2 text-[13px]">
        {(["open", "all"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={filter === f ? "rounded-full bg-ink px-3 py-1.5 font-medium text-white" : "rounded-full border border-line px-3 py-1.5 text-ink-2"}>
            {f === "open" ? `In progress (${list.filter(isOpen).length})` : `All (${list.length})`}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-[16px] border border-line bg-surface p-4 text-[14px] text-ink-3">{list.length ? "Nothing in progress." : "No applications yet. Show an open job on a career site (Jobs → Career sites) and applications arrive here."}</p>
      ) : (
        <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
          {shown.map((a) => (
            <li key={a.id} className="border-b border-line last:border-b-0">
              <button type="button" onClick={() => setOpen(a.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-surface-2">
                <span className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                  <span className="block truncate text-[15px] font-semibold text-ink">{a.name}</span>
                  <span className="block truncate text-[12px] text-ink-3">{[a.jobTitle, a.siteName ? `via ${a.siteName}` : a.via === "wonderjobs" && "via WonderJobs", `applied ${relativeTime(a.createdAt)}`].filter(Boolean).join(" · ")}</span>
                </span>
                <Badge tone={TONE[a.status]}>{APPLICATION_STATUS_LABEL[a.status]}</Badge>
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
