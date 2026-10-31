"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { Input, Textarea } from "@/components/common/Input";
import { EmptyState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { call } from "@/wonderworks/api";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { Act } from "@/wonderworks/pipeline/Act";
import { ReportBlock } from "@/wonderworks/pipeline/ReportBlock";
import { ItemAside, ItemHead, ItemMain, ItemPage, ItemSection, StageSteps } from "@/wonderworks/pipeline/item";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ClampedText, isLongText } from "@/wonderworks/listing/ListingPage";
import { MAX_MESSAGE, priceLabel, STAGE_OF, STATUS_LABEL } from "../domain";
import { marketplaceManifest } from "../manifest";
import type { ThreadMessage, ThreadView } from "../threads";
import { Gallery } from "./Gallery";
import { lineOf, TONE } from "./Pipeline";
import { ScamWarning } from "./ScamWarning";

const BACK = { href: "/app/m/marketplace/pipeline", label: "Deals" };
const SETTINGS = { href: "/app/m/marketplace/you/profile#settings", label: "Buy, Sell & Rent → You" };
const ENDED: Record<string, string> = { blocked: "This conversation ended.", not_confirmed: "Closed: the other side never confirmed it was done.", sold: "This item was sold to someone else.", closed: "This conversation was closed." };

/**
 * One deal: the thread, the offer and what each side may do next (domain.ts::mayDo, asked again by the server), the
 * advance-payment warning, contact details only once the other side shared them, and report and block.
 * No money moves through WonderWorks: an agreed offer is an agreement to meet, and Done needs both sides.
 */
export function MarketplaceItem({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<{ thread: ThreadView; messages: ThreadMessage[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [showAll, setShowAll] = useState(false);
  const url = `/api/m/marketplace/threads/${encodeURIComponent(id)}`;
  const load = () =>
    call<{ thread: ThreadView; messages: ThreadMessage[] }>(url)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const act = (body: Record<string, unknown>) => call(url, { body }).then((r) => (void load(), r));
  const quick = (body: Record<string, unknown>, ok?: string) => act(body).then(() => ok && toast.success(ok)).catch((e: Error) => toast.error("Couldn't do that", e.message));
  if (error)
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader back={BACK} title="Deal not found" />
        <EmptyState title="This conversation isn't yours" body={error} action={{ label: "Back to Deals", href: BACK.href }} />
      </div>
    );
  if (!data) return <PageLoading rows={3} />;
  const { thread: t, messages } = data;
  const stages = marketplaceManifest.pipeline.stages;
  const may = new Set(t.may);
  const pending = t.offers.find((o) => o.status === "pending");
  const agreed = t.offers.find((o) => o.status === "accepted");
  const ended = ["declined", "closed"].includes(t.status);
  return (
    <ItemPage back={BACK} title={t.title} badge={<Badge tone={TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>}>
      <ItemMain>
        <ItemSection title="The item">
          <Gallery listingId={t.listingId} photos={t.item.photos} title={t.title} />
          <p className="text-[15px] font-semibold text-ink">
            {priceLabel(t.price)}
            {t.item.negotiable ? " · negotiable" : ""}
          </p>
          <p className="text-[13px] text-ink-3">{[t.item.condition, t.item.area, t.item.category].join(" · ")}</p>
          <div className="mt-2">
            <ClampedText text={t.item.description} long={isLongText(t.item.description)} expanded={showAll} onToggle={() => setShowAll((v) => !v)} />
          </div>
        </ItemSection>
        <ItemSection title={t.side === "buyer" ? "The seller" : "The buyer"}>
          <ItemHead company={t.counterpart} lines={[lineOf(t), agreed && `Agreed price ${priceLabel(agreed.amount)}. Pay in person, when you've seen and received the item.`]} />
        </ItemSection>
        <ScamWarning />
        <ItemSection title="Messages">
          {messages.length === 0 ? (
            <p className="text-[13px] text-ink-3">No messages yet.</p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Messages">
              {messages.map((m) => (
                <li key={m.id} className={cn("max-w-[85%] rounded-[12px] px-3 py-2 text-[14px]", m.mine ? "self-end bg-brand-50 text-ink" : "self-start bg-surface-2 text-ink")}>
                  <p className="whitespace-pre-line">{m.body}</p>
                  {m.risky && (
                    <p className="mt-1 flex items-start gap-1 text-[12px] font-medium text-warning-700">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> This message asks for money or sounds like a known scam. Don&apos;t pay before you&apos;ve met and seen the item.
                    </p>
                  )}
                  <p className="mt-0.5 text-[11px] text-ink-4">{relativeTime(m.at)}</p>
                </li>
              ))}
            </ul>
          )}
          {may.has("message") && <Composer onSend={(text, confirmed) => act({ action: "message", text, confirmed })} />}
          {ended && <p className="mt-2 text-[13px] text-ink-3">{ENDED.closed}</p>}
        </ItemSection>
      </ItemMain>
      <ItemAside>
        <ItemSection title="Next">
          <div className="flex flex-col gap-3">
            <StageSteps stages={stages} current={STAGE_OF[t.status]} reached={new Set(stages.map((s) => s.id))} />
            {pending && (
              <p className="text-[14px] text-ink-2">
                {t.side === "buyer" ? "Your offer" : "Offer"}: <strong>{priceLabel(pending.amount)}</strong>{t.side === "buyer" ? ". Waiting for the seller." : "."}
              </p>
            )}
            {may.has("offer") && (
              <div className="flex flex-col gap-2">
                <Input aria-label="Your offer in rupees" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 9))} placeholder={`Up to ${priceLabel(t.price)}`} />
                <Act capability="marketplace.offer" label="Send offer" full settings={SETTINGS} review={<>Your offer of {priceLabel(Number(amount) || 0)} goes to the seller. No money moves through WonderWorks: you pay in person only if you both agree.</>} run={(confirmed) => act({ action: "offer", amount: Number(amount), confirmed }).then(() => setAmount(""))} done="Offer sent" />
              </div>
            )}
            {may.has("withdraw") && (
              <Button full variant="outline" onClick={() => quick({ action: "withdraw" }, "Offer withdrawn")}>
                Withdraw offer
              </Button>
            )}
            {may.has("accept") && (
              <>
                <Act capability="marketplace.accept" label="Accept offer" full settings={SETTINGS} review={<>You agree to sell at {pending ? priceLabel(pending.amount) : "this price"}. The buyer is told. No money moves through WonderWorks: you meet, and they pay you in person.</>} run={(confirmed) => act({ action: "accept", confirmed })} done="Offer accepted" />
                <Button full variant="outline" onClick={() => quick({ action: "decline" })}>
                  Decline
                </Button>
              </>
            )}
            {may.has("visit") && (
              <Button full onClick={() => quick({ action: "visit" })}>
                We&apos;ve agreed to meet
              </Button>
            )}
            {(may.has("mark_done") || may.has("confirm_done")) && (
              <Button full onClick={() => quick({ action: "done" }, "Marked done")}>
                {may.has("confirm_done") ? "Confirm it's done" : "Mark as done"}
              </Button>
            )}
            {t.youMarkedDone && t.status === "visit" && <p className="text-[13px] text-ink-3">You marked it done. It closes when the other side confirms (within 14 days).</p>}
            {t.status === "done" && <p className="text-[13px] text-ink-3">Done. The listing is marked sold.</p>}
          </div>
        </ItemSection>
        {t.status !== "declined" && t.status !== "closed" && (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            {t.contacts.map((c) => (
              <p key={c.email} className="text-[13px] text-ink-2">
                {t.counterpart} shared <a className="font-medium text-brand-600 hover:underline" href={`mailto:${c.email}`}>{c.email}</a>
              </p>
            ))}
            {t.youSharedContact ? <p className="text-[12px] text-ink-3">You shared your email.</p> : <Act capability="marketplace.share_contact" label="Share my email" variant="outline" full settings={SETTINGS} review={<>Your account email goes to {t.counterpart}. They can write to you outside WonderWorks, where WonderWorks can&apos;t protect you. You can&apos;t take it back.</>} run={(confirmed) => act({ action: "share", confirmed })} done="Shared" />}
          </div>
        )}
        {may.has("close") && (
          <Button variant="ghost" onClick={() => quick({ action: "close" })}>
            Close this conversation
          </Button>
        )}
        <Fold title="Block or report">
          <ReportBlock noun={t.counterpart} onBlock={() => act({ action: "block" })} onReport={(reason) => act({ action: "report", reason })} onBlocked={() => router.push(BACK.href)} />
        </Fold>
      </ItemAside>
    </ItemPage>
  );
}

function Composer({ onSend }: { onSend: (text: string, confirmed: boolean) => Promise<unknown> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSend(text, true);
          setText("");
        } catch (err) {
          toast.error("Couldn't send it", (err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Textarea aria-label="Your message" rows={3} maxLength={MAX_MESSAGE} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message. No phone numbers, emails or links." />
      <Button type="submit" size="sm" loading={busy} disabled={!text.trim()} className="self-end">
        Send
      </Button>
    </form>
  );
}
