"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CalendarClock, Inbox } from "lucide-react";
import { Button } from "@/components/common/Button";
import { EmptyState, ErrorState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { moduleById } from "@/modules/registry";
import { cn } from "@/lib/cn";
import { call } from "../api";
import { canWithdraw, deadlines, shortDate, stageOf, STATUS_LABEL, stipendLabel, durationLabel, type InternshipListing, type MyInternshipApplication } from "../domain";
import { savedItems, useInternshipsStore } from "../store";

const noop = () => () => undefined;

type Item = { id: string; title: string; company: string; stage: string; status: string; at: string; app?: MyInternshipApplication; outside?: InternshipListing };

/**
 * Internships' Pipeline (WJ-417): Applied · Shortlisted · Offer · Accepted / Closed with real counts, opening on the stage
 * with something to do, and Deadlines. WonderStar applications come from the server (what the company actually did);
 * outside ones are those the student marked applied after applying on the employer's page.
 */
export function InternshipsPipeline() {
  const stages = moduleById("internships")!.pipeline.stages;
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const responses = useInternshipsStore((s) => s.responses);
  const items = useInternshipsStore((s) => s.items);
  const saved = useInternshipsStore((s) => s.saved);
  const [apps, setApps] = useState<MyInternshipApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    call<{ applications: MyInternshipApplication[] }>("/api/m/internships/applications")
      .then((r) => setApps(r.applications))
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  const list: Item[] = useMemo(() => {
    const out: Item[] = (apps ?? []).map((a) => ({ id: a.id, title: a.title, company: a.company, stage: stageOf(a.status), status: STATUS_LABEL[a.status], at: a.updatedAt, app: a }));
    if (mounted)
      for (const [id, r] of Object.entries(responses)) {
        const l = items[id] as InternshipListing | undefined;
        if (l?.origin === "outside") out.push({ id, title: l.title, company: l.company, stage: r.stage, status: "Applied on their site", at: r.at, outside: l });
      }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [apps, responses, items, mounted]);

  const due = useMemo(() => (mounted && apps ? deadlines(savedItems({ saved, items }), apps) : []), [mounted, apps, saved, items]);

  if (error) return <ErrorState title="Couldn't load your applications" body={error} actions={[{ label: "Try again", onClick: () => (setError(null), void load()) }]} />;
  if (!apps) return <PageLoading rows={3} />;

  const count = (stage: string) => list.filter((i) => i.stage === stage).length;
  // Opens on the stage with something to do: an offer to answer first, then the earliest stage with anything in it.
  const current = tab ?? (count("offer") ? "offer" : (stages.find((s) => count(s.id))?.id ?? stages[0].id));
  const shown = list.filter((i) => i.stage === current);

  const act = async (id: string, action: "withdraw" | "accept") => {
    setBusy(id);
    try {
      await call(`/api/m/internships/applications/${id}`, { body: { action } });
      toast.success(action === "accept" ? "Offer accepted" : "Withdrawn", action === "accept" ? "The company sees that you accepted." : "The company sees it as withdrawn.");
      await load();
    } catch (e) {
      toast.error("Couldn't do that", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      {due.length > 0 && (
        <section aria-label="Deadlines" className="wj-card mb-4 p-4">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
            <CalendarClock className="size-4 text-star-purple" aria-hidden /> Deadlines
          </h2>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {due.slice(0, 8).map((d) => (
              <li key={d.id} className="flex justify-between gap-3">
                <span className="min-w-0 truncate text-ink-2">
                  {d.title} · {d.company}
                </span>
                <span className="shrink-0 text-ink-3">
                  {d.label} {shortDate(d.date)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div role="tablist" aria-label="Stages" className="mb-4 flex flex-wrap gap-2">
        {stages.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={current === s.id} onClick={() => setTab(s.id)} className={cn("rounded-full px-3 py-1 text-[13px]", current === s.id ? "wj-gradient-bg text-white" : "bg-surface-2 text-ink-2")}>
            {s.label} <span className={current === s.id ? "text-white/80" : "text-ink-4"}>{count(s.id)}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={<Inbox className="size-5" aria-hidden />} title={list.length ? "Nothing in this stage" : "Nothing in Pipeline yet"} body={list.length ? undefined : "Internships you apply to show here, with where each stands."} action={list.length ? undefined : { label: "Find internships", href: "/app/m/internships" }} />
      ) : (
        <ul className="space-y-3">
          {shown.map((i) => (
            <li key={i.id} className="wj-card flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink">{i.title}</p>
                <p className="truncate text-[13px] text-ink-2">{i.company}</p>
                <p className="text-[12.5px] text-ink-3">
                  {i.status}
                  {i.app ? ` · ${stipendLabel(i.app.terms)} · ${durationLabel(i.app.terms)}` : ""}
                </p>
              </div>
              {i.app?.status === "offer" ? (
                <div className="flex shrink-0 flex-col gap-1">
                  <Button size="sm" loading={busy === i.id} onClick={() => void act(i.id, "accept")}>
                    Accept
                  </Button>
                  <button type="button" className="text-[12px] text-ink-3 underline" onClick={() => void act(i.id, "withdraw")}>
                    Decline
                  </button>
                </div>
              ) : i.app && canWithdraw(i.app.status) ? (
                <Button size="sm" variant="ghost" loading={busy === i.id} onClick={() => void act(i.id, "withdraw")}>
                  Withdraw
                </Button>
              ) : i.outside ? (
                <Button size="sm" variant="ghost" onClick={() => useInternshipsStore.setState((s) => ({ responses: Object.fromEntries(Object.entries(s.responses).filter(([k]) => k !== i.id)) }))}>
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
