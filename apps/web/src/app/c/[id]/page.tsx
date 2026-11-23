import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Globe2, MessageCircle, Sparkles, UsersRound } from "lucide-react";
import { authConfigured } from "@/lib/auth/config";
import { getSession } from "@/server/auth";
import { MarketingNav } from "@/components/landing/MarketingNav";
import { MarketingFooter } from "@/components/landing/Sections";
import { moduleById } from "@/modules/registry";
import { excerpt } from "@/wonderworks/listing/share";
import { communityCard } from "@/server/network/communities";

export const runtime = "nodejs";

type Props = { params: Promise<{ id: string }> };

/** The preview card's words: a public community's name and about. A private one shares nothing about itself. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const c = await communityCard(id, true);
  if (!c) return { title: "A community on WonderWorks", robots: { index: false } };
  const description = [`${c.members} member${c.members === 1 ? "" : "s"}`, excerpt(c.about, 160)].filter(Boolean).join(" — ");
  return { title: `${c.name} · community`, description, robots: { index: false }, openGraph: { title: c.name, description, type: "website", siteName: "WonderWorks" }, twitter: { card: "summary", title: c.name, description } };
}

/**
 * A community someone shared (owner, 2026-11-23: "add options to share community on the app and social media"). A public
 * community shows its name, what it's about and how many are in it, never who; joining takes an account. A private one
 * shows nothing about itself. Someone signed in goes straight to it inside the app.
 */
export default async function SharedCommunityPage({ params }: Props) {
  const { id } = await params;
  const inApp = `/app/network/communities/${encodeURIComponent(id)}`;
  if (authConfigured() && (await getSession().then(() => true, () => false))) redirect(inApp);
  const c = await communityCard(id, true);
  const next = encodeURIComponent(inApp);
  const m = c?.module ? moduleById(c.module) : undefined;
  return (
    <div className="bg-white text-ink">
      <MarketingNav />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-16 pt-24 sm:px-6">
        {c ? (
          <article className="overflow-hidden rounded-[20px] border border-line bg-surface">
            <div className="h-20 bg-gradient-to-r from-brand-500/90 via-brand-400/80 to-pink-400/80" aria-hidden />
            <div className="p-5 sm:p-7">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-600">Community on WonderWorks</p>
              <h1 className="mt-2 text-[26px] font-semibold leading-tight text-ink">{c.name}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-ink-2">
                <span className="inline-flex items-center gap-1">
                  <Globe2 className="size-4" aria-hidden /> Public
                </span>
                <span className="inline-flex items-center gap-1">
                  <UsersRound className="size-4" aria-hidden /> {c.members} member{c.members === 1 ? "" : "s"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageCircle className="size-4" aria-hidden /> {c.discussions} discussion{c.discussions === 1 ? "" : "s"}
                </span>
                {m && <span>· About {m.label}</span>}
              </p>
              {c.about && <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{c.about}</p>}
              <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <Link href={`/sign-up?next=${next}`} className="wj-gradient-bg wj-press inline-flex h-12 items-center justify-center gap-2 rounded-[12px] px-6 text-[15px] font-semibold text-white shadow-brand hover:brightness-105">
                  Join the community — it&apos;s free <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link href={`/sign-in?next=${next}`} className="inline-flex h-12 items-center justify-center rounded-[12px] border border-line px-5 text-[14px] font-medium text-ink hover:bg-bg-soft">
                  I have an account
                </Link>
              </div>
              <p className="mt-3 text-[12px] text-ink-4">Communities are on the WonderWorks Network. Join it with a free account to read the discussions and take part.</p>
            </div>
          </article>
        ) : (
          <div className="mx-auto max-w-2xl rounded-[20px] border border-line bg-surface p-6 text-center">
            <h1 className="text-[22px] font-semibold">A community on WonderWorks</h1>
            <p className="mt-2 text-[14px] text-ink-3">It&apos;s private, or no longer there. Sign in to see the communities you&apos;re in.</p>
            <Link href={`/sign-in?next=${next}`} className="wj-gradient-bg wj-press mt-4 inline-flex h-11 items-center rounded-[12px] px-5 text-[14px] font-semibold text-white shadow-brand">
              Sign in
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
