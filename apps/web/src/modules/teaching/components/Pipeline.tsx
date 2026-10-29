"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CalendarClock, Inbox } from "lucide-react";
import { Button } from "@/components/common/Button";
import { EmptyState, ErrorState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { moduleById } from "@/modules/registry";
import { cn } from "@/lib/cn";
import { call } from "@/modules/internships/api";
import { BOOKING_LABEL, canWithdraw, payLabel, shortDateTime, stageOf, STATUS_LABEL, type MyTeachingApplication, type TeachingListing } from "../domain";
import { useTeachingStore } from "../store";

const noop = () => () => undefined;
type Item = { id: string; title: string; company: string; stage: string; status: string; at: string; app?: MyTeachingApplication; outside?: boolean };

/**
 * Teaching's Pipeline (WJ-419): Applied · Demo class · Appointed / Closed with real counts, opening on the stage with
 * something to do, and Demo-class bookings — each demo class a school proposed, to confirm or decline. WonderStar
 * applications come from the server; outside ones are those the teacher marked applied after applying on the employer's page.
 */
export function TeachingPipeline() {
  const stages = moduleById("teaching")!.pipeline.stages;
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const responses = useTeachingStore((s) => s.responses);
  const items = useTeachingStore((s) => s.items);
  const [apps, setApps] = useState<MyTeachingApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    call<{ applications: MyTeachingApplication[] }>("/api/m/teaching/applications")
      .then((r) => setApps(r.applications))
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  const list: Item[] = useMemo(() => {
    const out: Item[] = (apps ?? []).map((a) => ({ id: a.id, title: a.title, company: a.company, stage: stageOf(a.status), status: STATUS_LABEL[a.status], at: a.updatedAt, app: a }));
    if (mounted)
      for (const [id, r] of Object.entries(responses)) {
        const l = items[id] as TeachingListing | undefined;
        if (l?.origin === "outside") out.push({ id, title: l.title, company: l.company, stage: r.stage, status: "Applied on their site", at: r.at, outside: true });
      }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [apps, responses, items, mounted]);

  const demos = useMemo(() => (apps ?? []).flatMap((a) => a.bookings.filter((b) => b.status === "proposed" || b.status === "confirmed").map((b) => ({ ...b, title: a.title, company: a.company }))).sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [apps]);

  if (error) return <ErrorState title="Couldn't load your applications" body={error} actions={[{ label: "Try again", onClick: () => (setError(null), void load()) }]} />;
  if (!apps) return <PageLoading rows={3} />;

  const count = (stage: string) => list.filter((i) => i.stage === stage).length;
  const current = tab ?? (count("demo_class") ? "demo_class" : (stages.find((s) => count(s.id))?.id ?? stages[0].id));
  const shown = list.filter((i) => i.stage === current);

  const act = async (key: string, url: string, body: unknown, done: string) => {
    setBusy(key);
    try {
      await call(url, { body });
      toast.success(done);
      await load();
    } catch (e) {
      toast.error("Couldn't do that", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      {demos.length > 0 && (
        <section aria-label="Demo-class bookings" className="wj-card mb-4 p-4">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
            <CalendarClock className="size-4 text-star-purple" aria-hidden /> Demo-class bookings
          </h2>
          <ul className="mt-2 space-y-3">
            {demos.map((d) => (
              <li key={d.id} className="text-[13px]">
                <p className="font-medium text-ink">
                  {d.title} · {d.company}
                </p>
                <p className="text-ink-3">
                  {shortDateTime(d.startsAt)} IST · {d.durationMin} min · {d.mode === "online" ? "Online" : "In person"} · {BOOKING_LABEL[d.status]}
                </p>
                <p className="break-all text-ink-3">{d.where}</p>
                {d.note && <p className="text-ink-3">“{d.note}”</p>}
                {d.status === "proposed" && (
                  <div className="mt-1.5 flex gap-2">
                    <Button size="sm" loading={busy === `c:${d.id}`} onClick={() => void act(`c:${d.id}`, `/api/m/teaching/bookings/${d.id}`, { answer: "confirmed" }, "Demo class confirmed")}>
                      Confirm
                    </Button>
                    <Button size="sm" variant="ghost" loading={busy === `d:${d.id}`} onClick={() => void act(`d:${d.id}`, `/api/m/teaching/bookings/${d.id}`, { answer: "declined" }, "Demo class declined")}>
                      Decline
                    </Button>
                  </div>
                )}
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
        <EmptyState icon={<Inbox className="size-5" aria-hidden />} title={list.length ? "Nothing in this stage" : "Nothing in Pipeline yet"} body={list.length ? undefined : "Teaching roles you apply to show here, with where each stands."} action={list.length ? undefined : { label: "Find teaching roles", href: "/app/m/teaching" }} />
      ) : (
        <ul className="space-y-3">
          {shown.map((i) => (
            <li key={i.id} className="wj-card flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink">{i.title}</p>
                <p className="truncate text-[13px] text-ink-2">{i.company}</p>
                <p className="text-[12.5px] text-ink-3">
                  {i.status}
                  {i.app ? ` · ${payLabel(i.app.terms)}` : ""}
                </p>
              </div>
              {i.app && canWithdraw(i.app.status) ? (
                <Button size="sm" variant="ghost" loading={busy === `w:${i.id}`} onClick={() => void act(`w:${i.id}`, `/api/m/teaching/applications/${i.id}`, { action: "withdraw" }, "Withdrawn")}>
                  Withdraw
                </Button>
              ) : i.outside ? (
                <Button size="sm" variant="ghost" onClick={() => useTeachingStore.setState((s) => ({ responses: Object.fromEntries(Object.entries(s.responses).filter(([k]) => k !== i.id)) }))}>
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
