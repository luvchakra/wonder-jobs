"use client";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { appReturnPath } from "./nav";
import { useChromeSlots } from "./slots";
import { useSelectedModule } from "./useModuleNav";

/** Network mode's way out (owner, 2026-11-22): back to the last page the member had open outside Network (or the
 * module's first place), named for the module in use. */
export function useLeaveNetwork(): { label: string; leave: () => void } {
  const router = useRouter();
  const slots = useChromeSlots();
  const selected = useSelectedModule();
  const current = slots.useSidebarModules?.().items.find((m) => m.on);
  return {
    label: `Back to ${current?.label ?? "the app"}`,
    leave: () => router.push(appReturnPath(slots.tabsFor(selected)[0]?.href ?? "/app")),
  };
}

/** In the top bar, right of the avatar: a plain back arrow (owner, 2026-11-23: "just show the back icon instead of the
 * module level icon"). Phones only; from 768px the sidebar carries the modules. (Under the + it is one of MobileNav's
 * quick actions, with the same arrow.) */
export function LeaveNetwork() {
  const { label, leave } = useLeaveNetwork();
  return (
    <button type="button" aria-label={label} title={label} onClick={leave} className="order-[-2] grid size-10 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-2 hover:bg-bg-soft hover:text-ink active:scale-95 md:hidden">
      <ArrowLeft className="size-5" aria-hidden />
    </button>
  );
}
