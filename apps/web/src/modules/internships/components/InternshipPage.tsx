"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Bookmark, CalendarDays, Clock, ExternalLink, Hourglass, MapPin, Wallet } from "lucide-react";
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
import { durationLabel, outsideStatus, SCHEDULE_LABEL, shortDate, stipendLabel, WORK_MODE_LABEL, type InternshipListing } from "../domain";
import { useInternshipsStore } from "../store";
import { ApplyButton, FIT, useMatch } from "./Listing";

const noop = () => () => undefined;
const FIND = { href: "/app/m/internships", label: "Internships" };

/**
 * One internship's own page (owner, 2026-10-29), as a job's page is on Jobs and on WonderWorks' listing page
 * (wonderworks/listing/): its head and fit, Why it fits, About the internship, then under the whole description its
 * Terms, Skills, Company and Source folds and the original posting; beside them Apply, Generate Customized Resume and,
 * once Apply was opened on the company's site or a résumé was made, Mark as applied / withdrawn. Shown from what the
 * student saw: their saves and applications, else their last search.
 */
export function InternshipPage({ id }: { id: string }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const l = useInternshipsStore((s) => findListing(s, id)) as InternshipListing | undefined;
  if (!mounted) return <PageLoading rows={3} />;
  if (!l)
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={FIND} title="Internship not found" />
        <EmptyState title="This internship isn't in your results" body="It may have left your last search. Search again to find it." action={{ label: "Back to Internships", href: FIND.href }} />
      </div>
    );
  return <Page l={l} />;
}

function Page({ l }: { l: InternshipListing }) {
  const saved = useInternshipsStore((s) => !!s.saved[l.id]);
  const ref = useInternshipsStore((s) => s.responses[l.id]);
  const toggle = useInternshipsStore((s) => s.toggleSaved);
  const setResponse = useInternshipsStore((s) => s.setResponse);
  const m = useMatch(l);
  const fit = m.fit === "unknown" ? null : FIT[m.fit];
  const status = outsideStatus(ref);
  const long = isLongText(l.description);
  const [expanded, setExpanded] = useState(false);
  const outside = l.origin === "outside";
  // Asks how it went once Apply was opened on their site, a résumé was made for it, or it was already marked (as Jobs does).
  const asksOutcome = outside && status !== null;
  const stipend = l.terms.stipendMin || l.terms.stipendMax ? stipendLabel(l.terms) : null;

  const mark = (outcome: "applied" | "withdrawn") => {
    setResponse(l.id, outcome === "applied" ? "applied" : "accepted_closed", { status: outcome, item: l });
    toast.success(outcome === "applied" ? "Marked as applied" : "Marked as withdrawn", "It's in Applications.");
  };

  return (
    <ListingPage
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
            <span key="l" className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden /> {l.location || "Place not stated"}
            </span>,
            l.workMode && <span key="m">{WORK_MODE_LABEL[l.workMode]}</span>,
            l.terms.schedule && <span key="s">{SCHEDULE_LABEL[l.terms.schedule]}</span>,
            stipend && (
              <span key="$" className="inline-flex items-center gap-1">
                <Wallet className="size-3.5" aria-hidden /> {stipend}
              </span>
            ),
            l.terms.durationMonths && (
              <span key="d" className="inline-flex items-center gap-1">
                <Hourglass className="size-3.5" aria-hidden /> {durationLabel(l.terms)}
              </span>
            ),
            l.terms.startsOn && (
              <span key="st" className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" aria-hidden /> Starts {shortDate(l.terms.startsOn)}
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
              <Link href="/app/m/internships/pipeline">
                <Badge tone={status === "applied" ? "success" : "neutral"}>{status === "applied" ? "Applied" : status === "withdrawn" ? "Withdrawn" : "Preparing"}</Badge>
              </Link>
            )}
          </div>
        )}
        {/* Why it fits first, above the description, as on a job's page. */}
        <Fold className="mt-4" title="Why it fits" hint={m.signals.length ? undefined : "Add your Internships details and skills to compare"}>
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
              Wonder compares an internship with your skills, field and dates. Add them in <Link href="/app/m/internships/you/profile" className="font-medium text-brand-600 hover:underline">Internships → You</Link>.
            </p>
          )}
        </Fold>
        <h2 className="mt-4 text-[15px] font-semibold text-ink">About the internship</h2>
        <ClampedText text={l.description || "The posting shares no description."} long={long} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
        {/* With the whole description open: terms, skills, the company and where it's from, then the posting. */}
        {(expanded || !long) && (
          <>
            <div className="mt-3 flex min-w-0 flex-col gap-3">
              <Fold title="Terms" hint={[stipend, l.terms.durationMonths ? durationLabel(l.terms) : null].filter(Boolean).join(" · ") || undefined}>
                <dl className="grid grid-cols-2 gap-3 text-[13px]">
                  {[
                    ["Stipend", stipendLabel(l.terms)],
                    ["Duration", durationLabel(l.terms)],
                    ["Start", l.terms.startsOn ? shortDate(l.terms.startsOn) : "Not stated"],
                    ["Apply by", l.terms.applyBy ? shortDate(l.terms.applyBy) : "Not stated"],
                    ["Schedule", l.terms.schedule ? SCHEDULE_LABEL[l.terms.schedule] : "Not stated"],
                    ["Where", [l.location, l.workMode ? WORK_MODE_LABEL[l.workMode] : null].filter(Boolean).join(" · ") || "Not stated"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-ink-4">{k}</dt>
                      <dd className="font-medium text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-[12px] text-ink-4">{l.termsFrom === "company" ? `Terms as ${l.company} posted them on WonderWorks.` : `Only what the posting itself states, from ${l.sourceName}.`}</p>
              </Fold>
              {l.skills.length > 0 && (
                <Fold title="Skills" hint={l.skills.slice(0, 3).join(", ")}>
                  <ul className="flex flex-wrap gap-1.5">
                    {l.skills.map((k) => (
                      <li key={k}>
                        <Badge tone="brand">{k}</Badge>
                      </li>
                    ))}
                  </ul>
                </Fold>
              )}
              <CompanyFold job={{ company: l.company }} />
              <Fold title="Source" hint={`Via ${l.sourceName}`}>
                <p className="text-[13px] text-ink-2">
                  {l.origin === "wonderstar" ? `Posted on WonderWorks by ${l.company}${l.companyVerified ? "" : ", not verified yet"}.` : `Found on ${l.sourceName}.`}
                  {l.postedAt ? ` Posted ${relativeTime(l.postedAt)}.` : ""}
                </p>
              </Fold>
            </div>
            {/(…|\.\.\.)\s*$/.test(l.description) && <p className="mt-3 text-[13px] text-ink-3">This is the part the source shares.</p>}
            {l.applyUrl && (
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
          target={l}
          noun="internship"
          onMade={() => {
            // Made a résumé for it: it's one the student is preparing (unless they already marked it).
            if (outsideStatus(useInternshipsStore.getState().responses[l.id]) === null || status === "preparing") setResponse(l.id, "preparing", { status: "preparing", mark: "resume", item: l });
          }}
        />
        {asksOutcome && <OutcomeButtons outcome={status === "applied" || status === "withdrawn" ? status : null} onMark={mark} />}
      </ListingAside>
    </ListingPage>
  );
}
