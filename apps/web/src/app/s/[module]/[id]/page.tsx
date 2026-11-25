import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authConfigured } from "@/lib/auth/config";
import { getSession } from "@/server/auth";
import { ArrowRight, Sparkles } from "lucide-react";
import { MarketingNav } from "@/components/landing/MarketingNav";
import { MarketingFooter } from "@/components/landing/Sections";
import { MODULES } from "@/modules/registry";
import { ModuleIconTile } from "@/wonderworks/brand/tiles";
import { distinctText, excerpt } from "@/wonderworks/listing/share";
import { SharedListingView, present } from "@/wonderworks/listing/SharedListingView";
import { sharedListing } from "@/server/share/listing";


export const runtime = "nodejs";

type Props = { params: Promise<{ module: string; id: string }> };

/** The one thing a visitor does next, in each kind's own words (the same actions the in-app help names). */
const ACTION: Record<string, string> = {
  internships: "Apply",
  teaching: "Apply",
  services: "Request a quote",
  therapists: "Request a session",
  events: "RSVP",
  marketplace: "Message the seller",
};

/** The preview card's words: the headline facts first, then as much of the description as fits. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { module, id } = await params;
  const l = await sharedListing(module, id);
  if (!l) return { title: "No longer listed", robots: { index: false } };
  const description = [present(l.facts).join(" · "), excerpt(distinctText(l.title, l.details), 160)].filter(Boolean).join(" — ") || "Found with WonderWorks.";
  return { title: l.title, description, robots: { index: false }, openGraph: { title: l.title, description, type: "website", siteName: "WonderWorks" }, twitter: { card: "summary_large_image", title: l.title, description } };
}

/**
 * A listing someone shared (owner, 2026-10-31): the listing as it is now — everything its card and page show — with an
 * account asked for only when an action needs one. The same words a shared message carries (`shareOf`). The page's
 * one main action is the kind's own (Apply, Request a session, RSVP…); it takes the visitor through sign-in and on to
 * that kind's Find, where the listing is searched for. How it is tracked after is the kind's own Pipeline tab.
 */
export default async function SharedListingPage({ params }: Props) {
  const { module, id } = await params;
  // Someone signed in sees it inside the app instead, without the sign-up asks (owner, 2026-11-23).
  if (authConfigured() && (await getSession().then(() => true, () => false))) redirect(`/app/network/listing/${encodeURIComponent(module)}/${encodeURIComponent(id)}`);
  const l = await sharedListing(module, id);
  const m = l ? MODULES.find((x) => x.id === l.module) : undefined;
  const action = l ? (ACTION[l.module] ?? "Open") : "";
  const next = l ? encodeURIComponent(`/app/m/${l.module}`) : "";
  return (
    <div className="bg-white text-ink">
      <MarketingNav />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-16 pt-24 sm:px-6">
        {l ? (
          <>
            <SharedListingView l={l} tile={m && <ModuleIconTile m={m} />}>
              <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <Link href={`/sign-up?next=${next}`} className="wj-gradient-bg wj-press inline-flex h-12 items-center justify-center gap-2 rounded-[12px] px-6 text-[15px] font-semibold text-white shadow-brand hover:brightness-105">
                  {action} — it&apos;s free <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link href={`/sign-in?next=${next}`} className="inline-flex h-12 items-center justify-center rounded-[12px] border border-line px-5 text-[14px] font-medium text-ink hover:bg-bg-soft">
                  I have an account
                </Link>
              </div>
              <p className="mt-3 text-[12px] text-ink-4">As it reads right now. Create a free account to {action.toLowerCase()}, save it and keep track of it.</p>
            </SharedListingView>

            {m && (
              <section className="mt-6 rounded-[20px] border border-line bg-surface-2 p-5 sm:p-6" aria-labelledby="how">
                <h2 id="how" className="text-[16px] font-semibold text-ink">
                  What happens next on WonderWorks
                </h2>
                <ol className="mt-3 space-y-2 text-[14px] text-ink-2">
                  <li>
                    <span className="font-semibold text-ink">1. Search {m.label}.</span> Find this {l.noun} and others like it, in one place.
                  </li>
                  <li>
                    <span className="font-semibold text-ink">2. {action}.</span> From the listing, on your own account.
                  </li>
                  <li>
                    <span className="font-semibold text-ink">3. Follow it in {m.pipeline.label}:</span> {m.pipeline.stages.map((s) => s.label).join(" · ")}.
                  </li>
                </ol>
                <Link href={`/features#kind-${m.id}`} className="mt-3 inline-flex min-h-10 items-center gap-1 text-[13px] font-semibold text-brand-600 hover:underline">
                  See what {m.label} does <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </section>
            )}
          </>
        ) : (
          <div className="mx-auto max-w-2xl rounded-[20px] border border-line bg-surface p-6 text-center">
            <h1 className="text-[22px] font-semibold">This listing is no longer available</h1>
            <p className="mt-2 text-[14px] text-ink-3">It may have closed, been filled or been taken down. WonderWorks can find others like it.</p>
            <Link href="/sign-up" className="wj-gradient-bg wj-press mt-4 inline-flex h-11 items-center rounded-[12px] px-5 text-[14px] font-semibold text-white shadow-brand">
              Find others on WonderWorks
            </Link>
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
