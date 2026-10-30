"use client";
import { useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { Chip, Field, Input } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { resolveCapability } from "@/domain/automation/policy";
import { useAutomationStore } from "@/store/automation";
import { useCareerStore } from "@/store/career";
import { call } from "@/wonderworks/api";
import { MODE_LABEL, type Mode, type TherapistListing } from "../domain";
import { addDays, cleanSessionRequest, needsConfirm, requestLabel, SLOT_LABEL, SLOTS, todayIst, type Slot } from "../sessions";
import { selectProfile, useTherapistsStore } from "../store";

type Draft = { mode: Mode | ""; date: string; slot: Slot | ""; name: string; phone: string };

/** Whether the client has a request or session open with this practitioner (their own record; Sessions brings it up to date). */
export const isOpen = (s: { responses: Record<string, { stage: string; status?: string }> }, id: string) => ["requested", "confirmed"].includes(s.responses[id]?.status ?? "");

/**
 * Request a session, on a practitioner's WonderWorks listing: how they'd meet (only the ways the practitioner offers),
 * a day and a time of day, their name, and a phone if they want a call (it reaches the practitioner only once they
 * confirm). Nothing else, and no notes: why someone is looking is theirs to say in the session. Their press sends it at
 * once when "Send session requests in one tap" is Automatic, after a look when it's Ask me (the default), never when
 * it's Off (resolveCapability; the server checks it again and fails closed).
 */
export function RequestSession({ listing: l, start = false }: { listing: TherapistListing; start?: boolean }) {
  const open = useTherapistsStore((s) => isOpen(s, l.id));
  const preferred = useTherapistsStore((s) => selectProfile(s)?.mode ?? "");
  const policy = useAutomationStore((s) => s.policy);
  const level = useAutomationStore((s) => s.defaultLevel);
  const dnaName = useCareerStore((s) => s.dna.name);
  const offered = l.terms.modes ?? [];
  const fresh = (): Draft => ({ mode: offered.length === 1 ? offered[0] : preferred && offered.includes(preferred) ? preferred : "", date: "", slot: "", name: dnaName, phone: "" });
  const [draft, setDraft] = useState<Draft | null>(start && !open ? fresh() : null);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const decision = resolveCapability("therapists.book", policy, level);

  if (open)
    return (
      <Button full variant="outline" icon={<CalendarClock className="size-4" aria-hidden />} href="/app/m/therapists/pipeline">
        Session requested · Sessions
      </Button>
    );
  if (decision === "skip")
    return (
      <p className="text-[13px] text-ink-3">
        Session requests are off. Turn them on in <Link href="/app/m/therapists/you/profile#settings" className="font-medium text-brand-600 hover:underline">You</Link>.
      </p>
    );

  const today = todayIst();
  const body = (d: Draft) => ({ mode: d.mode, date: d.date, slot: d.slot, ...(d.phone.trim() ? { phone: d.phone.trim() } : {}) });
  const send = async (d: Draft, confirmed: boolean) => {
    if (!d.name.trim()) return toast.error("Add your name", "The practitioner sees it with your request.");
    const c = cleanSessionRequest(body(d), offered, today);
    if ("problem" in c) return toast.error("Check your request", c.problem);
    if (decision === "ask" && !confirmed) return setReview(true);
    setBusy(true);
    try {
      await call("/api/m/therapists/sessions", { body: { listingId: l.postingId, name: d.name.trim(), request: body(d), confirmed } });
      useTherapistsStore.getState().setResponse(l.id, "requested", { status: "requested", item: l });
      toast.success("Session requested", `${l.company} confirms a time or replies in Sessions.`);
      setDraft(null);
      setReview(false);
    } catch (e) {
      // The server's copy of the setting says Ask me: show what goes, then Send.
      if (needsConfirm(e) && !confirmed) setReview(true);
      else toast.error("Couldn't send it", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button full icon={<CalendarClock className="size-4" aria-hidden />} onClick={() => setDraft(fresh())}>
        Request a session
      </Button>
      <p className="text-center text-[12px] text-ink-3">Free to ask. The practitioner confirms a time; you pay them directly.</p>
      {draft && (
        <Modal
          open
          onClose={() => (setDraft(null), setReview(false))}
          title={review ? "Send this request?" : `Request a session with ${l.company}`}
          footer={
            <Button full loading={busy} onClick={() => void send(draft, review)}>
              {review ? "Send" : "Request a session"}
            </Button>
          }
        >
          {review ? (
            <dl className="space-y-2 text-[14px]">
              {[["You asked for", draft.mode && draft.slot ? requestLabel({ mode: draft.mode, date: draft.date, slot: draft.slot }) : ""], ["Your name", draft.name], ["Phone", draft.phone.trim() || "Not shared"]].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[12px] text-ink-4">{k}</dt>
                  <dd className="text-ink">{v}</dd>
                </div>
              ))}
              <p className="pt-1 text-[12px] text-ink-3">Your email goes with it. Your phone reaches {l.company} only once they confirm.</p>
            </dl>
          ) : (
            <div className="space-y-3">
              <fieldset>
                <legend className="mb-2 text-[13px] font-medium text-ink-2">How you&apos;d like to meet *</legend>
                <div className="flex flex-wrap gap-1.5">
                  {offered.map((m) => (
                    <Chip key={m} active={draft.mode === m} onClick={() => setDraft((d) => (d ? { ...d, mode: m } : d))}>
                      {MODE_LABEL[m]}
                      {m === "in_person" && l.location ? ` · ${l.location}` : ""}
                    </Chip>
                  ))}
                </div>
              </fieldset>
              <Field label="Day" htmlFor="ss-date" required>
                <Input id="ss-date" type="date" min={today} max={addDays(today, 60)} value={draft.date} onChange={(e) => setDraft((d) => (d ? { ...d, date: e.target.value } : d))} />
              </Field>
              <fieldset>
                <legend className="mb-2 text-[13px] font-medium text-ink-2">Time of day *</legend>
                <div className="flex flex-wrap gap-1.5">
                  {SLOTS.map((s) => (
                    <Chip key={s} active={draft.slot === s} onClick={() => setDraft((d) => (d ? { ...d, slot: s } : d))}>
                      {SLOT_LABEL[s]}
                    </Chip>
                  ))}
                </div>
              </fieldset>
              <Field label="Your name" htmlFor="ss-name" required>
                <Input id="ss-name" value={draft.name} onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))} />
              </Field>
              <Field label="Phone" htmlFor="ss-phone" hint="Optional. Shared only once they confirm">
                <Input id="ss-phone" type="tel" inputMode="tel" value={draft.phone} onChange={(e) => setDraft((d) => (d ? { ...d, phone: e.target.value } : d))} />
              </Field>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
