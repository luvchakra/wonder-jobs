"use client";
import { ReportListing } from "./ReportListing";
import { Card } from "@/components/common/Card";
import { CompanyLogo } from "@/wonderworks/brand/CompanyLogo";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { ListingShare, type ListingShareProps } from "./ShareButton";
import { cn } from "@/lib/cn";

/**
 * A listing's own page, shared by every WonderWorks module (taken from Jobs' job page, app/app/jobs/[id]): the header
 * with Back and its actions (Share, Save), a notice slot (closed, hidden), then `ListingMain` (the head, why it fits, the
 * description and the folds under it) and `ListingAside` (Apply first, then the résumé and the outcome), which stays in
 * view on a wide screen. A module brings only what goes in each.
 */
export function ListingPage({ back, title, share, actions, notice, report, children }: { back: { href: string; label: string }; title: string; /** Share, at the top beside Save: what to share, or null where the module draws its own (Jobs). */ share: ListingShareProps | null; actions?: React.ReactNode; notice?: React.ReactNode; /** "Report this listing" at the foot (2026-11-03): the module and the listing id its Find serves. */ report?: { module: string; id: string }; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        back={back}
        title={title}
        actions={
          share ? (
            <div className="flex items-center gap-2">
              <ListingShare {...share} className="size-10 border border-line bg-surface text-ink-2" />
              {actions}
            </div>
          ) : (
            actions
          )
        }
      />
      {notice}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-x-5">{children}</div>
      {report && <ReportListing module={report.module} id={report.id} title={title} />}
    </div>
  );
}

/** The listing's main card. */
export function ListingMain({ children }: { children: React.ReactNode }) {
  return <Card className="min-w-0 lg:col-start-1">{children}</Card>;
}

/** The listing's actions, beside the main card on a wide screen (and kept in view), under it on a phone. */
export function ListingAside({ children }: { children: React.ReactNode }) {
  return (
    <aside className="lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
      <Card className="flex flex-col gap-2">{children}</Card>
    </aside>
  );
}

/** The head: the logo, the company line (with what's known of it), and the listing's facts in one wrapping row. */
export function ListingHead({ company, domain, website, name, hideName, icon, facts }: { company: string; domain?: string; /** The organisation's own website, when there's no domain: finds its logo (a job board's or shared host is ignored). */ website?: string; /** The company line; the company's name when not given. */ name?: React.ReactNode; /** No company line at all (a listing that names no organiser): the facts take its place. */ hideName?: boolean; /** A tile in place of the logo, for a listing with no organiser or site to take one from. */ icon?: React.ReactNode; facts: React.ReactNode[] }) {
  return (
    <div className="flex items-start gap-3">
      {icon ? <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</span> : <CompanyLogo name={company} domain={domain} website={website} logo size={40} />}
      <div className="min-w-0 flex-1">
        {!hideName && <p className="text-[15px] font-semibold text-ink">{name ?? company}</p>}
        <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3", hideName ? "min-h-10" : "mt-0.5")}>{facts.filter(Boolean)}</div>
      </div>
    </div>
  );
}

/** A description long enough to fold: more than about six lines. */
export const isLongText = (text: string) => text.length > 280 || text.split("\n").length > 6;

/** The description, six lines until More opens the rest (and the folds under it). */
export function ClampedText({ text, long = isLongText(text), expanded, onToggle, lang, dir, className }: { text: string; /** Whether it folds; from the text shown when not given. */ long?: boolean; expanded: boolean; onToggle: () => void; lang?: string; dir?: string; className?: string }) {
  return (
    <>
      <p lang={lang} dir={dir} className={cn("mt-2 whitespace-pre-line text-[14px] leading-relaxed text-ink-2", !expanded && "line-clamp-6", className)}>
        {/* List items arrive as "- " lines (their sources' bullets): shown as bullets, like the source page. */}
        {text.replace(/^[-*] /gm, "• ")}
      </p>
      {long && (
        <button type="button" aria-expanded={expanded} onClick={onToggle} className="mt-1 inline-flex min-h-10 items-center text-[13px] font-medium text-brand-600 hover:underline">
          {expanded ? "Less" : "More"}
        </button>
      )}
    </>
  );
}
