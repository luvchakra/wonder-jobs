"use client";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { TINTS } from "@/wonderworks/brand/tiles";
import { appReturnPath } from "./nav";
import { useChromeSlots } from "./slots";
import { useSelectedModule } from "./useModuleNav";

/**
 * Leaves network mode (owner, 2026-11-22): the module in use, as its own tile, back to the last page the member had open
 * outside Network (or the module's first place). Phones only; from 768px the sidebar carries the modules. Two places:
 * right of the avatar in the top bar, and in the round buttons at the bottom right, under the +.
 */
export function LeaveNetwork({ place }: { place: "top" | "fab" }) {
  const router = useRouter();
  const slots = useChromeSlots();
  const selected = useSelectedModule();
  const current = slots.useSidebarModules?.().items.find((m) => m.on);
  const label = current?.label ?? "the app";
  const Icon = current?.icon ?? Undo2;
  const fab = place === "fab";
  return (
    <button
      type="button"
      aria-label={`Back to ${label}`}
      title={`Back to ${label}`}
      onClick={() => router.push(appReturnPath(slots.tabsFor(selected)[0]?.href ?? "/app"))}
      className={cn(
        "grid shrink-0 place-items-center rounded-full md:hidden",
        fab ? "fixed bottom-[calc(var(--wj-mobile-nav-h)+4.75rem)] right-4 z-40 size-14 border border-line bg-surface shadow-lg active:scale-95" : "relative order-[-2] size-10 hover:bg-bg-soft",
      )}
    >
      <span aria-hidden className={cn("relative grid place-items-center", fab ? "size-9 rounded-[12px]" : "size-8 rounded-[10px]", current ? [TINTS[current.tint].tile, TINTS[current.tint].icon] : "bg-bg-soft text-ink-2")}>
        <Icon className={fab ? "size-5" : "size-[18px]"} strokeWidth={2} />
        <span aria-hidden className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-surface text-ink-2 shadow ring-1 ring-line">
          <Undo2 className="size-2.5" strokeWidth={2.6} />
        </span>
      </span>
    </button>
  );
}
