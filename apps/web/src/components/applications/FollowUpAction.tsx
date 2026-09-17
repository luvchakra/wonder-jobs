"use client";
import { useMemo, useState } from "react";
import { Mail, RefreshCw, Send, ShieldCheck } from "lucide-react";
import type { Application } from "@/domain/applications/types";
import type { CanonicalJob } from "@/domain/jobs/types";
import { CAPABILITY_META } from "@/domain/automation/policy";
import { useActionsStore } from "@/store/actions";
import { useAutomationStore } from "@/store/automation";
import { useApplicationsStore } from "@/store/applications";
import { useCareerStore } from "@/store/career";
import { useAIStore } from "@/store/ai";
import { TemplateAIService, WonderJobsAIProvider, FallbackProvider } from "@/services/ai/service";
import { RemoteBYOKProvider } from "@/services/ai/client";
import { hashKey } from "@/lib/ids";
import { formatDate, formatTime } from "@/lib/format";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { Textarea, Segmented } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";
import Link from "next/link";

/**
 * Application-level external action: draft → review → explicit confirm → execute once.
 * Governed by the `send_email` automation policy; never sends because a button exists.
 */
export function FollowUpAction({ application, job }: { application: Application; job?: CanonicalJob }) {
  const policy = useAutomationStore((s) => s.policy.send_email);
  const actions = useActionsStore((s) => s.actions);
  const createAction = useActionsStore((s) => s.create);
  const updateAction = useActionsStore((s) => s.update);
  const addEvent = useApplicationsStore((s) => s.addEvent);
  const completeFollowUp = useApplicationsStore((s) => s.completeFollowUp);
  const dna = useCareerStore((s) => s.dna);
  const aiConfig = useAIStore((s) => s.config);
  const recordUsage = useAIStore((s) => s.recordUsage);
  const [kind, setKind] = useState<"follow_up" | "thank_you">(application.followUps.some((f) => f.kind === "thank_you" && !f.done) ? "thank_you" : "follow_up");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = useMemo(() => Object.values(actions).filter((a) => a.applicationId === application.id && a.type === "send_email").sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [actions, application.id]);
  const pendingFollowUp = application.followUps.find((f) => !f.done && (f.kind === kind || (kind === "follow_up" && f.kind === "follow_up")));
  const idempotencyKey = `email:${application.id}:${kind}:${pendingFollowUp?.id ?? hashKey(draft)}`;
  const alreadySent = mine.find((a) => a.idempotencyKey === idempotencyKey && a.status === "succeeded");

  const ai = () => {
    const p = aiConfig.activeProvider;
    if (p === "wonderjobs") return new TemplateAIService(new WonderJobsAIProvider(), recordUsage, null);
    const cost = { anthropic: { input: 5, output: 25 }, openai: { input: 2.5, output: 10 }, gemini: { input: 1.25, output: 10 } } as const;
    return new TemplateAIService(new FallbackProvider(new RemoteBYOKProvider(p, aiConfig.activeModel), new WonderJobsAIProvider(), () => aiConfig.allowPlatformFallback), recordUsage, cost[p]);
  };

  const generate = async () => {
    if (!job) return;
    setBusy("draft");
    setError(null);
    try {
      setDraft(await ai().generateFollowUpEmail({ job, dna, appliedAt: application.appliedAt, kind }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not draft the email.");
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    setConfirm(false);
    setBusy("send");
    const action = createAction({ type: "send_email", applicationId: application.id, idempotencyKey, label: `${kind === "thank_you" ? "Thank-you" : "Follow-up"} email to ${job?.company ?? "employer"}`, content: draft });
    updateAction(action.id, { status: "confirmed" }, { event: "confirmed", detail: "Confirmed by you" });
    updateAction(action.id, { status: "executing", attempts: 1 }, { event: "executing", detail: "attempt 1" });
    try {
      // Mock delivery. A real mail provider plugs in here; the ledger semantics stay the same.
      await new Promise((r) => setTimeout(r, 700));
      updateAction(action.id, { status: "succeeded", executedAt: new Date().toISOString() }, { event: "succeeded" });
      addEvent(application.id, { type: "follow_up", title: kind === "thank_you" ? "Thank-you note sent" : "Follow-up sent", detail: "Sent with your approval" });
      if (pendingFollowUp) completeFollowUp(application.id, pendingFollowUp.id);
      toast.success("Sent", "Recorded on the application timeline.");
      setDraft("");
    } catch (e) {
      updateAction(action.id, { status: "failed", error: e instanceof Error ? e.message : "Send failed" }, { event: "failed", detail: e instanceof Error ? e.message : undefined });
      toast.error("Couldn't send", "You can retry from the history below.");
    } finally {
      setBusy(null);
    }
  };

  const retry = async (id: string) => {
    const a = actions[id];
    if (!a) return;
    updateAction(id, { status: "executing", attempts: a.attempts + 1, error: undefined }, { event: "executing", detail: `attempt ${a.attempts + 1}` });
    await new Promise((r) => setTimeout(r, 700));
    updateAction(id, { status: "succeeded", executedAt: new Date().toISOString() }, { event: "succeeded" });
    addEvent(application.id, { type: "follow_up", title: "Follow-up sent", detail: "Sent after retry" });
  };

  const meta = CAPABILITY_META.send_email;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Reach out</h2>
        <Badge tone={policy === "off" ? "neutral" : policy === "automatic" ? "warning" : "info"}>{policy === "off" ? "Off" : policy === "automatic" ? "Allowed" : "Ask me"}</Badge>
      </div>
      {policy === "off" ? (
        <p className="text-[13px] text-ink-3">
          Sending email is turned off in{" "}
          <Link href="/app/automation/settings" className="font-medium text-brand-600 hover:underline">
            Automation Settings
          </Link>
          . Turn it on to let Wonder draft and send with your approval.
        </p>
      ) : (
        <>
          <Segmented<"follow_up" | "thank_you"> label="Email type" size="sm" value={kind} onChange={setKind} options={[{ value: "follow_up", label: "Follow up" }, { value: "thank_you", label: "Thank you" }]} className="mb-3" />
          {alreadySent ? (
            <p className="rounded-[12px] bg-success-100 px-3 py-2 text-[13px] text-success-600">Already sent {alreadySent.executedAt ? `${formatDate(alreadySent.executedAt)} ${formatTime(alreadySent.executedAt)}` : ""}. Wonder won&apos;t send the same message twice.</p>
          ) : (
            <>
              {draft ? <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-40 text-[13px]" aria-label="Email draft" /> : <p className="text-[13px] text-ink-3">Wonder can draft a {kind === "thank_you" ? "thank-you note" : "follow-up"} for {job?.company ?? "the employer"}. You review it, then decide.</p>}
              {error && (
                <p role="alert" className="mt-2 text-[13px] text-danger-600">
                  {error}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" icon={draft ? <RefreshCw className="size-3.5" aria-hidden /> : <Mail className="size-3.5" aria-hidden />} onClick={generate} loading={busy === "draft"} disabled={!!busy || !job}>
                  {draft ? "Regenerate" : "Draft with Wonder"}
                </Button>
                <Button size="sm" icon={<Send className="size-3.5" aria-hidden />} onClick={() => setConfirm(true)} disabled={!draft.trim() || !!busy} loading={busy === "send"}>
                  Send…
                </Button>
              </div>
            </>
          )}
          <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-ink-4">
            <ShieldCheck className="size-3" aria-hidden /> {meta.description} Every send is confirmed by you and recorded.
          </p>
        </>
      )}
      {mine.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[12px] font-medium text-ink-3">Execution history ({mine.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {mine.map((a) => (
              <li key={a.id} className="rounded-[12px] border border-line p-2.5 text-[12px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-ink">{a.label}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone={a.status === "succeeded" ? "success" : a.status === "failed" ? "danger" : "neutral"}>{a.status}</Badge>
                    {a.status === "failed" && (
                      <Button size="sm" variant="ghost" onClick={() => retry(a.id)}>
                        Retry
                      </Button>
                    )}
                  </span>
                </div>
                <ul className="mt-1 text-ink-3">
                  {a.history.map((h, i) => (
                    <li key={i}>
                      {formatDate(h.at)} {formatTime(h.at)} — {h.event}
                      {h.detail ? ` · ${h.detail}` : ""}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      )}
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Send this ${kind === "thank_you" ? "thank-you note" : "follow-up"}?`}
        description={`It will be sent to ${job?.company ?? "the employer"} on your behalf and recorded on the timeline. This can't be unsent.`}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Not yet
            </Button>
            <Button icon={<Send className="size-4" aria-hidden />} onClick={send}>
              Send now
            </Button>
          </>
        }
      >
        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-[12px] bg-surface-2 p-3 font-sans text-[13px] text-ink-2">{draft}</pre>
      </Modal>
    </div>
  );
}
