"use client";
import { useState } from "react";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { Field, Input } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { resolveCapability } from "@/domain/automation/policy";
import { useAutomationStore } from "@/store/automation";
import { useCareerStore } from "@/store/career";
import { call } from "@/wonderworks/api";
import { needsConfirm, seatsLabel, whenLabel, type EventListing, type RsvpStatus } from "../domain";
import { useEventsStore } from "../store";

/** Whether the person holds a seat or a waitlist place for this event (their own record; My events brings it up to date). */
export const isLive = (s: { responses: Record<string, { stage: string; status?: string }> }, id: string) => ["going", "waitlist"].includes(s.responses[id]?.status ?? "");

/**
 * RSVP, on an event's WonderWorks page: a seat while there is one, otherwise a place on the waitlist. Their press acts at
 * once when "RSVP to events in one tap" is Automatic, after a look when it's Ask me, never when it's Off
 * (resolveCapability; the server checks it again and fails closed). Joining a waitlist also needs "Take a seat
 * automatically from a waitlist" (events.promote): without it they are not put on one. Free events only.
 */
export function Rsvp({ listing: l, start = false }: { listing: EventListing; start?: boolean }) {
  const live = useEventsStore((s) => isLive(s, l.id));
  const policy = useAutomationStore((s) => s.policy);
  const level = useAutomationStore((s) => s.defaultLevel);
  const dnaName = useCareerStore((s) => s.dna.name);
  const [open, setOpen] = useState(start && !live);
  const [name, setName] = useState(dnaName);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const decision = resolveCapability("events.rsvp", policy, level);
  const promote = resolveCapability("events.promote", policy, level);
  const full = l.terms.capacity !== undefined && !l.seatsLeft;

  if (live)
    return (
      <Button full variant="outline" icon={<CalendarCheck className="size-4" aria-hidden />} href="/app/m/events/pipeline">
        {useEventsStore.getState().responses[l.id]?.status === "waitlist" ? "On the waitlist · My events" : "You're going · My events"}
      </Button>
    );
  if (decision === "skip")
    return (
      <p className="text-[13px] text-ink-3">
        RSVPs are off. Turn them on in <Link href="/app/m/events/you/profile#settings" className="font-medium text-brand-600 hover:underline">You</Link>.
      </p>
    );
  if (full && promote === "skip")
    return (
      <p className="text-[13px] text-ink-3">
        This event is full. To join its waitlist, turn on automatic seats in <Link href="/app/m/events/you/profile#settings" className="font-medium text-brand-600 hover:underline">You</Link>.
      </p>
    );

  // A press needs a look first when either setting asks (the waitlist's consent matters only when it's full).
  const needsLook = decision === "ask" || (full && promote === "ask");
  const send = async (confirmed: boolean) => {
    if (!name.trim()) return toast.error("Add your name", "The organiser sees it with your RSVP.");
    if (needsLook && !confirmed) return setReview(true);
    setBusy(true);
    try {
      const out = await call<{ status: Exclude<RsvpStatus, "attended" | "no_show" | "cancelled">; place?: number }>("/api/m/events/rsvps", { body: { listingId: l.postingId, name: name.trim(), confirmed } });
      useEventsStore.getState().setResponse(l.id, out.status, { status: out.status, item: l });
      toast.success(out.status === "going" ? "You're going" : `You're on the waitlist${out.place ? ` · place ${out.place}` : ""}`, out.status === "going" ? "It's in My events and your calendar." : "If a seat opens you'll get it, and we'll tell you.");
      setOpen(false);
      setReview(false);
    } catch (e) {
      // The server's copy of a setting says Ask me: show what happens, then RSVP.
      if (needsConfirm(e) && !confirmed) setReview(true);
      else toast.error("Couldn't RSVP", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button full icon={<CalendarCheck className="size-4" aria-hidden />} onClick={() => setOpen(true)}>
        {full ? "Join the waitlist" : "RSVP"}
      </Button>
      <p className="text-center text-[12px] text-ink-3">Free. {seatsLabel(l)}.</p>
      {open && (
        <Modal
          open
          onClose={() => (setOpen(false), setReview(false))}
          title={review ? (full ? "Join the waitlist?" : "RSVP to this event?") : full ? "Join the waitlist" : "RSVP"}
          footer={
            <Button full loading={busy} onClick={() => void send(review)}>
              {review ? (full ? "Join the waitlist" : "RSVP") : full ? "Join the waitlist" : "RSVP"}
            </Button>
          }
        >
          {review ? (
            <dl className="space-y-2 text-[14px]">
              {[["Event", l.title], ["When", `${whenLabel(l.terms.startsAt)} (IST)`], ["Your name", name]].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[12px] text-ink-4">{k}</dt>
                  <dd className="text-ink">{v}</dd>
                </div>
              ))}
              <p className="pt-1 text-[12px] text-ink-3">
                {full ? "It's full. If a seat opens, you're given it automatically, oldest first, and told. " : ""}Your name and email go to {l.company}. You can cancel until it starts.
              </p>
            </dl>
          ) : (
            <div className="space-y-3">
              <p className="text-[14px] text-ink-2">
                {l.title} · {whenLabel(l.terms.startsAt)} (IST)
              </p>
              {full && <p className="text-[13px] text-ink-3">It&apos;s full. Join the waitlist and you&apos;re given a seat automatically if one opens, oldest first.</p>}
              <Field label="Your name" htmlFor="ev-name" required>
                <Input id="ev-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
