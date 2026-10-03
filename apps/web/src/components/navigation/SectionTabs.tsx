"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { isActivePath, sectionFor } from "./nav";

/** The pages of the place you're in (Applications, Profile, Settings), as tabs at its top. */
export function SectionTabs() {
  const pathname = usePathname();
  const section = sectionFor(pathname);
  // Only on a section's own pages — a detail page (one application, one run) has its own back link.
  if (!section || !section.items.some((i) => i.href === pathname)) return null;
  return (
    <nav aria-label={section.title} className="-mx-4 mb-4 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      <ul className="flex gap-1">
        {section.items.map((item) => {
          const active = isActivePath(pathname, item);
          return (
            <li key={item.href} className="shrink-0">
              <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("inline-flex h-10 items-center border-b-2 px-3 text-[14px] font-medium transition-colors", active ? "border-brand-500 text-brand-700" : "border-transparent text-ink-3 hover:text-ink")}>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
