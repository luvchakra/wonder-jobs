import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MODULES } from "@/modules/registry";
import { ModuleIconTile } from "@/wonderworks/brand/tiles";
import { SharedListingView } from "@/wonderworks/listing/SharedListingView";
import { BackButton } from "@/components/network/community";
import { sharedListing } from "@/server/share/listing";

type Props = { params: Promise<{ module: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { module, id } = await params;
  const l = await sharedListing(module, id);
  return { title: l ? l.title : "No longer listed", robots: { index: false } };
}

/**
 * A listing a member shared, opened by someone signed in (owner, 2026-11-23: "on clicking, it takes users to logged out
 * page"): the same listing the public share page shows, inside the app, with a way back and the kind's own Find to act
 * on it there. Only what the listing's public page already shows to anyone.
 */
export default async function NetworkListingPage({ params }: Props) {
  const { module, id } = await params;
  const l = await sharedListing(module, id);
  const m = l ? MODULES.find((x) => x.id === l.module) : undefined;
  return (
    <div className="mx-auto max-w-3xl">
      <BackButton fallback="/app/network" label="Back" className="mb-3" />
      {l ? (
        <SharedListingView l={l} tile={m && <ModuleIconTile m={m} />}>
          {m && (
            <div className="mt-6">
              <Link href={`/app/m/${m.id}`} className="wj-gradient-bg wj-press inline-flex h-12 items-center justify-center gap-2 rounded-[12px] px-6 text-[15px] font-semibold text-white shadow-brand hover:brightness-105">
                Find it in {m.label} <ArrowRight className="size-4" aria-hidden />
              </Link>
              <p className="mt-3 text-[12px] text-ink-4">As it reads right now. Search {m.label} to save it, {m.id === "events" ? "RSVP" : "act on it"} and follow it in {m.pipeline.label}.</p>
            </div>
          )}
        </SharedListingView>
      ) : (
        <div className="rounded-[20px] border border-line bg-surface p-6 text-center">
          <h1 className="text-[20px] font-semibold text-ink">This listing is no longer available</h1>
          <p className="mt-2 text-[14px] text-ink-3">It may have closed, been filled or been taken down.</p>
        </div>
      )}
    </div>
  );
}
