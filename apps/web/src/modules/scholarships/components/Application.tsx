"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Award, CheckCircle2, ExternalLink, Send, Star, Trash2, Undo2, XCircle } from "lucide-react";
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
import { listingHref, scholarshipsManifest } from "../manifest";
import { canWithdraw, deadlineLabel, KIND_LABEL, LEVEL_LABEL, OUTSIDE_LABEL, outsideStatus, shortDate, stageOf, STATUS_LABEL, valueLabel, type MyScholarshipApplicationDetail, type ScholarshipListing, type ScholarshipStatus } from "../domain";
import { useScholarshipsStore } from "../store";

const noop = () => () => undefined;
const BACK = { href: "/app/m/scholarships/pipeline", label: "Applications" };
const facts = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

const TONE: Record<ScholarshipStatus, Tone> = { applied: "info", shortlisted: "brand", accepted: "success", done: "success", declined: "neutral", withdrawn: "neutral" };
const ICON = { applied: Send, shortlisted: Star, accepted: Award, done: CheckCircle2, declined: XCircle, withdrawn: Undo2 } as const;

function eventTitle(status: ScholarshipStatus, company: string) {
  switch (status) {
    case "applied":
      return "Applied";
    case "shortlisted":
      return `Shortlisted by ${company}`;
    case "accepted":
      return `Awarded / selected by ${company}`;
    case "done":
      return "Completed";
    case "declined":
      return `Not selected by ${company}`;
    default:
      return "Withdrawn";
  }
}

/**
 * One application, on WonderWorks' item page (wonderworks/pipeline/item.tsx, Jobs' application layout): the listing
 * and its timeline, and beside them the stage, what was sent and Withdraw. A WonderWorks application comes from the
 * server (what the organisation actually did); an outside one is the student's own mark, kept in their module store.
 */
export function ScholarshipApplication({ id }: { id: string }) {
  const router = useRouter();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const outsideRef = useScholarshipsStore((s) => s.responses[id]);
  const outsideItem = useScholarshipsStore((s) => s.items[id]) as ScholarshipListing | undefined;
  const outside = mounted && outsideRef && outsideItem?.origin === "outside" ? { ref: outsideRef, item: outsideItem } : null;
  const [app, setApp] = useState<MyScholarshipApplicationDetail | null>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    call<{ application: MyScholarshipApplicationDetail }>(`/api/m/scholarships/applications/${encodeURIComponent(id)}`)
      .then((r) => setApp(r.application))
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
            <ItemHead company={l.company} domain={l.companyDomain} lines={[facts([KIND_LABEL[l.terms.kind], valueLabel(l.terms)]), deadlineLabel(l.terms)]}>
              {l.applyUrl && (
                <a href={l.applyUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">
                  Official page <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
            </ItemHead>
            <p className="mt-3 text-[13px] text-ink-3">
              Marked {OUTSIDE_LABEL[st].toLowerCase()} {formatDate(outside.ref.at)} · from {l.sourceName} ·{" "}
              <Link href={listingHref(l.id)} className="font-medium text-brand-600 hover:underline">
                Details
              </Link>
            </p>
          </Card>
          <ItemSection title="Timeline">
            <StageTimeline events={[{ id: st, at: outside.ref.at, title: OUTSIDE_LABEL[st], detail: "Marked by you", icon: st === "withdrawn" ? Undo2 : Send }]} />
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
              useScholarshipsStore.getState().clearResponse(id);
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

  const withdraw = async () => {
    setBusy(true);
    try {
      await call(`/api/m/scholarships/applications/${encodeURIComponent(app.id)}`, { body: { action: "withdraw" } });
      toast.success("Withdrawn", "The organisation sees it as withdrawn.");
      await load();
    } catch (e) {
      toast.error("Couldn't do that", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sent = app.sent;
  const stage = stageOf(app.status);
  const p = sent.profile;

  return (
    <ItemPage back={BACK} title={`${app.title} · ${app.company}`} badge={<Badge tone={TONE[app.status]}>{STATUS_LABEL[app.status]}</Badge>}>
      <ItemMain>
        <Card>
          <ItemHead company={app.company} lines={[facts([KIND_LABEL[app.terms.kind], valueLabel(app.terms)]), app.terms.deadline ? `Deadline ${shortDate(app.terms.deadline)}` : ""]} />
          <p className="mt-3 text-[13px] text-ink-3">Applied {formatDate(app.appliedAt)} on WonderWorks</p>
          {app.description && (
            <Fold title={`About the ${KIND_LABEL[app.terms.kind].toLowerCase()}`} className="mt-3">
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
          <StageSteps stages={scholarshipsManifest.pipeline.stages.filter((s) => s.id !== "saved" && s.id !== "preparing")} current={stage} reached={new Set(app.events.map((e) => stageOf(e.status)))} currentLabel={app.status === "declined" || app.status === "withdrawn" ? STATUS_LABEL[app.status] : undefined} />
          <p className="mt-2 text-[12px] text-ink-4">{app.company} moves this on. You hear the moment they do.</p>
        </Card>
        <Fold title="What you sent" hint={sent.resume ? "With your résumé" : undefined}>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 pb-2 text-[13px]">
            <dt className="text-ink-3">Name</dt>
            <dd className="truncate text-ink">{sent.name}</dd>
            <dt className="text-ink-3">Email</dt>
            <dd className="truncate text-ink">{sent.email}</dd>
            <dt className="text-ink-3">Studies</dt>
            <dd className="text-ink">{facts([p.level ? LEVEL_LABEL[p.level] : null, p.field, p.institution])}</dd>
            {p.incomeBand !== undefined || p.gender || p.category ? (
              <>
                <dt className="text-ink-3">Shared</dt>
                <dd className="text-ink">Income, gender and category, as you chose</dd>
              </>
            ) : null}
            {sent.resume && (
              <>
                <dt className="text-ink-3">Résumé</dt>
                <dd className="truncate text-ink">{sent.resume}</dd>
              </>
            )}
          </dl>
          {sent.answers.map((a) => (
            <p key={a.question} className="border-t border-line py-2 text-[13px] text-ink-2">
              <span className="block text-ink-4">{a.question}</span>
              {a.answer}
            </p>
          ))}
          {sent.statement && <p className="whitespace-pre-line border-t border-line pb-2 pt-2 text-[13px] text-ink-2">{sent.statement}</p>}
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
