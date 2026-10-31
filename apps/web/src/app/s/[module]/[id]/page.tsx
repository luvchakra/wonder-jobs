import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Sparkles } from "lucide-react";
import { MarketingNav } from "@/components/landing/MarketingNav";
import { MarketingFooter } from "@/components/landing/Sections";
import { excerpt } from "@/wonderworks/listing/share";
import { sharedListing } from "@/server/share/listing";

export const runtime = "nodejs";

type Props = { params: Promise<{ module: string; id: string }> };

const present = (list: (string | null | undefined | false | 0)[] | undefined) => (list ?? []).filter((x): x is string => !!x);

/** The preview card's words: the headline facts first, then as much of the description as fits. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { module, id } = await params;
  const l = await sharedListing(module, id);
  if (!l) return { title: "No longer listed", robots: { index: false } };
  const description = [present(l.facts).join(" · "), excerpt(l.details, 160)].filter(Boolean).join(" — ") || "Found with WonderWorks.";
  return { title: l.title, description, robots: { index: false }, openGraph: { title: l.title, description, type: "website", siteName: "WonderWorks" }, twitter: { card: "summary_large_image", title: l.title, description } };
}

/**
 * A listing someone shared (owner, 2026-10-31): the listing as it is now — everything its card and page show — with an
 * account asked for only when an action needs one. The same words a shared message carries (`shareOf`).
 */
export default async function SharedListingPage({ params }: Props) {
  const { module, id } = await params;
  const l = await sharedListing(module, id);
  return (
    <div className="bg-white text-ink">
      <MarketingNav />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-16 pt-24 sm:px-6">
        {l ? (
          <article className="rounded-[20px] border border-line bg-surface p-5 sm:p-7">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-600">{l.noun}</p>
            <h1 className="mt-1 text-[26px] font-semibold leading-tight text-ink">{l.title}</h1>
            {present(l.facts).length > 0 && <p className="mt-2 text-[15px] text-ink-2">{present(l.facts).join(" · ")}</p>}
            {present(l.lines).length > 0 && (
              <ul className="mt-4 divide-y divide-line rounded-[14px] border border-line text-[14px]">
                {present(l.lines).map((line) => (
                  <li key={line} className="px-4 py-2.5 text-ink-2">
                    {line}
                  </li>
                ))}
              </ul>
            )}
            {l.details && <p className="mt-5 whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{l.details}</p>}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href={`/app/m/${l.module}`} className="wj-gradient-bg wj-press inline-flex h-11 items-center rounded-[12px] px-5 text-[14px] font-medium text-white shadow-brand hover:brightness-105">
                Open on WonderWorks
              </Link>
              {l.originalUrl && /^https?:\/\//i.test(l.originalUrl) && (
                <a href={l.originalUrl} target="_blank" rel="noreferrer noopener" className="inline-flex h-11 items-center gap-1.5 rounded-[12px] border border-line px-4 text-[14px] font-medium text-ink hover:bg-bg-soft">
                  Original posting{l.source ? ` on ${l.source}` : ""} <ExternalLink className="size-4" aria-hidden />
                </a>
              )}
            </div>
            <p className="mt-4 text-[12px] text-ink-4">As it reads right now. Sign in to WonderWorks to save it, apply, message or book.</p>
          </article>
        ) : (
          <div className="mx-auto max-w-2xl rounded-[20px] border border-line bg-surface p-6 text-center">
            <h1 className="text-[22px] font-semibold">This listing is no longer available</h1>
            <p className="mt-2 text-[14px] text-ink-3">It may have closed, been filled or been taken down. WonderWorks can find others like it.</p>
          </div>
        )}
        <p className="mt-6 inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-brand-600">
          <Sparkles className="size-3.5" aria-hidden /> Found with WonderWorks
        </p>
      </main>
      <MarketingFooter />
    </div>
  );
}
