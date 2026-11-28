"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useUi } from "@/lib/ui";
import { useHydration } from "@/store/hydration";
import { useChromeSlots } from "./slots";
import { useModuleNav } from "./useModuleNav";
import { useNetworkMode } from "./networkMode";

/** Past this much scroll the icon row gives way to the chips. */
const COLLAPSE_AT = 28;

/**
 * The second UI's module row (domain/platform/ui.ts), under the header on a module's Find page: the modules that are
 * open as line icons with their names; once the page scrolls it collapses into a sticky row of outlined pills. Picking
 * one does exactly what picking it in the module menu does (the same `select` the sidebar's Modules list uses).
 * Phones and tablets only: from 1024px the sidebar lists the modules. Nothing renders in the first UI.
 */
export function ModuleRow() {
  const second = useUi() === 2;
  const pathname = usePathname();
  const hydrated = useHydration((s) => s.hydrated);
  const onNetwork = useNetworkMode();
  const slots = useChromeSlots();
  const find = useModuleNav()[0];
  const { items } = slots.useSidebarModules?.() ?? { items: [] };
  const show = second && hydrated && !onNetwork && !!find && pathname === find.href && items.length > 1;
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (!show) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      setCompact(window.scrollY > COLLAPSE_AT);
    };
    const onScroll = () => {
      frame ||= requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [show]);
  if (!show) return null;
  return (
    // Sticks under the header, and follows it up when the header slides away on scroll (useScrollBars).
    <nav aria-label="Modules" style={{ top: "calc(4.5rem - var(--wj-top-hidden, 0px))" }} className={cn("sticky z-20 overflow-hidden border-b border-line bg-surface/90 backdrop-blur transition-[height] duration-200 ease-out motion-reduce:transition-none lg:hidden", compact ? "h-[3.75rem]" : "h-[5.5rem]")}>
      {/* The two rows cross-fade; only the one showing can be reached. */}
      <ul inert={compact} aria-hidden={compact} className={cn("wj-scrollbar-none absolute inset-x-0 top-0 flex snap-x gap-1 overflow-x-auto px-3 py-2 transition-opacity duration-200 motion-reduce:transition-none", compact ? "opacity-0" : "opacity-100")}>
        {items.map((m) => (
          <li key={m.id} className="shrink-0 snap-start">
            <button type="button" aria-pressed={m.on} onClick={m.select} className={cn("flex h-[4.5rem] w-[4.75rem] flex-col items-center justify-center gap-1.5 rounded-[12px] px-1 text-[11.5px] leading-tight transition-colors duration-150", m.on ? "font-semibold text-brand-700" : "font-medium text-ink-3")}>
              <m.icon aria-hidden className={cn("size-6", m.on && "text-brand-600")} strokeWidth={m.on ? 2 : 1.6} />
              <span className="line-clamp-2 max-w-full text-center">{m.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <ul inert={!compact} aria-hidden={!compact} className={cn("wj-scrollbar-none absolute inset-x-0 top-0 flex snap-x gap-2 overflow-x-auto px-4 py-2 transition-opacity duration-200 motion-reduce:transition-none", compact ? "opacity-100" : "opacity-0")}>
        {items.map((m) => (
          <li key={m.id} className="shrink-0 snap-start">
            <button type="button" aria-pressed={m.on} onClick={m.select} className={cn("inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[13px] font-medium transition-colors duration-150", m.on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-surface text-ink")}>
              <m.icon aria-hidden className="size-4" strokeWidth={1.8} />
              {m.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
