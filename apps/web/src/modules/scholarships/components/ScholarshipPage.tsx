"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Award, Bookmark, CalendarDays, Clock, ExternalLink, GraduationCap, MapPin, ShieldCheck } from "lucide-react";
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
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { deadlineLabel, durationLabel, GENDER_LABEL, KIND_LABEL, levelsLabel, outsideStatus, OUTSIDE_LABEL, PROVIDER_LABEL, shortDate, valueLabel, WORK_MODE_LABEL, type ScholarshipListing } from "../domain";
import { money } from "@/wonderworks/listing/terms";
import { useScholarshipsStore } from "../store";
import { shareOf } from "../share";
import { ApplyButton, FIT, SCAM_LINE, useMatch } from "./Listing";

const noop = () => () => undefined;
const FIND = { href: "/app/m/scholarships", label: "Scholarships & Projects" };

/**
 * One scholarship's or project's own page, as a job's page is on Jobs (wonderworks/listing/): its head and the
 * eligibility pill, Why you may be eligible, About it, then Eligibility, Award or Project terms, Documents, How to apply,
 * Provider and Source, and the official link; beside them Apply and, once its official page was opened, Mark as
 * applied / withdrawn. Shown from what the student saw: their saves and applications, else their last search.
 */
export function ScholarshipPage({ id }: { id: string }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const l = useScholarshipsStore((s) => findListing(s, id)) as ScholarshipListing | undefined;
  if (!mounted) return <PageLoading rows={3} />;
  if (!l)
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={FIND} title="Not found" />
        <EmptyState title="This isn't in your results" body="It may have left your last search, or its deadline passed. Search again to find it." action={{ label: "Back to Scholarships & Projects", href: FIND.href }} />
      </div>
    );
  return <Page l={l} />;
}

function Terms({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-ink-4">{k}</dt>
          <dd className="font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Page({ l }: { l: ScholarshipListing }) {
  const saved = useScholarshipsStore((s) => !!s.saved[l.id]);
  const ref = useScholarshipsStore((s) => s.responses[l.id]);
  const toggle = useScholarshipsStore((s) => s.toggleSaved);
  const setResponse = useScholarshipsStore((s) => s.setResponse);
  const m = useMatch(l);
  const fit = m.fit === "unknown" ? null : FIT[m.fit];
  const status = outsideStatus(ref);
  const long = isLongText(l.description);
  const [expanded, setExpanded] = useState(false);
  const t = l.terms;
  const outside = l.origin === "outside";
  const noun = KIND_LABEL[t.kind].toLowerCase();

  const mark = (outcome: "applied" | "withdrawn") => {
    setResponse(l.id, outcome, { status: outcome, item: l });
    toast.success(outcome === "applied" ? "Marked as applied" : "Marked as withdrawn", "It's in Applications.");
  };

  const eligibility: [string, string][] = [
    ["Level", levelsLabel(t)],
    ["Field", t.fields?.length ? t.fields.join(", ") : "Not stated"],
    ["Region", t.region || "Not stated"],
    ...(t.minMarks !== undefined ? ([["Minimum marks", `${t.minMarks}%`]] as [string, string][]) : []),
    ...(t.incomeLimit !== undefined ? ([["Family income", `Up to ${money(t.incomeLimit, t.currency)} a year`]] as [string, string][]) : []),
    ...(t.gender ? ([["Gender", `${GENDER_LABEL[t.gender]} students`]] as [string, string][]) : []),
    ...(t.categories?.length ? ([["Category", t.categories.join(", ")]] as [string, string][]) : []),
  ];
  const terms: [string, string][] =
    t.kind === "scholarship"
      ? [
          ["Award", valueLabel(t)],
          ["Provider", t.providerType ? PROVIDER_LABEL[t.providerType] : "Not stated"],
          ["Deadline", t.deadline ? shortDate(t.deadline) : "Not stated"],
          ["Renewable", t.renewable ? "Yes" : "Not stated"],
        ]
      : [
          ["Stipend", valueLabel(t)],
          ["Duration", durationLabel(t)],
          ["Deadline", t.deadline ? shortDate(t.deadline) : "Not stated"],
          ["Where", l.workMode === "remote" ? WORK_MODE_LABEL.remote : [l.location, l.workMode ? WORK_MODE_LABEL[l.workMode] : null].filter(Boolean).join(" · ") || "Not stated"],
          ...(t.teamSize ? ([["Team size", String(t.teamSize)]] as [string, string][]) : []),
          ...(t.mentor ? ([["Mentor", t.mentor]] as [string, string][]) : []),
          ...(t.deliverable ? ([["Deliverable", t.deliverable]] as [string, string][]) : []),
          ["Certificate", t.certificate ? "Yes, on completion" : "Not stated"],
        ];

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
            <span key="k">{KIND_LABEL[t.kind]}</span>,
            <span key="$" className="inline-flex items-center gap-1">
              <Award className="size-3.5" aria-hidden /> {valueLabel(t)}
            </span>,
            <span key="d" className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden /> {deadlineLabel(t)}
            </span>,
            t.levels?.length && (
              <span key="l" className="inline-flex items-center gap-1">
                <GraduationCap className="size-3.5" aria-hidden /> {levelsLabel(t)}
              </span>
            ),
            l.location && (
              <span key="p" className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> {l.location}
              </span>
            ),
            l.postedAt && (
              <span key="t" className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden /> {relativeTime(l.postedAt)}
              </span>
            ),
          ]}
        />
        {(fit || status) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {fit && (
              <span title={fit.title} className={cn("rounded-full px-2.5 py-1 text-[12px] font-semibold", fit.tone)}>
                {fit.word}
              </span>
            )}
            {status && (
              <Link href="/app/m/scholarships/pipeline">
                <Badge tone={status === "applied" ? "success" : "neutral"}>{OUTSIDE_LABEL[status]}</Badge>
              </Link>
            )}
          </div>
        )}
        <Fold className="mt-4" title="Why you may be eligible" hint={m.signals.length ? undefined : "Add your details to compare"}>
          {m.signals.length ? (
            <>
              <ul className="flex flex-col gap-2">
                {m.signals.map((x) => (
                  <li key={x.text} className="flex gap-2 text-[14px]">
                    <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", x.tone === "good" ? "bg-success-600" : "bg-warning-600")} aria-hidden />
                    <span className="text-ink-2">{x.text}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] text-ink-4">Only from what the {noun} states and your details. {l.company} decides who is selected.</p>
            </>
          ) : (
            <p className="text-sm text-ink-3">
              Wonder compares what a {noun} states with your level, field, marks and region. Add them in <Link href="/app/m/scholarships/you/profile" className="font-medium text-brand-600 hover:underline">Scholarships & Projects → You</Link>.
            </p>
          )}
        </Fold>
        <h2 className="mt-4 text-[15px] font-semibold text-ink">About the {noun}</h2>
        <ClampedText text={l.description || "The listing shares no description."} long={long} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
        {(expanded || !long) && (
          <>
            <div className="mt-3 flex min-w-0 flex-col gap-3">
              <Fold title="Eligibility" hint={levelsLabel(t)}>
                <Terms rows={eligibility} />
              </Fold>
              <Fold title={t.kind === "scholarship" ? "Award" : "Project terms"} hint={valueLabel(t)}>
                <Terms rows={terms} />
                <p className="mt-3 text-[12px] text-ink-4">{l.termsFrom === "company" ? `As ${l.company} posted it on WonderWorks.` : `Only what the listing itself states, from ${l.sourceName}.`}</p>
              </Fold>
              <Fold title="Documents" hint={t.documents?.length ? `${t.documents.length} listed` : "Not stated"}>
                {t.documents?.length ? (
                  <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-2">
                    {t.documents.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-ink-3">The listing doesn&apos;t list documents. Check the official page.</p>
                )}
              </Fold>
              <Fold title="How to apply" hint={outside ? "On the official page" : "On WonderWorks"}>
                <p className="text-[13px] text-ink-2">
                  {outside
                    ? `Apply on ${l.company}'s official page. WonderWorks doesn't apply for you there; mark it applied to track it.`
                    : `Press Apply. ${l.company} gets your details${(l.questions ?? []).length ? ` and your answers to its ${(l.questions ?? []).length === 1 ? "question" : `${(l.questions ?? []).length} questions`}` : ""}.`}
                </p>
              </Fold>
              <CompanyFold job={{ company: l.company }} />
              <Fold title="Source" hint={`Via ${l.sourceName}`}>
                <p className="text-[13px] text-ink-2">
                  {l.origin === "wonderstar" ? `Posted on WonderWorks by ${l.company}${l.companyVerified ? "" : ", not verified yet"}.` : `Found on ${l.sourceName}.`}
                  {l.postedAt ? ` Posted ${relativeTime(l.postedAt)}.` : ""}
                </p>
                {l.notice && <p className="mt-2 text-[12px] text-ink-4">{l.notice}</p>}
              </Fold>
            </div>
            {t.officialUrl && (
              <a href={t.officialUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-9 items-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">
                Official page <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
          </>
        )}
      </ListingMain>

      <ListingAside>
        <ApplyButton listing={l} full />
        {outside && status !== null && <OutcomeButtons outcome={status === "applied" || status === "withdrawn" ? status : null} onMark={mark} />}
        <p className="flex gap-1.5 text-[12px] text-ink-3">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {SCAM_LINE}
        </p>
      </ListingAside>
    </ListingPage>
  );
}
