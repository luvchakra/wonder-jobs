"use client";
import { useRouter } from "next/navigation";
import { Undo2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { TINTS } from "@/wonderworks/brand/tiles";
import type { ModuleTint } from "@/wonderworks/manifest";
import { appReturnPath } from "./nav";
import { useChromeSlots } from "./slots";
import { useSelectedModule } from "./useModuleNav";

/** Network mode's way out (owner, 2026-11-22): the module in use, and a way back to the last page the member had open
 * outside Network (or the module's first place). */
export function useLeaveNetwork(): { label: string; Icon: LucideIcon; tint: ModuleTint | null; leave: () => void } {
  const router = useRouter();
  const slots = useChromeSlots();
  const selected = useSelectedModule();
  const current = slots.useSidebarModules?.().items.find((m) => m.on);
  return {
    label: `Back to ${current?.label ?? "the app"}`,
    Icon: current?.icon ?? Undo2,
    tint: current?.tint ?? null,
    leave: () => router.push(appReturnPath(slots.tabsFor(selected)[0]?.href ?? "/app")),
  };
}

/** The module's own tile with a small back mark. */
export function LeaveTile({ Icon, tint, size }: { Icon: LucideIcon; tint: ModuleTint | null; size: "sm" | "md" }) {
  return (
    <span aria-hidden className={cn("relative grid place-items-center", size === "md" ? "size-9 rounded-[12px]" : "size-8 rounded-[10px]", tint ? [TINTS[tint].tile, TINTS[tint].icon] : "bg-bg-soft text-ink-2")}>
      <Icon className={size === "md" ? "size-5" : "size-[18px]"} strokeWidth={2} />
      <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-surface text-ink-2 shadow ring-1 ring-line">
        <Undo2 className="size-2.5" strokeWidth={2.6} />
      </span>
    </span>
  );
}

/** In the top bar, right of the avatar. Phones only; from 768px the sidebar carries the modules. (Under the + it is one
 * of MobileNav's quick actions.) */
export function LeaveNetwork() {
  const { label, Icon, tint, leave } = useLeaveNetwork();
  return (
    <button type="button" aria-label={label} title={label} onClick={leave} className="relative order-[-2] grid size-10 shrink-0 place-items-center rounded-full hover:bg-bg-soft md:hidden">
      <LeaveTile Icon={Icon} tint={tint} size="sm" />
    </button>
  );
}
