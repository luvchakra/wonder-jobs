"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckCircle2, ExternalLink, Send, Star, Trash2, Trophy, Undo2, XCircle } from "lucide-react";
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
import { internshipsManifest, listingHref } from "../manifest";
import { canWithdraw, MARK_LABEL, OUTSIDE_LABEL, outsideStatus, durationLabel, shortDate, stageOf, startLabel, STATUS_LABEL, stipendLabel, WORK_MODE_LABEL, type InternshipListing, type InternshipStatus, type MyInternshipApplicationDetail } from "../domain";
import { useInternshipsStore } from "../store";

const noop = () => () => undefined;
const BACK = { href: "/app/m/internships/pipeline", label: "Applications" };
const facts = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

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
 * One Internships application, on WonderWorks' item page (wonderworks/pipeline/item.tsx, Jobs' application layout): the
 * internship and its timeline, and beside them the status with the one action it needs, and what was sent. Internships
 * brings only its facts, moves and actions. A WonderWorks application comes from the server (what the company actually
 * did); an outside one is the student's own mark that they applied on the employer's page, kept on this device's
 * Internships store.
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
    const st = outsideStatus(outside.ref) ?? "applied";
    return (
      <ItemPage
        back={BACK}
        title={`${l.title} · ${l.company}`}
        badge={<Badge tone={st === "applied" ? "info" : "neutral"}>{OUTSIDE_LABEL[st]}</Badge>}
      >
        <ItemMain>
          <Card>
            <ItemHead company={l.company} lines={[facts([l.location, l.workMode ? WORK_MODE_LABEL[l.workMode] : null, stipendLabel(l.terms), durationLabel(l.terms)]), startLabel(l.terms)]}>
              {l.applyUrl && (
                <a href={l.applyUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">
                  Original posting <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
            </ItemHead>
            <p className="mt-3 text-[13px] text-ink-3">
              {st === "applied" ? "Marked applied" : st === "withdrawn" ? "Marked withdrawn" : "Preparing since"} {formatDate(outside.ref.at)} · from {l.sourceName} ·{" "}
              <Link href={listingHref(l.id)} className="font-medium text-brand-600 hover:underline">
                Internship details
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
              useInternshipsStore.getState().clearResponse(id);
              toast.success("Removed from Applications");
              router.push(BACK.href);
            }}
          >
            Remove from Applications
          </Button>
        </ItemAside>
      </ItemPage>
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
  const stage = stageOf(app.status);

  return (
    <ItemPage
      back={BACK}
      title={`${app.title} · ${app.company}`}
      badge={<Badge tone={TONE[app.status]}>{STATUS_LABEL[app.status]}</Badge>}
    >
      <ItemMain>
        <Card>
          <ItemHead company={app.company} lines={[facts([app.location, WORK_MODE_LABEL[app.workMode], stipendLabel(app.terms), durationLabel(app.terms)]), startLabel(app.terms)]} />
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
        <ItemSection title="Timeline">
          <StageTimeline events={app.events.map((e) => ({ id: e.id, at: e.at, title: eventTitle(e.status, app.company), detail: e.detail && e.detail !== eventTitle(e.status, app.company) ? e.detail : undefined, icon: ICON[e.status] }))} />
        </ItemSection>
      </ItemMain>
      <ItemAside>
        <Card>
          <StageSteps stages={internshipsManifest.pipeline.stages.filter((s) => s.id !== "preparing")} current={stage} reached={new Set(app.events.map((e) => stageOf(e.status)))} currentLabel={stage === "offer" && app.status !== "offer" ? STATUS_LABEL[app.status] : undefined} />
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
      </ItemAside>
    </ItemPage>
  );
}
