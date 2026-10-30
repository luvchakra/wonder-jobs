"use client";
import { useState } from "react";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { EmptyState, ErrorState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { call } from "@/wonderworks/api";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { MODE_LABEL } from "../domain";
import { clientMay, DECLINE_REASONS, requestLabel, sessionLabel, STAGE_OF, STATUS_LABEL } from "../sessions";
import { useTherapistsStore } from "../store";
import { TONE, useMySessions } from "./Sessions";

const BACK = { href: "/app/m/therapists/pipeline", label: "Sessions" };

/** One of the client's sessions: what they asked for, the confirmed time and where, and Cancel while it can be. */
export function TherapistsSession({ id }: { id: string }) {
  const { list, error, reload } = useMySessions();
  const [busy, setBusy] = useState(false);
  if (error) return <ErrorState title="Couldn't load this session" body={error} actions={[{ label: "Try again", onClick: reload }]} />;
  if (!list) return <PageLoading rows={3} />;
  const r = list.find((x) => x.id === id);
  if (!r)
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader back={BACK} title="Session not found" />
        <EmptyState title="This session isn't yours" body="It may have been made from another account." action={{ label: "Back to Sessions", href: BACK.href }} />
      </div>
    );
  const s = r.deal.session;
  const cancel = async () => {
    setBusy(true);
    try {
      await call(`/api/m/therapists/sessions/${encodeURIComponent(r.id)}`, { body: { action: "cancel" } });
      useTherapistsStore.getState().setResponse(`ws_${r.listingId}`, STAGE_OF.cancelled, { status: "cancelled" });
      toast.success("Cancelled", `${r.practitioner} hears it now.`);
      reload();
    } catch (e) {
      toast.error("Couldn't cancel it", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const complete = async () => {
    setBusy(true);
    try {
      await call(`/api/m/therapists/sessions/${encodeURIComponent(r.id)}`, { body: { action: "held" } });
      useTherapistsStore.getState().setResponse(`ws_${r.listingId}`, STAGE_OF.held, { status: "held" });
      toast.success("Marked completed", "It's under Held / Closed in Sessions.");
      reload();
    } catch (e) {
      toast.error("Couldn't mark it completed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const may = clientMay(r.status, r.deal);
  const rows: [string, string][] = [
    ["You asked for", requestLabel(r.request)],
    ...(s ? ([["Confirmed", sessionLabel(s)], [s.mode === "online" ? "Meeting link" : "Where", s.where ?? (s.mode === "online" ? "They'll send it before the session" : "Ask them for the address")]] as [string, string][]) : []),
    ...(r.status === "declined" && r.deal.reason ? ([["Their reply", DECLINE_REASONS[r.deal.reason]]] as [string, string][]) : []),
    ...(r.status === "cancelled" ? ([["Cancelled by", r.deal.cancelledBy === "practitioner" ? r.practitioner : "You"]] as [string, string][]) : []),
  ];
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back={BACK} title={r.practitioner} description={r.title} />
      <section className="wj-card space-y-3 p-4">
        <Badge tone={TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
        <dl className="space-y-2 text-[14px]">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[12px] text-ink-4">{k}</dt>
              <dd className="break-words text-ink">{v.startsWith("https://") ? <a href={v} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-600 hover:underline">{v}</a> : v}</dd>
            </div>
          ))}
        </dl>
        {s && <p className="text-[12px] text-ink-3">{MODE_LABEL[s.mode]} session. You pay {r.practitioner} directly; no money moves through WonderWorks.</p>}
        {may.includes("held") && (
          <Button full loading={busy} onClick={() => void complete()}>
            Mark as completed
          </Button>
        )}
        {r.status === "confirmed" && may.includes("cancel") && <p className="text-[12px] text-ink-3">You can mark it completed once the session has started.</p>}
        {may.includes("cancel") && (
          <Button variant="outline" full loading={busy} onClick={() => void cancel()}>
            {r.status === "requested" ? "Cancel request" : "Cancel session"}
          </Button>
        )}
      </section>
    </div>
  );
}
