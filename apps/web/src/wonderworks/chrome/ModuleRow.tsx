"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
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
 * open as round icons with their names (owner's mock, 2026-11-28: "use this for top portion"): plain circles, the
 * selected one solid accent inside an accent ring, and a chevron at the right edge while there are more to the right;
 * once the page scrolls it collapses into a sticky row of slim chips, the selected one solid. Picking
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
  // The selected module sits in the row's middle where the row can scroll that far (owner, 2026-11-28: "whatever is
  // selected, try to keep it in middle as much as possible"): on arrival at once, after a pick smoothly.
  const icons = useRef<HTMLUListElement>(null);
  const pills = useRef<HTMLUListElement>(null);
  const placed = useRef(false);
  const onId = items.find((m) => m.on)?.id;
  useEffect(() => {
    if (!show || !onId) return;
    const behavior: ScrollBehavior = placed.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant";
    for (const row of [icons.current, pills.current]) {
      const li = row?.querySelector<HTMLElement>(`[data-module="${CSS.escape(onId)}"]`);
      if (row && li) row.scrollTo({ left: li.offsetLeft - (row.clientWidth - li.offsetWidth) / 2, behavior });
    }
    placed.current = true;
  }, [show, onId]);
  // The header and this row are one surface: the header drops its own hairline while the row is under it (globals.css).
  useEffect(() => {
    if (!show) return;
    const root = document.documentElement;
    root.dataset.moduleRow = "";
    return () => {
      delete root.dataset.moduleRow;
    };
  }, [show]);
  // Whether the row has more to its right: the chevron at the edge shows it, and a tap moves along.
  const [more, setMore] = useState(false);
  useEffect(() => {
    const row = icons.current;
    if (!show || !row) return;
    const read = () => setMore(row.scrollLeft + row.clientWidth < row.scrollWidth - 8);
    read();
    row.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    return () => {
      row.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
    };
  }, [show, items.length]);
  if (!show) return null;
  return (
    // Sticks under the header, and follows it up when the header slides away on scroll (useScrollBars).
    <nav aria-label="Modules" style={{ top: "calc(var(--wj-top-h) - var(--wj-top-hidden, 0px))" }} className={cn("sticky z-20 overflow-hidden border-b border-line bg-surface/90 backdrop-blur transition-[height] duration-200 ease-out motion-reduce:transition-none lg:hidden", compact ? "h-[3.25rem]" : "h-[6.5rem]")}>
      {/* The two rows cross-fade; only the one showing can be reached. */}
      <ul ref={icons} inert={compact} aria-hidden={compact} className={cn("wj-scrollbar-none absolute inset-x-0 top-0 flex snap-x overflow-x-auto px-2.5 pb-2 transition-opacity duration-200 motion-reduce:transition-none", compact ? "opacity-0" : "opacity-100")}>
        {items.map((m) => (
          <li key={m.id} data-module={m.id} className="shrink-0 snap-center">
            <button type="button" aria-pressed={m.on} onClick={m.select} className={cn("group flex w-[4.75rem] flex-col items-center gap-1.5 px-0.5 pt-1.5 text-[12px] leading-[1.2] text-ink transition-colors duration-150", m.on ? "font-semibold" : "font-normal")}>
              {/* A plain circle; the selected one is solid accent with a ring of the accent around it. */}
              <span className={cn("grid size-[3.25rem] place-items-center rounded-full transition-[box-shadow,transform,background-color] duration-150 group-active:scale-95", m.on ? "wj-module-on text-white" : "border border-line bg-surface-2 text-ink")}>
                <m.icon aria-hidden className="size-6" strokeWidth={m.on ? 2 : 1.6} />
              </span>
              <span className="line-clamp-2 max-w-full text-center">{m.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {/* More to the right: a tap moves the row along (the row itself scrolls by touch and keyboard, so this is for the pointer only). */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={() => icons.current?.scrollBy({ left: 228, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}
        className={cn("absolute right-0 top-0 flex h-[4.25rem] w-9 items-center justify-end bg-gradient-to-l from-surface from-55% to-transparent pr-1 text-ink-3 transition-opacity duration-150", more && !compact ? "opacity-100" : "pointer-events-none opacity-0")}
      >
        <ChevronRight className="size-5" strokeWidth={2} aria-hidden />
      </button>
      <ul ref={pills} inert={!compact} aria-hidden={!compact} className={cn("wj-scrollbar-none absolute inset-x-0 top-0 flex snap-x gap-2 overflow-x-auto px-4 py-2 transition-opacity duration-200 motion-reduce:transition-none", compact ? "opacity-100" : "opacity-0")}>
        {items.map((m) => (
          <li key={m.id} data-module={m.id} className="shrink-0 snap-center">
            <button type="button" aria-pressed={m.on} onClick={m.select} className={cn("inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] transition-colors duration-150", m.on ? "bg-brand-600 font-semibold text-white" : "bg-bg-soft font-normal text-ink")}>
              <m.icon aria-hidden className="size-4" strokeWidth={1.9} />
              {m.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
