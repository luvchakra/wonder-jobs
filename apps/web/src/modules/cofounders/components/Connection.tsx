"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { Textarea } from "@/components/common/Input";
import { EmptyState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { call } from "@/wonderworks/api";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { ItemAside, ItemHead, ItemMain, ItemPage, ItemSection, StageSteps } from "@/wonderworks/pipeline/item";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { MAX_MESSAGE, STAGE_OF, STATUS_LABEL, type ProfileView } from "../domain";
import { lineOf, type ConnMessage, type ConnView } from "../connections";
import { cofoundersManifest } from "../manifest";
import { Act } from "./Act";
import { Safety } from "./Safety";
import { TONE } from "./Pipeline";

const BACK = { href: "/app/m/cofounders/pipeline", label: "Connections" };

const Facts = ({ v }: { v: ProfileView }) => {
  const rows: [string, string | undefined][] = [
    ["Role", v.role],
    ["Skills", v.skills?.join(", ")],
    ["Commitment", v.commitment],
    ["Location", v.location],
    ["Idea", v.ideaState === "idea" ? v.idea : v.ideaState === "open" ? "Open to any idea" : undefined],
    ["About", v.about],
    ["Wants in a co-founder", v.lookingFor],
    ["Equity", v.equity],
  ];
  return (
    <dl className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
      {rows.filter(([, x]) => x).map(([k, x]) => (
        <div key={k}>
          <dt className="text-ink-4">{k}</dt>
          <dd className="whitespace-pre-line font-medium text-ink">{x}</dd>
        </div>
      ))}
    </dl>
  );
};

/**
 * One connection: who is on the other side and only what they have shown you, what waits on you, the thread once
 * interest is mutual, the contact details shared with you, and the decision to build together. Pass is always there.
 */
export function CofoundersConnection({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<{ connection: ConnView; messages: ConnMessage[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    call<{ connection: ConnView; messages: ConnMessage[] }>(`/api/m/cofounders/connections/${encodeURIComponent(id)}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const act = (body: Record<string, unknown>) => call(`/api/m/cofounders/connections/${encodeURIComponent(id)}`, { body }).then((r) => (void load(), r));
  if (error)
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader back={BACK} title="Connection not found" />
        <EmptyState title="This connection isn't yours" body={error} action={{ label: "Back to Connections", href: BACK.href }} />
      </div>
    );
  if (!data) return <PageLoading rows={3} />;
  const { connection: c, messages } = data;
  const stages = cofoundersManifest.pipeline.stages;
  const cp = c.counterpart;
  const mutual = c.canMessage;
  return (
    <ItemPage back={BACK} title={cp.title} badge={<Badge tone={TONE[c.status]}>{c.needsYou ? "Your answer" : STATUS_LABEL[c.status]}</Badge>}>
      <ItemMain>
        <ItemSection title={cp.kind === "team" ? "The team" : "About them"}>
          <ItemHead company={cp.title} lines={[lineOf(c), !mutual && "You see only what they show everyone. More appears when you both agree."]}>
            {cp.team && <p className="mt-1 text-[13px] text-ink-2">{cp.team.company}</p>}
          </ItemHead>
          {cp.profile && (
            <div className="mt-3">
              {cp.profile.name && <p className="mb-2 text-[15px] font-semibold text-ink">{cp.profile.name}</p>}
              <Facts v={cp.profile} />
            </div>
          )}
          {cp.founders && cp.founders.length > 0 && (
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-[13px] font-medium text-ink-2">Founders</p>
              {cp.founders.map((f, i) => (
                <div key={i} className="rounded-[12px] border border-line p-3">
                  <p className="text-[14px] font-semibold text-ink">{f.name ?? f.headline}</p>
                  {f.name && <p className="text-[12px] text-ink-3">{f.headline}</p>}
                  <div className="mt-2">
                    <Facts v={f} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </ItemSection>
        {mutual && <Thread messages={messages} canMessage={c.canMessage} onSend={(text, confirmed) => act({ action: "message", text, confirmed })} />}
      </ItemMain>
      <ItemAside>
        <ItemSection title="Next">
          <div className="flex flex-col gap-3">
            <StageSteps stages={stages} current={STAGE_OF[c.status]} reached={new Set(stages.map((s) => s.id))} currentLabel={c.status === "passed" ? "Passed" : undefined} />
            {c.needsYou && (
              <>
                <Act capability={c.kind === "pair" ? "cofounders.connect" : c.how === "they_invited" ? "cofounders.join" : "cofounders.invite"} label="Accept" full review={<>You&apos;ll both see names and what each shares with connections, and can write to each other. Contact details stay private until you share them.</>} run={(confirmed) => act({ action: "accept", confirmed })} done="Connected" />
                <Button full variant="outline" onClick={() => act({ action: "decline" }).catch((e: Error) => toast.error("Couldn't do that", e.message))}>
                  Not for me
                </Button>
              </>
            )}
            {c.status === "interested" && !c.needsYou && <p className="text-[13px] text-ink-3">{c.waiting ? "Waiting for the answer. You won't be told if it's a no." : "Nothing to do yet."}</p>}
            {c.status === "mutual" && <p className="text-[13px] text-ink-3">Interest is mutual. Write the first message.</p>}
            {c.status === "talking" &&
              (c.youMarkedBuilding ? (
                <p className="text-[13px] text-ink-3">You want to build together. Waiting for the {cp.kind === "team" ? "founders" : "other person"}.</p>
              ) : (
                <Button full variant="outline" onClick={() => act({ action: "build" }).then(() => toast.success("Noted")).catch((e: Error) => toast.error("Couldn't do that", e.message))}>
                  We&apos;re building together
                </Button>
              ))}
            {c.status === "building" && <p className="text-[13px] text-ink-3">You decided to build together{c.kind === "join" ? "; the team is in Teams under Co-founders → You" : ""}.</p>}
            {mutual && (
              <div className="flex flex-col gap-2 border-t border-line pt-3">
                {c.contacts.map((x) => (
                  <p key={x.email} className="text-[13px] text-ink-2">
                    {x.name || "They"} shared <a className="font-medium text-brand-600 hover:underline" href={`mailto:${x.email}`}>{x.email}</a>
                  </p>
                ))}
                {c.youSharedContact ? <p className="text-[12px] text-ink-3">You shared your email.</p> : <Act capability="cofounders.share_contact" label="Share my email" variant="outline" full review={<>Your account email goes to {cp.kind === "team" ? "the team's founders" : "them"}. They can write to you outside WonderWorks. You can&apos;t take it back.</>} run={(confirmed) => act({ action: "share", confirmed })} done="Shared" />}
              </div>
            )}
          </div>
        </ItemSection>
        {c.status !== "passed" && (
          <Button variant="ghost" onClick={() => act({ action: "pass" }).then(() => toast.success("Passed")).catch((e: Error) => toast.error("Couldn't do that", e.message))}>
            Pass
          </Button>
        )}
        <Fold title="Block or report">
          <Safety kind={cp.kind} id={cp.listingId} noun={cp.kind === "team" ? "the team" : "them"} onBlocked={() => router.push(BACK.href)} />
        </Fold>
      </ItemAside>
    </ItemPage>
  );
}

function Thread({ messages, canMessage, onSend }: { messages: ConnMessage[]; canMessage: boolean; onSend: (text: string, confirmed: boolean) => Promise<unknown> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <ItemSection title="Messages">
      {messages.length === 0 ? (
        <p className="text-[13px] text-ink-3">No messages yet.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Messages">
          {messages.map((m) => (
            <li key={m.id} className={cn("max-w-[85%] rounded-[12px] px-3 py-2 text-[14px]", m.mine ? "self-end bg-brand-50 text-ink" : "self-start bg-surface-2 text-ink")}>
              {!m.mine && m.from && <p className="text-[11.5px] font-medium text-ink-3">{m.from}</p>}
              <p className="whitespace-pre-line">{m.body}</p>
              <p className="mt-0.5 text-[11px] text-ink-4">{relativeTime(m.at)}</p>
            </li>
          ))}
        </ul>
      )}
      {canMessage && (
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
          <Textarea aria-label="Your message" rows={3} maxLength={MAX_MESSAGE} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message" />
          <Button type="submit" size="sm" loading={busy} disabled={!text.trim()} className="self-end">
            Send
          </Button>
        </form>
      )}
    </ItemSection>
  );
}
