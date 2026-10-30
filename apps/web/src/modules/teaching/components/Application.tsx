"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CalendarCheck, CheckCircle2, ExternalLink, Send, Star, Trash2, Undo2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, type Tone } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { Fold } from "@/components/common/Fold";
import { EmptyState, ErrorState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { StageTimeline } from "@/wonderworks/pipeline/parts";
import { ItemAside, ItemHead, ItemMain, ItemPage, ItemSection, StageSteps } from "@/wonderworks/pipeline/item";
import { formatDate } from "@/lib/format";
import { call } from "@/wonderworks/api";
import { listingHref, teachingManifest } from "../manifest";
import { DemoTimes } from "./Demo";
import { canWithdraw, gradesLabel, HOURS_LABEL, MARK_LABEL, OUTSIDE_LABEL, outsideStatus, payLabel, stageOf, STATUS_LABEL, WORK_MODE_LABEL, type DemoBooking, type MyTeachingApplicationDetail, type TeachingListing, type TeachingStatus, type TeachingTerms } from "../domain";
import { useTeachingStore } from "../store";

const noop = () => () => undefined;
const BACK = { href: "/app/m/teaching/pipeline", label: "Pipeline" };
const facts = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");
const termLines = (t: TeachingTerms, location: string, workMode?: keyof typeof WORK_MODE_LABEL) => [facts([location, workMode ? WORK_MODE_LABEL[workMode] : null, t.hours ? HOURS_LABEL[t.hours] : null, payLabel(t)]), facts([t.subject, t.grades?.length ? gradesLabel(t.grades) : null, t.boards?.join(", ")])];

export const TONE: Record<TeachingStatus, Tone> = { applied: "info", shortlisted: "brand", demo_class: "brand", appointed: "success", closed: "neutral", withdrawn: "neutral" };
const ICON = { applied: Send, shortlisted: Star, demo_class: CalendarCheck, appointed: CheckCircle2, closed: XCircle, withdrawn: Undo2 } as const;

function eventTitle(status: TeachingStatus, school: string) {
  switch (status) {
    case "applied":
      return "Applied";
    case "shortlisted":
      return `Shortlisted by ${school}`;
    case "demo_class":
      return "Demo class";
    case "appointed":
      return `Appointed by ${school}`;
    case "closed":
      return `${school} isn't moving forward`;
    default:
      return "Withdrawn";
  }
}

/**
 * One Teaching application, on WonderWorks' item page (wonderworks/pipeline/item.tsx, Jobs' application layout): the
 * opening and its timeline, and beside them its stage and what was sent. A WonderWorks application comes from the
 * server (what the school actually did); an outside one is the teacher's own mark, kept in their Teaching store.
 */
export function TeachingApplication({ id }: { id: string }) {
  const router = useRouter();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const outsideRef = useTeachingStore((s) => s.responses[id]);
  const outsideItem = useTeachingStore((s) => s.items[id]) as TeachingListing | undefined;
  const outside = mounted && outsideRef && outsideItem?.origin === "outside" ? { ref: outsideRef, item: outsideItem } : null;
  const [app, setApp] = useState<MyTeachingApplicationDetail | null>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [demos, setDemos] = useState<DemoBooking[]>([]);

  const load = () =>
    Promise.all([call<{ application: MyTeachingApplicationDetail }>(`/api/m/teaching/applications/${encodeURIComponent(id)}`), call<{ bookings: DemoBooking[] }>("/api/m/teaching/bookings")])
      .then(([r, b]) => {
        setApp(r.application);
        setDemos(b.bookings.filter((x) => x.responseId === id));
      })
      .catch((e: Error & { status?: number }) => setError({ message: e.message, status: e.status }));
  const isOutside = !!outside;
  useEffect(() => {
    if (mounted && !isOutside) void load();
  }, [mounted, isOutside]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return <PageLoading rows={3} />;

  if (outside) {
    const l = outside.item;
    const st = outsideStatus(outside.ref) ?? "applied";
    return (
      <ItemPage back={BACK} title={`${l.title} · ${l.company}`} badge={<Badge tone={st === "applied" ? "info" : "neutral"}>{OUTSIDE_LABEL[st]}</Badge>}>
        <ItemMain>
          <Card>
            <ItemHead company={l.company} lines={termLines(l.terms, l.location, l.workMode)}>
              {l.applyUrl && (
                <a href={l.applyUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">
                  Original posting <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
            </ItemHead>
            <p className="mt-3 text-[13px] text-ink-3">
              {st === "applied" ? "Marked applied" : st === "withdrawn" ? "Marked withdrawn" : "Preparing since"} {formatDate(outside.ref.at)} · from {l.sourceName} ·{" "}
              <Link href={listingHref(l.id)} className="font-medium text-brand-600 hover:underline">
                Opening details
              </Link>
            </p>
          </Card>
          <ItemSection title="Timeline">
            <StageTimeline events={[{ id: st, at: outside.ref.at, title: OUTSIDE_LABEL[st], detail: st === "preparing" ? (outside.ref.marks ?? []).map((m) => MARK_LABEL[m] ?? m).join(" · ") || undefined : `Marked ${st} by you`, icon: st === "withdrawn" ? Undo2 : Send }]} />
          </ItemSection>
        </ItemMain>
        <ItemAside>
          <Card>
            <p className="text-[13px] text-ink-3">{l.company} doesn&apos;t tell WonderWorks how this goes. Their replies come to you directly.</p>
          </Card>
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="size-4" aria-hidden />}
            className="text-danger-600"
            onClick={() => {
              useTeachingStore.getState().clearResponse(id);
              toast.success("Removed from Pipeline");
              router.push(BACK.href);
            }}
          >
            Remove from Pipeline
          </Button>
        </ItemAside>
      </ItemPage>
    );
  }

  if (error)
    return error.status === 404 ? (
      <div>
        <PageHeader back={BACK} title="Application not found" />
        <EmptyState title="This application isn't available" action={{ label: "Back to Pipeline", href: BACK.href }} />
      </div>
    ) : (
      <ErrorState title="Couldn't load this application" body={error.message} actions={[{ label: "Try again", onClick: () => (setError(null), void load()) }]} />
    );
  if (!app) return <PageLoading rows={3} />;

  const withdraw = async () => {
    setBusy(true);
    try {
      await call(`/api/m/teaching/applications/${encodeURIComponent(app.id)}`, { body: { action: "withdraw" } });
      toast.success("Withdrawn", "The school sees it as withdrawn.");
      await load();
    } catch (e) {
      toast.error("Couldn't do that", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sent = app.sent;
  const stage = stageOf(app.status);

  return (
    <ItemPage back={BACK} title={`${app.title} · ${app.company}`} badge={<Badge tone={TONE[app.status]}>{STATUS_LABEL[app.status]}</Badge>}>
      <ItemMain>
        <Card>
          <ItemHead company={app.company} lines={termLines(app.terms, app.location, app.workMode)} />
          <p className="mt-3 text-[13px] text-ink-3">Applied {formatDate(app.appliedAt)} on WonderWorks</p>
          {app.description && (
            <Fold title="About the role" className="mt-3">
              <p className="whitespace-pre-line pb-2 text-[13px] text-ink-2">{app.description}</p>
            </Fold>
          )}
        </Card>
        {demos.length > 0 && (
          <ItemSection title="Demo class">
            <DemoTimes bookings={demos} school={app.company} onChange={() => void load()} />
          </ItemSection>
        )}
        <ItemSection title="Timeline">
          <StageTimeline events={app.events.map((e) => ({ id: e.id, at: e.at, title: eventTitle(e.status, app.company), detail: e.detail && e.detail !== eventTitle(e.status, app.company) ? e.detail : undefined, icon: ICON[e.status] }))} />
        </ItemSection>
      </ItemMain>
      <ItemAside>
        <Card>
          <StageSteps stages={teachingManifest.pipeline.stages.filter((s) => s.id !== "preparing")} current={stage} reached={new Set(app.events.map((e) => stageOf(e.status)))} currentLabel={stage !== "applied" ? STATUS_LABEL[app.status] : undefined} />
          <p className="mt-2 text-[12px] text-ink-4">{app.company} moves this on. You hear the moment they do.</p>
        </Card>
        <Fold title="What you sent" hint={sent.resume ? "With your résumé" : undefined}>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 pb-2 text-[13px]">
            <dt className="text-ink-3">Name</dt>
            <dd className="truncate text-ink">{sent.name}</dd>
            <dt className="text-ink-3">Email</dt>
            <dd className="truncate text-ink">{sent.email}</dd>
            <dt className="text-ink-3">Subjects</dt>
            <dd className="truncate text-ink">{sent.profile.subjects.join(", ")}</dd>
            <dt className="text-ink-3">Grades</dt>
            <dd className="truncate text-ink">{gradesLabel(sent.profile.grades)}</dd>
            {sent.profile.qualifications.length > 0 && (
              <>
                <dt className="text-ink-3">Holds</dt>
                <dd className="truncate text-ink">{sent.profile.qualifications.join(", ")}</dd>
              </>
            )}
            {sent.resume && (
              <>
                <dt className="text-ink-3">Résumé</dt>
                <dd className="truncate text-ink">{sent.resume}</dd>
              </>
            )}
          </dl>
          {sent.coverNote && <p className="whitespace-pre-line border-t border-line pb-2 pt-2 text-[13px] text-ink-2">{sent.coverNote}</p>}
        </Fold>
        {canWithdraw(app.status) && (
          <Button variant="ghost" size="sm" icon={<Undo2 className="size-4" aria-hidden />} loading={busy} onClick={() => void withdraw()} className="text-danger-600">
            Withdraw application
          </Button>
        )}
      </ItemAside>
    </ItemPage>
  );
}
