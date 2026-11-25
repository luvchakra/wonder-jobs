import { ExternalLink } from "lucide-react";
import type { ListingShareProps } from "./ShareButton";
import { distinctText } from "./share";

/**
 * A shared listing as it reads now (`/s/<module>/<id>`'s content): its kind, title, facts, details, About, the original
 * posting and any credit. The public share page and the signed-in view of a listing a member shared (owner, 2026-11-23:
 * "on clicking, it takes users to logged out page") both show it, each with its own actions below (`children`).
 */
export function SharedListingView({ l, tile, children }: { l: ListingShareProps; tile?: React.ReactNode; children?: React.ReactNode }) {
  const lines = present(l.lines).map(split);
  const about = distinctText(l.title, l.details);
  return (
    <article className="rounded-[20px] border border-line bg-surface p-5 sm:p-7">
      <div className="flex items-center gap-2.5">
        {tile}
        <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-600">{l.noun}</p>
      </div>
      <h1 className="mt-3 text-[26px] font-semibold leading-tight text-ink">{l.title}</h1>
      {present(l.facts).length > 0 && <p className="mt-2 text-[15px] text-ink-2">{present(l.facts).join(" · ")}</p>}
      {lines.length > 0 && (
        <dl className="mt-4 divide-y divide-line rounded-[14px] border border-line text-[14px]">
          {lines.map(([k, v]) => (
            <div key={`${k}${v}`} className="grid gap-0.5 px-4 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
              {k && <dt className="text-ink-3">{k}</dt>}
              <dd className={k ? "font-medium text-ink" : "text-ink-2 sm:col-span-2"}>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {about && (
        <>
          <h2 className="mt-5 text-[15px] font-semibold text-ink">About</h2>
          <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{about}</p>
        </>
      )}
      {l.originalUrl && /^https?:\/\//i.test(l.originalUrl) && (
        <a href={l.originalUrl} target="_blank" rel="noreferrer noopener" className="mt-4 inline-flex min-h-10 items-center gap-1.5 text-[14px] font-medium text-brand-600 hover:underline">
          {l.originalLabel ?? originalLabel(l.originalUrl, l.source)} <ExternalLink className="size-4" aria-hidden />
        </a>
      )}
      {l.credit && <p className="mt-2 text-[12px] text-ink-4">{l.credit}</p>}
      {children}
    </article>
  );
}

export const present = (list: (string | null | undefined | false | 0)[] | undefined) => (list ?? []).filter((x): x is string => !!x);

/** "Languages: English, Hindi" → a label and its value; a line with no label is all value. */
function split(line: string): [string | null, string] {
  const at = line.indexOf(": ");
  return at > 0 && at <= 28 ? [line.slice(0, at), line.slice(at + 2)] : [null, line];
}

/**
 * The original link's words: "Original posting on <source>" for a named source, or the site's own name when the source is
 * our gateway (its name is ours, not the listing's: "Original page on tapahtumat.hel.fi").
 */
function originalLabel(url: string, source: string | undefined): string {
  if (source && !/WorksLake/i.test(source)) return `Original posting on ${source}`;
  try {
    return `Original page on ${new URL(url).hostname.replace(/^www\./, "")}`;
  } catch {
    return "Original posting";
  }
}
