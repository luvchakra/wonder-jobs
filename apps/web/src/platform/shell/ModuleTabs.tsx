"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, CalendarCheck, CalendarClock, CalendarHeart, Handshake, LayoutList, Search, UserRound, type LucideIcon } from "lucide-react";
import { moduleById, type ModuleId } from "@/modules/registry";
import { cn } from "@/lib/cn";

const PIPELINE_ICONS: Record<string, LucideIcon> = { LayoutList, Handshake, CalendarCheck, CalendarClock, CalendarHeart };

/** A module's four tabs (docs/WONDERSTAR_PLATFORM.md §4.1): Find · Saved · the module's Pipeline · You. */
export function ModuleTabs({ id }: { id: ModuleId }) {
  const pathname = usePathname();
  const m = moduleById(id)!;
  const tabs = [
    { href: m.routes.find, label: "Find", icon: Search },
    { href: m.routes.saved, label: "Saved", icon: Bookmark },
    { href: m.routes.pipeline, label: m.pipeline.label, icon: PIPELINE_ICONS[m.pipeline.icon] ?? LayoutList },
    { href: m.routes.you, label: "You", icon: UserRound },
  ];
  return (
    <nav aria-label={m.label} className="-mx-4 mb-4 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      <ul className="flex">
        {tabs.map((t) => {
          const active = pathname === t.href;
          const I = t.icon;
          return (
            <li key={t.href} className="shrink-0">
              <Link href={t.href} aria-current={active ? "page" : undefined} className={cn("inline-flex h-10 items-center gap-1.5 border-b-2 px-2.5 text-[14px] font-medium transition-colors", active ? "border-brand-500 text-brand-700" : "border-transparent text-ink-3 hover:text-ink")}>
                <I className="size-4" aria-hidden />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
