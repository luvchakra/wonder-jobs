"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarCheck, CheckCircle2, CircleDollarSign, FileText, Send, Star, XCircle } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { Field, Input, Textarea } from "@/components/common/Input";
import { ErrorState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { resolveCapability } from "@/domain/automation/policy";
import { useAutomationStore } from "@/store/automation";
import { cn } from "@/lib/cn";
import { call } from "@/wonderworks/api";
import { money, shortDate } from "@/wonderworks/listing/terms";
import { ItemAside, ItemHead, ItemMain, ItemPage, ItemSection, StageSteps } from "@/wonderworks/pipeline/item";
import { StageTimeline } from "@/wonderworks/pipeline/parts";
import { cleanBooking, clientMay, needsConfirm, paidLabel, quoteExpired, STAGE_OF, startLabel, STATUS_LABEL, todayIst, totalLabel, warrantyUntil, whenLabel, type MyRequestDetail, type Quote } from "../deal";
import { LANE_LABEL } from "../domain";
import { servicesManifest } from "../manifest";
import { useServicesStore } from "../store";
import { TONE } from "./Bookings";

const BACK = { href: "/app/m/services/pipeline", label: "Bookings" };
const EVENT: Record<string, { title: string; icon: typeof Send }> = {
  requested: { title: "Quote requested", icon: Send },
  quoted: { title: "Quote received", icon: FileText },
  booked: { title: "Booked", icon: CalendarCheck },
  done: { title: "Marked done by the pro", icon: CheckCircle2 },
  declined: { title: "Declined by the pro", icon: XCircle },
  cancelled: { title: "Cancelled", icon: XCircle },
  paid_client: { title: "You marked it paid", icon: CircleDollarSign },
  paid_pro: { title: "The pro marked it paid", icon: CircleDollarSign },
  reviewed: { title: "You reviewed it", icon: Star },
  issue: { title: "You reported a problem", icon: AlertTriangle },
};

/** The quote, line by line, as the pro sent it. */
export function QuoteLines({ q, gstNote }: { q: Quote; gstNote?: boolean }) {
  return (
    <div className="text-[14px]">
      <ul className="divide-y divide-line">
        {q.items.map((i, n) => (
          <li key={n} className="flex justify-between gap-3 py-2">
            <span className="text-ink-2">{i.label}</span>
            <span className="shrink-0 font-medium text-ink">{money(i.amount, q.currency)}</span>
          </li>
        ))}
        <li className="flex justify-between gap-3 py-2 font-semibold text-ink">
          <span>Total</span>
          <span>{totalLabel(q)}</span>
        </li>
      </ul>
      <p className="mt-2 text-[13px] text-ink-3">
        {startLabel(q)} · valid until {shortDate(q.validUntil)}
      </p>
      {q.note && <p className="mt-2 whitespace-pre-wrap text-[13px] text-ink-2">{q.note}</p>}
      {gstNote && <p className="mt-2 text-[12px] text-ink-4">As the pro quoted it. WonderWorks adds no tax or fee and holds no money.</p>}
    </div>
  );
}

type Sheet = { kind: "accept"; address: string; phone: string; review: boolean } | { kind: "cancel"; reason: string } | { kind: "review"; rating: number; text: string } | { kind: "issue"; text: string };

/**
 * One request's own page in Bookings, on WonderWorks' Pipeline item page: the pro and the service, what was asked, the
 * quote line by line, the booking, the timeline; beside it the stage and the one thing to do next — Accept and book
 * (services.book: at once when Automatic, after a look when Ask me; the server checks it again), Mark as paid, Review,
 * Report a problem (within the pro's warranty when they state one) — and Cancel while it's still on.
 */
export function ServicesBooking({ id }: { id: string }) {
  const [r, setR] = useState<MyRequestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState(false);
  const policy = useAutomationStore((s) => s.policy);
  const level = useAutomationStore((s) => s.defaultLevel);

  const load = useCallback(() => {
    call<MyRequestDetail>(`/api/m/services/requests/${encodeURIComponent(id)}`)
      .then(setR)
      .catch((e: Error) => setError(e.message));
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorState title="Couldn't load this booking" body={error} actions={[{ label: "Back to Bookings", href: BACK.href }]} />;
  if (!r) return <PageLoading rows={3} />;

  const today = todayIst();
  const may = clientMay(r.status, r.deal, today);
  const local = r.lane === "local";
  const q = r.deal.quote;
  const until = warrantyUntil(r.deal.doneAt, r.warrantyDays);
  const paid = paidLabel(r.deal, "client");
  const bookDecision = resolveCapability("services.book", policy, level);

  const act = async (body: Record<string, unknown>, done: string, detail?: string, onConfirm?: () => void) => {
    setBusy(true);
    try {
      const out = await call<{ status: string }>(`/api/m/services/requests/${encodeURIComponent(r.id)}`, { body });
      useServicesStore.getState().setResponse(`ws_${r.listingId}`, STAGE_OF[out.status as keyof typeof STAGE_OF] ?? "done_closed", { status: out.status });
      toast.success(done, detail);
      setSheet(null);
      load();
    } catch (e) {
      // The server's copy of the booking setting says Ask me: show the booking, then Book.
      if (onConfirm && needsConfirm(e)) onConfirm();
      else toast.error("Couldn't do that", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const accept = (s: Extract<Sheet, { kind: "accept" }>) => {
    const b = cleanBooking({ address: s.address, phone: s.phone }, r.lane, "");
    if ("problem" in b) return toast.error("Check the booking", b.problem);
    if (bookDecision === "ask" && !s.review) return setSheet({ ...s, review: true });
    void act({ action: "accept", booking: local ? { address: s.address, phone: s.phone } : undefined, confirmed: s.review }, "Booked", `${r.pro} hears it now.`, s.review ? undefined : () => setSheet({ ...s, review: true }));
  };

  const primary = may.includes("accept") ? (
    bookDecision === "skip" ? (
      <p className="text-[13px] text-ink-3">
        Booking is off. Turn it on in <Link href="/app/m/services/you/profile#settings" className="font-medium text-brand-600 hover:underline">You</Link>.
      </p>
    ) : (
      <Button full onClick={() => (local ? setSheet({ kind: "accept", address: "", phone: "", review: false }) : accept({ kind: "accept", address: "", phone: "", review: false }))}>
        Accept and book · {totalLabel(q!)}
      </Button>
    )
  ) : may.includes("review") ? (
    <Button full icon={<Star className="size-4" aria-hidden />} onClick={() => setSheet({ kind: "review", rating: 0, text: "" })}>
      Review {r.pro}
    </Button>
  ) : may.includes("paid") ? (
    <Button full icon={<CircleDollarSign className="size-4" aria-hidden />} loading={busy} onClick={() => void act({ action: "paid" }, "Marked as paid", "The pro marks it on their side too.")}>
      Mark as paid
    </Button>
  ) : null;

  const history = r.history.map((h, i) => ({ id: String(i), at: h.at, title: EVENT[h.status]?.title ?? STATUS_LABEL[h.status as keyof typeof STATUS_LABEL] ?? h.status, ...(h.detail ? { detail: h.detail } : {}), icon: EVENT[h.status]?.icon ?? FileText }));

  return (
    <ItemPage back={BACK} title={r.title} badge={<Badge tone={TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>}>
      <ItemMain>
        <ItemHead company={r.pro} lines={[LANE_LABEL[r.lane], `Requested ${shortDate(r.createdAt.slice(0, 10))}`]} />
        <ItemSection title="What you asked for">
          <p className="whitespace-pre-wrap text-[14px] text-ink-2">{r.request.details}</p>
          <p className="mt-2 text-[13px] text-ink-3">{[r.request.area, whenLabel(r.request), r.request.budget && q ? `Budget ${money(r.request.budget, q.currency)}` : r.request.budget ? `Budget ${r.request.budget}` : null].filter(Boolean).join(" · ")}</p>
        </ItemSection>
        {q ? (
          <ItemSection title={quoteExpired(q, today) && r.status === "quoted" ? "Quote (expired)" : "Quote"}>
            <QuoteLines q={q} gstNote />
          </ItemSection>
        ) : (
          r.status === "requested" && (
            <ItemSection title="Quote">
              <p className="text-[14px] text-ink-3">{r.pro} hasn&apos;t quoted yet. You&apos;ll get a notification when they do.</p>
            </ItemSection>
          )
        )}
        {r.deal.booking && (r.deal.booking.address || r.deal.booking.phone) && (
          <ItemSection title="Booking">
            <p className="text-[14px] text-ink-2">{r.deal.booking.address}</p>
            <p className="text-[13px] text-ink-3">{r.deal.booking.phone} · shared with {r.pro} when you booked</p>
          </ItemSection>
        )}
        {r.deal.review && (
          <ItemSection title="Your review">
            <p className="inline-flex items-center gap-1 text-[14px] font-medium text-ink">
              <Star className="size-4 fill-current text-warning-600" aria-hidden /> {r.deal.review.rating} of 5
            </p>
            {r.deal.review.text && <p className="mt-1 text-[14px] text-ink-2">{r.deal.review.text}</p>}
          </ItemSection>
        )}
        {r.deal.issue && (
          <ItemSection title="Problem you reported">
            <p className="text-[14px] text-ink-2">{r.deal.issue.text}</p>
            <p className="mt-1 text-[12px] text-ink-4">Sent to {r.pro} {shortDate(r.deal.issue.at.slice(0, 10))}. Sort it out with them directly.</p>
          </ItemSection>
        )}
        <ItemSection title="Timeline">
          <StageTimeline events={history} label="Booking timeline" />
        </ItemSection>
      </ItemMain>
      <ItemAside>
        <StageSteps stages={servicesManifest.pipeline.stages} current={STAGE_OF[r.status]} reached={new Set(r.history.map((h) => STAGE_OF[h.status as keyof typeof STAGE_OF]).filter(Boolean))} currentLabel={r.status === "declined" || r.status === "cancelled" ? STATUS_LABEL[r.status] : undefined} />
        {r.deal.reason && <p className="text-[13px] text-ink-3">{r.status === "declined" ? `${r.pro}: ` : "Your reason: "}{r.deal.reason}</p>}
        {primary}
        {paid && <p className="text-center text-[13px] text-ink-3">{paid}</p>}
        {(may.includes("paid") && primary && !may.includes("accept") && may.includes("review")) && (
          <Button full variant="outline" loading={busy} onClick={() => void act({ action: "paid" }, "Marked as paid", "The pro marks it on their side too.")}>
            Mark as paid
          </Button>
        )}
        {may.includes("issue") && (
          <div className="text-center">
            <button type="button" className="min-h-10 text-[13px] font-medium text-ink-3 hover:text-ink hover:underline" onClick={() => setSheet({ kind: "issue", text: "" })}>
              Report a problem
            </button>
            {until && <p className="text-[12px] text-ink-4">{until >= today ? `Within ${r.pro}'s ${r.warrantyDays}-day warranty, until ${shortDate(until)}` : `${r.pro}'s ${r.warrantyDays}-day warranty ended ${shortDate(until)}`}</p>}
          </div>
        )}
        {may.includes("cancel") && (
          <button type="button" className="min-h-10 text-[13px] font-medium text-ink-3 hover:text-danger-600 hover:underline" onClick={() => setSheet({ kind: "cancel", reason: "" })}>
            {r.status === "booked" ? "Cancel the booking" : "Cancel the request"}
          </button>
        )}
      </ItemAside>

      {sheet?.kind === "accept" && (
        <Modal
          open
          onClose={() => setSheet(null)}
          title={sheet.review ? "Book it?" : `Book ${r.pro}`}
          footer={
            <Button full loading={busy} onClick={() => accept(sheet)}>
              {sheet.review ? `Book · ${totalLabel(q!)}` : "Continue"}
            </Button>
          }
        >
          {sheet.review ? (
            <div className="space-y-2 text-[14px]">
              <QuoteLines q={q!} />
              <p className="text-ink-2">{sheet.address}</p>
              <p className="text-ink-3">{sheet.phone}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[13px] text-ink-3">{startLabel(q!)}. Your address and phone go to {r.pro} only now that you book. You pay them directly; WonderWorks holds no money.</p>
              <Field label="Address" htmlFor="bk-address" required>
                <Textarea id="bk-address" rows={3} value={sheet.address} onChange={(e) => setSheet({ ...sheet, address: e.target.value })} placeholder="Flat, building, street, area" />
              </Field>
              <Field label="Phone" htmlFor="bk-phone" required>
                <Input id="bk-phone" type="tel" inputMode="tel" value={sheet.phone} onChange={(e) => setSheet({ ...sheet, phone: e.target.value })} placeholder="98765 43210" />
              </Field>
            </div>
          )}
        </Modal>
      )}
      {sheet?.kind === "cancel" && (
        <Modal open onClose={() => setSheet(null)} title={r.status === "booked" ? "Cancel the booking?" : "Cancel the request?"} footer={<Button full variant="danger" loading={busy} onClick={() => void act({ action: "cancel", reason: sheet.reason }, "Cancelled", `${r.pro} hears it now.`)}>Cancel it</Button>}>
          <Field label="Reason" htmlFor="cx-reason" hint="Optional; the pro sees it">
            <Textarea id="cx-reason" rows={3} value={sheet.reason} onChange={(e) => setSheet({ ...sheet, reason: e.target.value })} />
          </Field>
        </Modal>
      )}
      {sheet?.kind === "review" && (
        <Modal open onClose={() => setSheet(null)} title={`Review ${r.pro}`} footer={<Button full loading={busy} onClick={() => (sheet.rating ? void act({ action: "review", review: { rating: sheet.rating, text: sheet.text } }, "Thanks for the review", "It shows on their page with your first name.") : toast.error("Choose 1 to 5 stars"))}>Post review</Button>}>
          <div className="space-y-3">
            <div role="radiogroup" aria-label="Stars" className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={sheet.rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setSheet({ ...sheet, rating: n })} className="grid size-11 place-items-center rounded-full hover:bg-bg-soft">
                  <Star className={cn("size-7", n <= sheet.rating ? "fill-current text-warning-600" : "text-ink-4")} aria-hidden />
                </button>
              ))}
            </div>
            <Field label="What went well, or didn't" htmlFor="rv-text" hint="Optional. Shows on the pro's page with your first name">
              <Textarea id="rv-text" rows={4} value={sheet.text} onChange={(e) => setSheet({ ...sheet, text: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
      {sheet?.kind === "issue" && (
        <Modal open onClose={() => setSheet(null)} title="Report a problem" footer={<Button full loading={busy} onClick={() => void act({ action: "issue", text: sheet.text }, "Sent to the pro", "They hear it now; sort it out with them directly.")}>Send to {r.pro}</Button>}>
          <Field label="What went wrong" htmlFor="is-text" hint={until && until >= today ? `Within their ${r.warrantyDays}-day warranty, until ${shortDate(until)}` : undefined} required>
            <Textarea id="is-text" rows={4} value={sheet.text} onChange={(e) => setSheet({ ...sheet, text: e.target.value })} placeholder="The AC stopped cooling again two days later." />
          </Field>
        </Modal>
      )}
    </ItemPage>
  );
}
