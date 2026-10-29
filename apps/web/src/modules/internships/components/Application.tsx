"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckCircle2, ExternalLink, Send, Star, Trash2, Trophy, Undo2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge, type Tone } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { CompanyLogo } from "@/components/common/Avatar";
import { Fold } from "@/components/common/Fold";
import { EmptyState, ErrorState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { StageTimeline } from "@/wonderworks/pipeline/parts";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { call } from "../api";
import { internshipsManifest } from "../manifest";
import { canWithdraw, durationLabel, shortDate, stageOf, startLabel, STATUS_LABEL, stipendLabel, WORK_MODE_LABEL, type InternshipListing, type InternshipStatus, type MyInternshipApplicationDetail } from "../domain";
import { useInternshipsStore } from "../store";

const noop = () => () => undefined;
const BACK = { href: "/app/m/internships/pipeline", label: "Applications" };

const TONE: Record<InternshipStatus, Tone> = { applied: "info", shortlisted: "brand", offer: "success", accepted: "success", closed: "neutral", withdrawn: "neutral" };
const ICON = { applied: Send, shortlisted: Star, offer: Trophy, accepted: CheckCircle2, closed: XCircle, withdrawn: Undo2 } as const;

/** What each move reads as on the timeline, in the student's words. */
function eventTitle(status: InternshipStatus, company: string) {
  switch (status) {
    case "applied":
      return "Applied";
    case "shortlisted":
      return `Shortlisted by ${company}`;
    case "offer":
      return `Offer from ${company}`;
    case "accepted":
      return "Offer accepted";
    case "closed":
      return `${company} isn't moving forward`;
    default:
      return "Withdrawn";
  }
}

/**
 * The stages as Pipeline has them, the one it's in lit and each one it actually passed through ticked (from its
 * timeline); the company moves it on, so they read, not toggle.
 */
function Stages({ status, reached }: { status: InternshipStatus; reached: Set<string> }) {
  const stages = internshipsManifest.pipeline.stages;
  const at = stages.findIndex((s) => s.id === stageOf(status));
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] font-medium text-ink-2">Status</p>
      <ol aria-label="Stages" className="grid grid-cols-2 gap-1.5">
        {stages.map((s, i) => (
          <li key={s.id} aria-current={i === at ? "step" : undefined} className={cn("flex min-h-[48px] items-center justify-center gap-1.5 rounded-[12px] border px-1 text-center text-[12px] font-medium", i === at ? "border-brand-400 bg-brand-50 text-brand-700" : i < at && reached.has(s.id) ? "border-line bg-surface text-ink-2" : "border-line bg-surface text-ink-4")}>
            {i < at && reached.has(s.id) && <CheckCircle2 className="size-3.5 shrink-0 text-success-600" aria-hidden />}
            {i === at && i === stages.length - 1 ? STATUS_LABEL[status] : s.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * One Internships application, in Jobs' application layout (app/app/applications/[id]): the internship and where it
 * stands, its timeline, and beside them the status with the one action it needs, and what was sent. A WonderWorks
 * application comes from the server (what the company actually did); an outside one is the student's own mark that they
 * applied on the employer's page, kept on this device's Internships store.
 */
export function InternshipApplication({ id }: { id: string }) {
  const router = useRouter();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const outsideRef = useInternshipsStore((s) => s.responses[id]);
  const outsideItem = useInternshipsStore((s) => s.items[id]) as InternshipListing | undefined;
  const outside = mounted && outsideRef && outsideItem?.origin === "outside" ? { ref: outsideRef, item: outsideItem } : null;
  const [app, setApp] = useState<MyInternshipApplicationDetail | null>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    call<{ application: MyInternshipApplicationDetail }>(`/api/m/internships/applications/${encodeURIComponent(id)}`)
      .then((r) => setApp(r.application))
      .catch((e: Error & { status?: number }) => setError({ message: e.message, status: e.status }));
  // Only once the store is read: an outside application never asks the server.
  const isOutside = !!outside;
  useEffect(() => {
    if (mounted && !isOutside) void load();
  }, [mounted, isOutside]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return <PageLoading rows={3} />;

  if (outside) {
    const l = outside.item;
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader back={BACK} title={`${l.title} · ${l.company}`} actions={<Badge tone="info">Applied on their site</Badge>} />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <Facts company={l.company} line={[l.location, l.workMode ? WORK_MODE_LABEL[l.workMode] : null, stipendLabel(l.terms), durationLabel(l.terms)]} start={startLabel(l.terms)} />
              {l.applyUrl && (
                <a href={l.applyUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">
                  Original posting <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
              <p className="mt-3 text-[13px] text-ink-3">Marked applied {formatDate(outside.ref.at)} · from {l.sourceName}</p>
            </Card>
            <Card>
              <h2 className="mb-3 text-[15px] font-semibold text-ink">Timeline</h2>
              <StageTimeline events={[{ id: "applied", at: outside.ref.at, title: "Applied on their site", detail: "Marked applied by you", icon: Send }]} />
            </Card>
          </div>
          <aside className="flex flex-col gap-4">
            <Card>
              <p className="text-[13px] text-ink-3">{l.company} doesn&apos;t tell WonderWorks how this goes. Their replies come to you directly.</p>
            </Card>
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 className="size-4" aria-hidden />}
              className="text-danger-600"
              onClick={() => {
                useInternshipsStore.setState((s) => ({ responses: Object.fromEntries(Object.entries(s.responses).filter(([k]) => k !== id)) }));
                toast.success("Removed from Applications");
                router.push(BACK.href);
              }}
            >
              Remove from Applications
            </Button>
          </aside>
        </div>
      </div>
    );
  }

  if (error)
    return error.status === 404 ? (
      <div>
        <PageHeader back={BACK} title="Application not found" />
        <EmptyState title="This application isn't available" action={{ label: "Back to Applications", href: BACK.href }} />
      </div>
    ) : (
      <ErrorState title="Couldn't load this application" body={error.message} actions={[{ label: "Try again", onClick: () => (setError(null), void load()) }]} />
    );
  if (!app) return <PageLoading rows={3} />;

  const act = async (action: "withdraw" | "accept") => {
    setBusy(true);
    try {
      await call(`/api/m/internships/applications/${encodeURIComponent(app.id)}`, { body: { action } });
      toast.success(action === "accept" ? "Offer accepted" : app.status === "offer" ? "Offer declined" : "Withdrawn", action === "accept" ? "The company sees that you accepted." : "The company sees it as withdrawn.");
      await load();
    } catch (e) {
      toast.error("Couldn't do that", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const offer = app.status === "offer";
  const sent = app.sent;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader back={BACK} title={`${app.title} · ${app.company}`} actions={<Badge tone={TONE[app.status]}>{STATUS_LABEL[app.status]}</Badge>} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <Facts company={app.company} line={[app.location, WORK_MODE_LABEL[app.workMode], stipendLabel(app.terms), durationLabel(app.terms)]} start={startLabel(app.terms)} />
            <p className="mt-3 text-[13px] text-ink-3">
              Applied {formatDate(app.appliedAt)} on WonderWorks
              {app.terms.applyBy && app.status === "applied" ? ` · Applications close ${shortDate(app.terms.applyBy)}` : ""}
            </p>
            {app.description && (
              <Fold title="About the internship" className="mt-3">
                <p className="whitespace-pre-line pb-2 text-[13px] text-ink-2">{app.description}</p>
              </Fold>
            )}
          </Card>
          <Card>
            <h2 className="mb-3 text-[15px] font-semibold text-ink">Timeline</h2>
            <StageTimeline events={app.events.map((e) => ({ id: e.id, at: e.at, title: eventTitle(e.status, app.company), detail: e.detail && e.detail !== eventTitle(e.status, app.company) ? e.detail : undefined, icon: ICON[e.status] }))} />
          </Card>
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <Stages status={app.status} reached={new Set(app.events.map((e) => stageOf(e.status)))} />
            {offer ? (
              <div className="mt-3 flex gap-2">
                <Button size="sm" full loading={busy} onClick={() => void act("accept")} aria-label={`Accept the offer from ${app.company}`}>
                  Accept offer
                </Button>
                <Button size="sm" variant="outline" loading={busy} onClick={() => void act("withdraw")} aria-label={`Decline the offer from ${app.company}`}>
                  Decline
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-[12px] text-ink-4">{app.company} moves this on. You hear the moment they do.</p>
            )}
          </Card>
          <Fold title="What you sent" hint={sent.resume ? "With your résumé" : undefined}>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 pb-2 text-[13px]">
              <dt className="text-ink-3">Name</dt>
              <dd className="truncate text-ink">{sent.name}</dd>
              <dt className="text-ink-3">Email</dt>
              <dd className="truncate text-ink">{sent.email}</dd>
              {sent.profile.college && (
                <>
                  <dt className="text-ink-3">College</dt>
                  <dd className="truncate text-ink">{sent.profile.college}</dd>
                </>
              )}
              {sent.profile.course && (
                <>
                  <dt className="text-ink-3">Course</dt>
                  <dd className="truncate text-ink">
                    {sent.profile.course}
                    {sent.profile.graduationYear ? ` · ${sent.profile.graduationYear}` : ""}
                  </dd>
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
          {!offer && canWithdraw(app.status) && (
            <Button variant="ghost" size="sm" icon={<Undo2 className="size-4" aria-hidden />} loading={busy} onClick={() => void act("withdraw")} className="text-danger-600">
              Withdraw application
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}

/** The internship's head: logo, company, and its facts in one line. */
function Facts({ company, line, start }: { company: string; line: (string | null | undefined)[]; start: string }) {
  return (
    <div className="flex items-start gap-4">
      <CompanyLogo name={company} logo size={52} />
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-semibold text-ink">{company}</p>
        <p className="text-[13px] text-ink-3">{line.filter(Boolean).join(" · ")}</p>
        <p className="text-[13px] text-ink-3">{start}</p>
      </div>
    </div>
  );
}
