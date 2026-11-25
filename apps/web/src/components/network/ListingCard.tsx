"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { networkApi, type ListingPreview } from "@/services/network/client";
import { cn } from "@/lib/cn";

/** A listing's public page (`/s/<module>/<id>`), opened by a member, is its signed-in view inside the app (owner,
 * 2026-11-23: "on clicking, it takes users to logged out page"). */
export const inAppListing = (page: string) => (page.startsWith("/s/") ? `/app/network/listing/${page.slice(3)}` : page);

function Box({ link, page, className, children }: { link: boolean; page: string; className: string; children: React.ReactNode }) {
  return link ? (
    <Link href={inAppListing(page)} className={className}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

/**
 * A post's attached listing, as rich as its page (owner, 2026-11-21: "make it richer, show more content"): its image,
 * title, who it's from, its facts and the start of its description, read when the card shows. While it loads, or when
 * the listing is gone, the one line the post kept.
 */
export function ListingCard({ page, fallback, moduleLabel, link = true }: { page: string; fallback?: string; moduleLabel: string; /** False in the post sheet, where the card shows what goes rather than opening it. */ link?: boolean }) {
  const [p, setP] = useState<ListingPreview | null | undefined>(undefined);
  const [pic, setPic] = useState(true);
  useEffect(() => {
    let live = true;
    void networkApi.preview(page).then((x) => live && setP(x));
    return () => {
      live = false;
    };
  }, [page]);
  if (!p)
    return (
      <Box link={link} page={page} className={cn("mt-2 flex items-center gap-3 rounded-[14px] border border-line bg-surface-2 p-3 hover:bg-bg-soft", p === undefined && "animate-pulse")}>
        <Link2 className="size-4 shrink-0 text-brand-600" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-ink">{fallback || "See the listing"}</span>
          {moduleLabel && <span className="block text-[11.5px] text-ink-3">{moduleLabel}</span>}
        </span>
      </Box>
    );
  return (
    <Box link={link} page={page} className={cn("mt-2 block overflow-hidden rounded-[14px] border border-line bg-surface", link && "hover:bg-bg-soft")}>
      {pic && p.image && (
        // eslint-disable-next-line @next/next/no-img-element -- the listing's own preview card, from its public page
        <img src={p.image} alt="" loading="lazy" onError={() => setPic(false)} className="aspect-[1.91/1] w-full border-b border-line bg-surface-2 object-cover" />
      )}
      <span className="flex flex-col gap-1 p-3">
        <span className="line-clamp-2 text-[14.5px] font-semibold leading-snug text-ink">{p.title}</span>
        {(p.by || p.facts) && <span className="line-clamp-2 text-[12.5px] text-ink-2">{[p.by, p.facts].filter(Boolean).join(" · ")}</span>}
        {p.summary && <span className="line-clamp-3 text-[12.5px] leading-relaxed text-ink-3">{p.summary}</span>}
        <span className="mt-1 flex items-center justify-between text-[12px]">
          <span className="text-ink-3">{moduleLabel}</span>
          {link && <span className="font-semibold text-brand-600">Open</span>}
        </span>
      </span>
    </Box>
  );
}
