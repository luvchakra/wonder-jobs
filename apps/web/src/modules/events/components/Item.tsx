"use client";
import { useState } from "react";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { EmptyState, ErrorState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { resolveCapability } from "@/domain/automation/policy";
import { useAutomationStore } from "@/store/automation";
import { call } from "@/wonderworks/api";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { attendeeMay, needsConfirm, STAGE_OF, STATUS_LABEL, whenLabel } from "../domain";
import { useEventsStore } from "../store";
import { lineOf, TONE, useMyRsvps } from "./Pipeline";

const BACK = { href: "/app/m/events/pipeline", label: "My events" };

/** One of the person's RSVPs: when and where, their place on the waitlist, and Cancel while the event hasn't started. */
export function EventsItem({ id }: { id: string }) {
  const { list, error, reload } = useMyRsvps();
  const policy = useAutomationStore((s) => s.policy);
  const level = useAutomationStore((s) => s.defaultLevel);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  if (error) return <ErrorState title="Couldn't load this event" body={error} actions={[{ label: "Try again", onClick: reload }]} />;
  if (!list) return <PageLoading rows={3} />;
  const r = list.find((x) => x.id === id);
  if (!r)
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader back={BACK} title="Event not found" />
        <EmptyState title="This RSVP isn't yours" body="It may have been made from another account." action={{ label: "Back to My events", href: BACK.href }} />
      </div>
    );
  const decision = resolveCapability("events.cancel", policy, level);
  const may = decision !== "skip" && attendeeMay(r.status, r.startsAt).includes("cancel");
  const cancel = async (confirmed: boolean) => {
    if (decision === "ask" && !confirmed) return setSure(true);
    setBusy(true);
    try {
      await call(`/api/m/events/rsvps/${encodeURIComponent(r.id)}`, { body: { action: "cancel", confirmed } });
      useEventsStore.getState().setResponse(`ws_${r.listingId}`, STAGE_OF.cancelled, { status: "cancelled" });
      toast.success("Cancelled", r.status === "going" ? "Your seat goes to the next person on the waitlist." : "You're off the waitlist.");
      setSure(false);
      reload();
    } catch (e) {
      if (needsConfirm(e) || /then press Cancel RSVP/.test((e as Error).message)) setSure(true);
      else toast.error("Couldn't cancel it", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const rows: [string, string][] = [
    ["When", `${whenLabel(r.startsAt)} (IST)`],
    ["Where", r.online ? "Online" : r.location || "To be confirmed"],
    ["Organiser", r.organiser],
    ...(r.status === "waitlist" && r.place ? ([["Waitlist", `Place ${r.place}. You're given a seat automatically if one opens.`]] as [string, string][]) : []),
  ];
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back={BACK} title={r.title} description={lineOf(r)} />
      <section className="wj-card space-y-3 p-4">
        <Badge tone={TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
        <dl className="space-y-2 text-[14px]">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[12px] text-ink-4">{k}</dt>
              <dd className="break-words text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        {may && (
          <Button variant="outline" full loading={busy} onClick={() => void cancel(sure)}>
            {sure ? "Yes, cancel my RSVP" : r.status === "waitlist" ? "Leave the waitlist" : "Cancel RSVP"}
          </Button>
        )}
        {sure && <p className="text-[12px] text-ink-3">{r.status === "going" ? "Your seat goes to the next person on the waitlist." : "You'll lose your place."}</p>}
      </section>
    </div>
  );
}
