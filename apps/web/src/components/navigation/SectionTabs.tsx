"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { arrangeMenu } from "@/domain/navigation/menus";
import { useMenu } from "@/lib/menus";
import { isActivePath, sectionFor } from "./nav";

/** The pages of the place you're in (Applications, Profile, Settings), as tabs at its top. */
export function SectionTabs() {
  const pathname = usePathname();
  const section = sectionFor(pathname);
  // You's tabs follow the You page's rows, in the order set for everyone (Career Profile always first).
  const youMenu = useMenu("you");
  // The current page's tab in view, when the row is wider than the screen.
  const activeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname, youMenu]);
  // Only on a section's own pages — a detail page (one application, one run) has its own back link.
  if (!section || !section.items.some((i) => i.href === pathname || (isActivePath(pathname, i) && pathname.split("/").length <= 3))) return null;
  const fixed = section.items.filter((i) => !i.menuId);
  const items = section.items.some((i) => i.menuId) ? [...fixed, ...arrangeMenu(section.items.filter((i) => i.menuId).map((i) => ({ ...i, id: i.menuId! })), youMenu)] : section.items;
  return (
    <nav aria-label={section.title} className="-mx-4 mb-4 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      <ul className="flex">
        {items.map((item) => {
          const active = isActivePath(pathname, item);
          return (
            <li key={item.href} className="shrink-0">
              <Link ref={active ? activeRef : undefined} href={item.href} aria-current={active ? "page" : undefined} className={cn("inline-flex h-10 items-center border-b-2 px-2 text-[14px] font-medium transition-colors", active ? "border-brand-500 text-brand-700" : "border-transparent text-ink-3 hover:text-ink")}>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
