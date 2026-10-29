import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * The WonderWorks brand assets (`public/brand/`, built by `scripts/brand-svg.py` from the identity sheet
 * `docs/brand/wonderstar-identity.png`). The wordmark's Deep Navy disappears on the product's dark
 * surfaces, so pass `tone="dark"` on anything sitting on ink/night backgrounds for the white-on-dark version.
 */
export type BrandTone = "light" | "dark";

const MARK = { src: "/brand/wonderstar-mark.svg", width: 120, height: 100 };
const LOGO: Record<BrandTone, string> = { light: "/brand/wonderstar-logo.svg", dark: "/brand/wonderstar-logo-white.svg" };
const LOGO_SIZE = { width: 731, height: 100 };
const LOCKUP: Record<BrandTone, string> = { light: "/brand/wonderstar-stacked.svg", dark: "/brand/wonderstar-stacked-white.svg" };
const LOCKUP_SIZE = { width: 607, height: 290 };

/** The mark on its own, sized by height. Decorative by default — give the wrapper the label. */
export function WonderMark({ className, size = 28, alt = "" }: { className?: string; size?: number; alt?: string }) {
  // shrink-0: this image is a flex item wherever it's used (TopBar's mobile header, sidebar rails). Without
  // it, a tight flex row (e.g. the mobile topbar competing with the search bar's `w-full`) applies the
  // default flex-shrink:1 to the <img> itself and squashes it well past its aspect-ratio-scaled width —
  // that's what made the mark look cut off and compressed.
  return <Image src={MARK.src} alt={alt} aria-hidden={alt ? undefined : true} width={MARK.width} height={MARK.height} style={{ height: size, width: "auto" }} className={cn("select-none shrink-0", className)} priority unoptimized />;
}

/** Mark + wordmark. `compact` drops the wordmark (collapsed sidebar, small screens). */
export function WonderLogo({ href = "/", className, compact = false, size = 28, tone = "light" }: { href?: string | null; className?: string; compact?: boolean; size?: number; tone?: BrandTone }) {
  const content = compact ? (
    <WonderMark size={size} />
  ) : (
    <Image src={LOGO[tone]} alt="WonderWorks" width={LOGO_SIZE.width} height={LOGO_SIZE.height} style={{ height: size, width: "auto" }} className="select-none shrink-0" priority unoptimized />
  );
  if (!href) return <span className={cn("inline-flex items-center shrink-0", className)}>{content}</span>;
  return (
    <Link href={href} className={cn("inline-flex items-center shrink-0", className)} aria-label="WonderWorks home">
      {content}
    </Link>
  );
}

/** Stacked logo with the "Discover opportunities. Unlock possibilities." tagline — for hero and brand moments, not navigation. */
export function WonderLockup({ className, size = 96, tone = "light" }: { className?: string; size?: number; tone?: BrandTone }) {
  return <Image src={LOCKUP[tone]} alt="WonderWorks" width={LOCKUP_SIZE.width} height={LOCKUP_SIZE.height} style={{ height: size, width: "auto" }} className={cn("select-none shrink-0", className)} priority unoptimized />;
}
