import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * The second UI's four cards (owner, 2026-11-28). Presentation only: a module gives each card its own words, numbers
 * and image, all from the listing itself. A card with no real image never shows a stand-in picture.
 */
const shell = "block h-full rounded-[12px] border border-line bg-surface text-left transition-colors duration-150 hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

/** a. Portrait: a 2:3 image, a meta line, a two-line title and a grey category. For listings that have a picture. */
export function PortraitCard({ href, image, imageAlt, meta, title, category, ribbon }: { href: string; /** The listing's own image URL. */ image: string; imageAlt: string; meta?: string; title: string; category?: string; /** A short accent corner label ("New", "Free"). */ ribbon?: string }) {
  return (
    <Link href={href} className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
      <span className="relative block aspect-[2/3] overflow-hidden rounded-[12px] bg-bg-soft">
        {/* eslint-disable-next-line @next/next/no-img-element -- a listing's own image, from any host */}
        <img src={image} alt={imageAlt} loading="lazy" className="size-full object-cover" />
        {ribbon && <span className="absolute left-0 top-3 rounded-r-full bg-brand-500 px-2.5 py-1 text-[11px] font-semibold text-white">{ribbon}</span>}
      </span>
      {meta && <span className="mt-2 block truncate text-[12px] text-ink-3">{meta}</span>}
      <span className="mt-0.5 line-clamp-2 block text-[14px] font-semibold leading-snug text-ink">{title}</span>
      {category && <span className="mt-0.5 block truncate text-[12px] text-ink-3">{category}</span>}
    </Link>
  );
}

/** b. Info: white and bordered. A title, its type, one key value in bold, a highlighted line, and a footer with an icon. */
export function InfoCard({ href, lead, title, type, value, highlight, footerIcon, footer, action, className }: { href: string; /** A logo or icon at the start. */ lead?: React.ReactNode; title: string; type?: string; value?: string; highlight?: string; footerIcon?: React.ReactNode; footer?: string; /** One action beside the card's own link (Save). */ action?: React.ReactNode; className?: string }) {
  return (
    <article className={cn(shell, "relative flex flex-col gap-2 p-4", className)}>
      <div className="flex items-start gap-3">
        {lead && <span className="shrink-0">{lead}</span>}
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug text-ink">
            {/* The whole card is the link; the action sits above it. */}
            <Link href={href} className="after:absolute after:inset-0 after:rounded-[12px] focus-visible:outline-none">
              {title}
            </Link>
          </h3>
          {type && <p className="mt-0.5 truncate text-[12px] text-ink-3">{type}</p>}
        </div>
        {action && <span className="relative z-10 -mr-2 -mt-2 shrink-0">{action}</span>}
      </div>
      {value && <p className="text-[15px] font-bold text-ink">{value}</p>}
      {highlight && <p className="w-fit max-w-full truncate rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-medium text-brand-700">{highlight}</p>}
      {footer && (
        <p className="mt-auto flex items-center gap-1.5 border-t border-line pt-2 text-[12px] text-ink-3">
          {footerIcon}
          <span className="truncate">{footer}</span>
        </p>
      )}
    </article>
  );
}

/** c. Category tile: a tinted background, a big uppercase label, a real count and an icon on the right. */
export function CategoryTile({ href, label, count, icon, tone = 0 }: { href: string; label: string; /** Said as given ("255 listings"); left out when the count isn't known. */ count?: string; icon?: React.ReactNode; /** Which of the accent tints the tile wears. */ tone?: 0 | 1 | 2 }) {
  const tones = ["from-brand-100 to-brand-50", "from-brand-200 to-brand-100", "from-brand-50 to-surface-2"] as const;
  return (
    <Link href={href} className={cn("flex min-h-[88px] items-center justify-between gap-3 rounded-[12px] bg-gradient-to-br p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500", tones[tone])}>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-extrabold uppercase tracking-wide text-brand-900">{label}</span>
        {count && <span className="mt-0.5 block text-[12px] text-brand-800">{count}</span>}
      </span>
      {icon && <span aria-hidden className="shrink-0 text-brand-600">{icon}</span>}
    </Link>
  );
}

/** d. Feature: a picture or icon on the left, a title, meta and three lines of description, and one outlined accent button below. */
export function FeatureCard({ media, title, meta, description, action }: { media?: React.ReactNode; title: string; meta?: string; description?: string; /** The full-width outlined button (a link or a button the screen gives). */ action?: React.ReactNode }) {
  return (
    <article className={cn(shell, "flex flex-col gap-3 p-4")}>
      <div className="flex gap-3">
        {media && <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[8px] bg-bg-soft text-brand-600">{media}</span>}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold text-ink">{title}</h3>
          {meta && <p className="mt-0.5 truncate text-[12px] text-ink-3">{meta}</p>}
          {description && <p className="mt-1 line-clamp-3 text-[13px] leading-snug text-ink-2">{description}</p>}
        </div>
      </div>
      {action}
    </article>
  );
}

/** The feature card's button: full width, outlined in the accent. */
export const featureAction = "flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] border border-brand-500 px-4 text-[14px] font-semibold text-brand-600 transition-colors duration-150 hover:bg-brand-50";
