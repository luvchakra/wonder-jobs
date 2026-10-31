"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Bookmark, CalendarCheck, Clock, ExternalLink, MapPin, Wallet } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { EmptyState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { findListing } from "@/wonderworks/store";
import { ClampedText, isLongText, ListingAside, ListingHead, ListingMain, ListingPage } from "@/wonderworks/listing/ListingPage";
import { CompanyFold } from "@/wonderworks/listing/CompanyFold";
import { OutcomeButtons } from "@/wonderworks/listing/OutcomeButtons";
import { ResumeButton } from "@/wonderworks/listing/ResumeButton";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { gradesLabel, HOURS_LABEL, outsideStatus, payLabel, WORK_MODE_LABEL, type TeachingListing } from "../domain";
import { useTeachingStore } from "../store";
import { ApplyButton, FIT, useMatch, shareOf } from "./Listing";

const noop = () => () => undefined;
const FIND = { href: "/app/m/teaching", label: "Teaching" };

/**
 * One teaching opening's own page, on WonderWorks' listing page (wonderworks/listing/): its head and fit, Why it fits,
 * About the role, then under the whole description its Terms, School and Source folds and the original posting; beside
 * them Apply, Generate Customized Resume and, once Apply was opened on the employer's site or a résumé was made, Mark
 * as applied / withdrawn. Shown from what the teacher saw: their saves and responses, else their last search.
 */
export function TeachingPage({ id }: { id: string }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const l = useTeachingStore((s) => findListing(s, id)) as TeachingListing | undefined;
  if (!mounted) return <PageLoading rows={3} />;
  if (!l)
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={FIND} title="Opening not found" />
        <EmptyState title="This opening isn't in your results" body="It may have left your last search. Search again to find it." action={{ label: "Back to Teaching", href: FIND.href }} />
      </div>
    );
  return <Page l={l} />;
}

function Page({ l }: { l: TeachingListing }) {
  const saved = useTeachingStore((s) => !!s.saved[l.id]);
  const ref = useTeachingStore((s) => s.responses[l.id]);
  const toggle = useTeachingStore((s) => s.toggleSaved);
  const setResponse = useTeachingStore((s) => s.setResponse);
  const m = useMatch(l);
  const fit = m.fit === "unknown" ? null : FIT[m.fit];
  const status = outsideStatus(ref);
  const long = isLongText(l.description);
  const [expanded, setExpanded] = useState(false);
  const outside = l.origin === "outside";
  const t = l.terms;
  const pay = t.payMin !== undefined || t.payMax !== undefined ? payLabel(t) : null;

  const mark = (outcome: "applied" | "withdrawn") => {
    setResponse(l.id, outcome, { status: outcome, item: l });
    toast.success(outcome === "applied" ? "Marked as applied" : "Marked as withdrawn", "It's in Pipeline.");
  };

  return (
    <ListingPage
      share={shareOf(l)}
      back={FIND}
      title={l.title}
      actions={
        <Button variant="outline" size="sm" icon={<Bookmark className="size-4" fill={saved ? "currentColor" : "none"} aria-hidden />} aria-pressed={saved} onClick={() => toggle(l.id, l)}>
          {saved ? "Saved" : "Save"}
        </Button>
      }
    >
      <ListingMain>
        <ListingHead
          company={l.company}
          name={
            <>
              {l.company}
              {l.origin === "wonderstar" && !l.companyVerified && <span className="font-normal text-ink-3"> · not verified yet</span>}
            </>
          }
          facts={[
            // An online job's place is just "Online": its work mode already says so.
            l.workMode !== "remote" && (
              <span key="l" className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> {l.location || "Place not stated"}
              </span>
            ),
            l.workMode && <span key="m">{WORK_MODE_LABEL[l.workMode]}</span>,
            t.hours && <span key="h">{HOURS_LABEL[t.hours]}</span>,
            t.demo && (
              <span key="d" className="inline-flex items-center gap-1 font-medium text-brand-700">
                <CalendarCheck className="size-3.5" aria-hidden /> Demo class
              </span>
            ),
            pay && (
              <span key="$" className="inline-flex items-center gap-1">
                <Wallet className="size-3.5" aria-hidden /> {pay}
              </span>
            ),
            l.postedAt && (
              <span key="p" className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden /> {relativeTime(l.postedAt)}
              </span>
            ),
          ]}
        />
        {(fit || status) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {fit && (
              <span title={fit.title} className={cn("rounded-full px-2.5 py-1 text-[12px] font-semibold", fit.tone)}>
                {fit.word} fit
              </span>
            )}
            {status && (
              <Link href="/app/m/teaching/pipeline">
                <Badge tone={status === "applied" ? "success" : "neutral"}>{status === "applied" ? "Applied" : status === "withdrawn" ? "Withdrawn" : "Preparing"}</Badge>
              </Link>
            )}
          </div>
        )}
        <Fold className="mt-4" title="Why it fits" hint={m.signals.length ? undefined : "Add your Teaching details to compare"}>
          {m.signals.length ? (
            <ul className="flex flex-col gap-2">
              {m.signals.map((x) => (
                <li key={x.text} className="flex gap-2 text-[14px]">
                  <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", x.tone === "good" ? "bg-success-600" : "bg-warning-600")} aria-hidden />
                  <span className="text-ink-2">{x.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">
              Wonder compares an opening with your subjects, grade levels, boards and qualifications. Add them in <Link href="/app/m/teaching/you/profile" className="font-medium text-brand-600 hover:underline">Teaching → You</Link>.
            </p>
          )}
        </Fold>
        <h2 className="mt-4 text-[15px] font-semibold text-ink">About the role</h2>
        <ClampedText text={l.description || "The posting shares no description."} long={long} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
        {(expanded || !long) && (
          <>
            <div className="mt-3 flex min-w-0 flex-col gap-3">
              <Fold title="Terms" hint={[t.subject, pay].filter(Boolean).join(" · ") || undefined}>
                <dl className="grid grid-cols-2 gap-3 text-[13px]">
                  {[
                    ["Subject", t.subject ?? "Not stated"],
                    ["Grades", t.grades?.length ? gradesLabel(t.grades) : "Not stated"],
                    ["Board", t.boards?.length ? t.boards.join(", ") : "Not stated"],
                    ["Asks for", t.requires?.length ? t.requires.join(", ") : "Not stated"],
                    ["Hours", t.hours ? HOURS_LABEL[t.hours] : "Not stated"],
                    ["Pay", payLabel(t)],
                    ...(l.origin === "wonderstar" ? [["Demo class", t.demo ? "Yes — the school may offer you times for a demo class after you apply" : "No"]] : []),
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-ink-4">{k}</dt>
                      <dd className="font-medium text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-[12px] text-ink-4">{l.termsFrom === "company" ? `Terms as ${l.company} posted them on WonderWorks.` : `Only what the posting itself states, from ${l.sourceName}.`}</p>
              </Fold>
              <CompanyFold job={{ company: l.company }} />
              <Fold title="Source" hint={`Via ${l.sourceName}`}>
                <p className="text-[13px] text-ink-2">
                  {l.origin === "wonderstar" ? `Posted on WonderWorks by ${l.company}${l.companyVerified ? "" : ", not verified yet"}.` : `Found on ${l.sourceName}.`}
                  {l.postedAt ? ` Posted ${relativeTime(l.postedAt)}.` : ""}
                </p>
              </Fold>
            </div>
            {/(…|\.\.\.)\s*$/.test(l.description) && <p className="mt-3 text-[13px] text-ink-3">This is the part the source shares.</p>}
            {l.applyUrl && outside && (
              <a href={l.applyUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-9 items-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">
                Read the full posting <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
          </>
        )}
      </ListingMain>

      <ListingAside>
        <ApplyButton listing={l} full />
        <ResumeButton
          target={{ ...l, skills: [t.subject, ...(t.requires ?? [])].filter((x): x is string => !!x) }}
          noun="opening"
          onMade={() => {
            if (status === null || status === "preparing") setResponse(l.id, "preparing", { status: "preparing", mark: "resume", item: l });
          }}
        />
        {outside && status !== null && <OutcomeButtons outcome={status === "applied" || status === "withdrawn" ? status : null} onMark={mark} />}
      </ListingAside>
    </ListingPage>
  );
}
