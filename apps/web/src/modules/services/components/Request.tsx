"use client";
import { useState } from "react";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { Chip, Field, Input, Textarea } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { resolveCapability } from "@/domain/automation/policy";
import { useAutomationStore } from "@/store/automation";
import { useCareerStore } from "@/store/career";
import { call } from "@/wonderworks/api";
import { addDays, cleanRequest, needsConfirm, SLOT_LABEL, SLOTS, todayIst, type Slot } from "../deal";
import type { ServiceListing } from "../domain";
import { selectProfile, useServicesStore } from "../store";

type Draft = { details: string; area: string; date: string; slot: Slot | ""; budget: string; neededBy: string; name: string };

/** Whether the client has a request open with this pro (their own record; Bookings brings it up to date). */
export const isOpen = (s: { responses: Record<string, { stage: string; status?: string }> }, id: string) => ["requested", "quoted", "booked"].includes(s.responses[id]?.status ?? "");

/**
 * Request a quote, on a pro's WonderWorks listing: what the client needs and — for work at their place — the area,
 * the day and the time of day (the address and phone go only once they book); for a remote project, a budget and a
 * deadline if they have one. Their press sends it at once when "Send quote requests in one tap" is Automatic, after a
 * look when it's Ask me, never when it's Off (resolveCapability; the server checks it again and fails closed).
 */
export function RequestQuote({ listing: l, start = false }: { listing: ServiceListing; start?: boolean }) {
  const open = useServicesStore((s) => isOpen(s, l.id));
  const area = useServicesStore((s) => selectProfile(s)?.area ?? "");
  const policy = useAutomationStore((s) => s.policy);
  const level = useAutomationStore((s) => s.defaultLevel);
  const dnaName = useCareerStore((s) => s.dna.name);
  const [draft, setDraft] = useState<Draft | null>(start && !open ? { details: "", area, date: "", slot: "", budget: "", neededBy: "", name: dnaName } : null);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const local = l.terms.lane !== "remote";
  const decision = resolveCapability("services.request_quote", policy, level);

  if (open)
    return (
      <Button full variant="outline" icon={<CalendarCheck className="size-4" aria-hidden />} href="/app/m/services/pipeline">
        Quote requested · Bookings
      </Button>
    );
  if (decision === "skip")
    return (
      <p className="text-[13px] text-ink-3">
        Quote requests are off. Turn them on in <Link href="/app/m/services/you/profile#settings" className="font-medium text-brand-600 hover:underline">You</Link>.
      </p>
    );

  const begin = () => setDraft({ details: "", area, date: "", slot: "", budget: "", neededBy: "", name: dnaName });
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => (d ? { ...d, [k]: e.target.value } : d));
  const today = todayIst();
  const body = (d: Draft) => ({ details: d.details, ...(local ? { area: d.area, date: d.date, slot: d.slot || undefined } : { ...(d.budget.trim() ? { budget: Number(d.budget.replace(/[^\d]/g, "")) } : {}), ...(d.neededBy ? { neededBy: d.neededBy } : {}) }) });
  const send = async (d: Draft, confirmed: boolean) => {
    if (!d.name.trim()) return toast.error("Add your name", "The pro sees it with your request.");
    const c = cleanRequest(body(d), local ? "local" : "remote", today);
    if ("problem" in c) return toast.error("Check your request", c.problem);
    if (decision === "ask" && !confirmed) return setReview(true);
    setBusy(true);
    try {
      await call("/api/m/services/requests", { body: { listingId: l.postingId, name: d.name.trim(), request: body(d), confirmed } });
      useServicesStore.getState().setResponse(l.id, "requested", { status: "requested", item: l });
      toast.success("Quote requested", `${l.company} hears it now. Their quote shows in Bookings.`);
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
      <Button full onClick={begin}>
        Request a quote
      </Button>
      <p className="text-center text-[12px] text-ink-3">Free. You pay only if you accept a quote, directly to the pro.</p>
      {draft && (
        <Modal
          open
          onClose={() => (setDraft(null), setReview(false))}
          title={review ? "Send this request?" : `Request a quote from ${l.company}`}
          footer={
            <Button full loading={busy} onClick={() => void send(draft, review)}>
              {review ? "Send" : "Request a quote"}
            </Button>
          }
        >
          {review ? (
            <dl className="space-y-2 text-[14px]">
              {[["What you need", draft.details], ...(local ? [["Area", draft.area], ["When", `${draft.date}, ${draft.slot ? SLOT_LABEL[draft.slot] : ""}`]] : [["Budget", draft.budget || "Not stated"], ["Needed by", draft.neededBy || "No deadline"]]), ["Your name", draft.name]].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[12px] text-ink-4">{k}</dt>
                  <dd className="whitespace-pre-wrap text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="space-y-3">
              <Field label={local ? "What needs doing" : "What you need done"} htmlFor="rq-details" required>
                <Textarea id="rq-details" rows={4} value={draft.details} onChange={set("details")} placeholder={local ? "Split AC not cooling, 1.5 ton, second floor." : "A logo and brand colours for a bakery; I'd like three concepts."} />
              </Field>
              {local ? (
                <>
                  <Field label="Area or pin code" htmlFor="rq-area" hint="Your address goes to the pro only if you book" required>
                    <Input id="rq-area" value={draft.area} onChange={set("area")} placeholder="Kothrud, or 411038" />
                  </Field>
                  <Field label="Day" htmlFor="rq-date" required>
                    <Input id="rq-date" type="date" min={today} max={addDays(today, 90)} value={draft.date} onChange={set("date")} />
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
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={`Budget (${l.terms.currency})`} htmlFor="rq-budget" hint="Optional">
                    <Input id="rq-budget" inputMode="numeric" value={draft.budget} onChange={set("budget")} />
                  </Field>
                  <Field label="Needed by" htmlFor="rq-by" hint="Optional">
                    <Input id="rq-by" type="date" min={today} value={draft.neededBy} onChange={set("neededBy")} />
                  </Field>
                </div>
              )}
              <Field label="Your name" htmlFor="rq-name" required>
                <Input id="rq-name" value={draft.name} onChange={set("name")} />
              </Field>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
