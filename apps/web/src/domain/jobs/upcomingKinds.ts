import { MODULES, type UpcomingKindId } from "@/modules/registry";

export type { UpcomingKindId };

/**
 * The other WonderWorks modules Find's menu lists (owner, 2026-10-25) below Full Time Jobs and Part Time Jobs: a live
 * one links out of Jobs to its own module (`/app/m/<id>`, WJ-418), a "soon" one shows disabled under "Coming soon".
 * Derived from the module registry (`modules/registry.ts`): every module beyond Jobs with a menu id, in the registry's order. They are not Find modes:
 * `FindMode`, `FIND_MODE_PATCH`, search, filters and the stores don't know them, and nothing here ever lists a job
 * or a sample — until one is built for real, it is a label and a line. Each can be hidden or shown by a platform
 * admin (Admin → Settings → Menus → Find menu).
 */
export const UPCOMING_KINDS: readonly { id: UpcomingKindId; label: string; hint: string }[] = MODULES.flatMap((m) => (m.id !== "jobs" && m.menuId ? [{ id: m.menuId, label: m.label, hint: m.hint }] : []));
