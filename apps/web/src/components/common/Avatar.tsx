"use client";
import { useState } from "react";
import { getClientMode } from "@/lib/mode";
import { cn } from "@/lib/cn";
import { useUIStore } from "@/store/ui";
import { initials } from "@/lib/format";
import { useHydration } from "@/store/hydration";

/** A person's initials; with `self`, the signed-in candidate's own photo over them when they've added one. */
export function Avatar({ name, size = 36, className, self = false }: { name: string; size?: number; className?: string; self?: boolean }) {
  const version = useUIStore((s) => s.photoVersion);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  // Signed in is known only in the browser: the photo waits for hydration, so the server's HTML matches the first render.
  const ready = useHydration((h) => h.hydrated);
  const src = self && ready && failedAt !== version && getClientMode().mode === "user" ? `/api/avatar?v=${version}` : null;
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-400 to-pink-500 font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.38) }}
      aria-hidden="true"
    >
      {initials(name)}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- the candidate's own small photo from our API; no photo leaves the initials
        <img src={src} alt="" onError={() => setFailedAt(version)} className="absolute inset-0 size-full object-cover" />
      )}
    </span>
  );
}

/**
 * Company tile: the company's logo from JobsLake's cache when it has one (`logo`: signed-in pages only), else
 * its initial on the company's color. A logo that isn't there just leaves the initial — never a guess.
 */
/** Bumped when JobsLake finds logos for more companies (2: names resolved through Wikidata, 2026-10-24). */
const LOGO_VERSION = 2;

export function CompanyLogo({ name, color, size = 40, className, logo, domain }: { name: string; color?: string; size?: number; className?: string; logo?: boolean; domain?: string }) {
  const [failed, setFailed] = useState(false);
  const known = name.trim() && name !== "?" && name !== "Unknown company";
  // `v` changes when how logos are found changes, so a browser's cached "no logo" answer from before is not reused.
  const ready = useHydration((h) => h.hydrated);
  const src = logo && known && ready && !failed && getClientMode().mode === "user" ? `/api/company-logo?n=${encodeURIComponent(name.trim())}${domain ? `&d=${encodeURIComponent(domain)}` : ""}&v=${LOGO_VERSION}` : null;
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-line bg-surface font-bold", className)}
      style={{ width: size, height: size, color: color ?? "var(--wj-brand-600)", fontSize: Math.max(12, size * 0.42) }}
      aria-hidden="true"
    >
      {name.trim()[0]?.toUpperCase()}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- a small cached icon from our own API; next/image adds nothing here
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 size-full bg-surface object-contain p-[12%]" />
      )}
    </span>
  );
}
