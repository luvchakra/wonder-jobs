"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { useUi } from "@/lib/ui";
import { isActivePath } from "./nav";
import { useModuleNav } from "./useModuleNav";

/**
 * The second UI's header already names the place (Pipeline, Saved, You) on phones and tablets, so a title or section
 * heading that only says the same again is kept for screen readers and not shown there (owner, 2026-11-28: "appears 3
 * times"). From 1024px there is no header, and the title shows as before.
 */
function useSaidByHeader(title: string) {
  const second = useUi() === 2;
  const pathname = usePathname();
  const place = useModuleNav().find((item) => isActivePath(pathname, item));
  return second && !!place && place.label.trim().toLowerCase() === title.trim().toLowerCase();
}

export function PageHeader({ title, description, actions, back, eyebrow, className }: { title: string; description?: string; actions?: React.ReactNode; back?: { href: string; label?: string }; eyebrow?: string; className?: string }) {
  const said = useSaidByHeader(title);
  // Only the title, and the header says it: nothing to show below 1024px, so the block takes no room there.
  const bare = said && !description && !actions && !back && !eyebrow;
  const heading = (
    <>
      {eyebrow && <p className="wj-eyebrow mb-1">{eyebrow}</p>}
      <h1 className={cn("text-[22px] font-semibold leading-tight tracking-tight text-ink md:text-[30px]", said && "max-lg:sr-only")}>{title}</h1>
      {description && <p className="mt-1 max-w-2xl text-[13px] text-ink-3 md:text-[15px]">{description}</p>}
    </>
  );
  const buttons = actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pt-0.5 md:pt-0">{actions}</div>;
  // With a back link, the actions share its row and the title gets the page's full width — a long title never wraps beside them.
  if (back) {
    return (
      <div className={cn("mb-4 md:mb-6", className)}>
        <div className="mb-1 flex items-center justify-between gap-3">
          <Link href={back.href} className="inline-flex min-h-10 items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden /> {back.label ?? "Back"}
          </Link>
          {buttons}
        </div>
        {heading}
      </div>
    );
  }
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3 md:mb-6 md:items-end", bare && "max-lg:mb-0", className)}>
      <div className="min-w-0 flex-1">{heading}</div>
      {buttons}
    </div>
  );
}

export function SectionHeader({ title, action, className }: { title: string; action?: { label: string; href: string }; className?: string }) {
  const said = useSaidByHeader(title);
  return (
    <div className={cn("mb-3 flex items-center justify-between", said && !action && "max-lg:mb-0", className)}>
      <h2 className={cn("text-[17px] font-semibold tracking-tight text-ink", said && "max-lg:sr-only")}>{title}</h2>
      {action && (
        <Link href={action.href} className="text-[13px] font-medium text-brand-600 hover:underline">
          {action.label} ›
        </Link>
      )}
    </div>
  );
}
