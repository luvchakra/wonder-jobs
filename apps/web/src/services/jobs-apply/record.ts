/**
 * The two external moments of Apply with Wonder, recorded the same way from every page that drives one
 * (the Apply page, and Apply for this job on the job page, WJ-311): the hand-off to the employer's page,
 * ledgered once per session and audited; and the submission, written to the tracker with its evidence.
 */
import { useActionsStore } from "@/store/actions";
import { useApplicationsStore } from "@/store/applications";
import { auditAction } from "@/lib/audit";
import { track } from "@/lib/analytics";
import type { ApplyMode } from "@/domain/jobs-apply/types";
import { jobsApplyApi, type SessionView } from "./client";

const SENT = new Set(["submitted", "under_review", "interview", "offer", "rejected"]);

/** The hand-off is the external action: ledgered once per session (idempotency key) and audited (CLAUDE.md). */
export function recordHandoff(v: SessionView, applicationId: string, company: string, mode: ApplyMode): void {
  const key = `jobsapply-handoff:${v.session.id}`;
  const ledger = useActionsStore.getState();
  if (ledger.byKey(key)) return;
  const a = ledger.create({ type: "submit_application", applicationId, idempotencyKey: key, label: `Open ${company}'s application (Apply with Wonder)`, content: "" });
  ledger.update(a.id, { status: "succeeded", attempts: 1, executedAt: new Date().toISOString() }, { event: "executed", detail: `Opened ${v.session.destination.domain}; the candidate submits there` });
  auditAction({ actionId: a.id, actionType: "submit_application", event: "handoff_opened", detail: `JobsApply session ${v.session.id} · ${mode}` });
}

/**
 * The application is in: record it in the tracker (status, follow-up, audit) and close the session.
 * `by`: the candidate confirmed it, or Wonder's helper submitted it under "Submit applications" (WJ-249).
 */
export async function recordSubmission(v: SessionView, appId: string | undefined, by: "you" | "wonder"): Promise<SessionView | null> {
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

