"use client";
import { useState } from "react";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";
import { resolveCapability } from "@/domain/automation/policy";
import { useAutomationStore } from "@/store/automation";
import { call } from "@/wonderworks/api";
import { BOOKING_LABEL, slotLabel, TEACHER_MAY, type DemoBooking } from "../domain";

/**
 * The demo-class times on one application, as the teacher sees them: the times the school offered, each with Request —
 * their own press, sent at once when "Request demo classes in one tap" is Automatic, after a look when it's Ask me,
 * never when it's Off (resolveCapability; the server checks it again and fails closed) — and a requested or confirmed
 * one with Cancel. Times show in the teacher's own time zone.
 */
export function DemoTimes({ bookings, school, onChange }: { bookings: DemoBooking[]; school: string; onChange: () => void }) {
  const policy = useAutomationStore((s) => s.policy);
  const level = useAutomationStore((s) => s.defaultLevel);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<DemoBooking | null>(null);
  const live = bookings.some((b) => b.status === "requested" || b.status === "confirmed");
  const shown = bookings.filter((b) => b.status !== "cancelled" || !live);

  const act = async (b: DemoBooking, action: "request" | "cancel", confirmed = false) => {
    setBusy(b.id);
    try {
      await call(`/api/m/teaching/bookings/${encodeURIComponent(b.id)}`, { body: { action, confirmed } });
      toast.success(action === "request" ? "Demo class requested" : "Cancelled", action === "request" ? `${school} confirms or declines it; you hear the moment they do.` : `${school} sees it as cancelled.`);
      setConfirm(null);
      onChange();
    } catch (e) {
      toast.error("Couldn't do that", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const request = (b: DemoBooking) => {
    const decision = resolveCapability("teaching.book_demo", policy, level);
    if (decision === "skip") return toast.info("Demo-class requests are off", "Turn them on in Teaching → You.");
    if (decision === "ask") return setConfirm(b);
    void act(b, "request");
  };

  if (!shown.length) return null;
  return (
    <>
      <ul className="flex flex-col gap-2">
        {shown.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] border border-line px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium text-ink">{slotLabel(b)}</p>
              {(b.location || b.note) && <p className="truncate text-[12px] text-ink-3">{[b.location, b.note].filter(Boolean).join(" · ")}</p>}
            </div>
            {b.status === "proposed" && !live ? (
              <Button size="sm" loading={busy === b.id} onClick={() => request(b)}>
                Request
              </Button>
            ) : (
              <Badge tone={b.status === "confirmed" || b.status === "held" ? "success" : b.status === "requested" ? "brand" : "neutral"}>{BOOKING_LABEL[b.status]}</Badge>
            )}
            {TEACHER_MAY[b.status].includes("cancel") && (
              <Button size="sm" variant="ghost" loading={busy === b.id} onClick={() => void act(b, "cancel")} aria-label={`Cancel the demo class on ${slotLabel(b)}`}>
                Cancel
              </Button>
            )}
          </li>
        ))}
      </ul>
      {confirm && (
        <Modal open onClose={() => setConfirm(null)} title="Request this demo class?" description={`${school} gets your request for ${slotLabel(confirm)}, then confirms or declines it.`} footer={<Button full loading={busy === confirm.id} onClick={() => void act(confirm, "request", true)}>Request</Button>}>
          <p className="text-[13px] text-ink-3">You can cancel it until it starts.</p>
        </Modal>
      )}
    </>
  );
}
