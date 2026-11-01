"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useHydration } from "@/store/hydration";
import { cleanDomain, companyKey } from "@/domain/jobslake/companies";

/**
 * Company logos, for every WonderWorks module (owner, 2026-11-01): an employer, a school, an event's organiser or the
 * event itself, a practice, a seller. One company directory holds each company once, by its domain, with its logo
 * stored and cached; every module's cards and listing pages ask it the same way, through this tile.
 */

/** Bumped when how logos are found or served changes, so a browser's cached "no logo" from before is not reused. */
const LOGO_VERSION = 3;

/**
 * The one URL a company's logo is served at: by its domain (a website or its address, cleaned) when it's known, else by
 * its normalized name. Every module asking for the same company gets the same URL, so the same cached copy. Null when
 * there's nothing to ask by.
 */
export function companyLogoSrc(q: { name?: string; domain?: string; website?: string }): string | null {
  const domain = cleanDomain(q.domain) ?? cleanDomain(q.website);
  if (domain) return `/api/company-logo?d=${encodeURIComponent(domain)}&v=${LOGO_VERSION}`;
  const key = companyKey(q.name ?? "");
  return key ? `/api/company-logo?n=${encodeURIComponent(key)}&v=${LOGO_VERSION}` : null;
}

/**
 * Company tile: the company's logo from the directory when it has one (`logo`), else its initial on the company's
 * colour. A logo that isn't there just leaves the initial, never a guess. `domain` or `website` (either form: a URL or
 * a bare domain) finds the company exactly; the name is the fallback.
 */
export function CompanyLogo({ name, color, size = 40, className, logo, domain, website }: { name: string; color?: string; size?: number; className?: string; logo?: boolean; domain?: string; website?: string }) {
  const [failed, setFailed] = useState(false);
  const known = !!name.trim() && name !== "?" && name !== "Unknown company";
  // The image waits for hydration, so a logo that fails before React is listening still falls back to the initial.
  const ready = useHydration((h) => h.hydrated);
  const src = logo && known && ready && !failed ? companyLogoSrc({ name, domain, website }) : null;
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-line bg-surface font-bold", className)}
      style={{ width: size, height: size, color: color ?? "var(--wj-brand-600)", fontSize: Math.max(12, size * 0.42) }}
      aria-hidden="true"
    >
      {name.trim()[0]?.toUpperCase()}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- a small, CDN-cached icon from our own API; next/image adds nothing here
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 size-full bg-surface object-contain p-[12%]" />
      )}
    </span>
  );
}
