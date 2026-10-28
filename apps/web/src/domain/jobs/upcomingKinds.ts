import { MODULES, type UpcomingKindId } from "@/modules/registry";

export type { UpcomingKindId };

/**
 * The kinds of listings Find's menu says are coming (owner, 2026-10-25), shown disabled under "Coming soon" below
 * Full Time Jobs, Part Time Jobs and Internships (built 2026-10-28, WJ-413). Derived from the module registry
 * (`modules/registry.ts`): every "soon" module with a menu id, in the registry's order. They are not Find modes:
 * `FindMode`, `FIND_MODE_PATCH`, search, filters and the stores don't know them, and nothing here ever lists a job
 * or a sample — until one is built for real, it is a label and a line. Each can be hidden or shown by a platform
 * admin (Admin → Settings → Menus → Find menu).
 */
export const UPCOMING_KINDS: readonly { id: UpcomingKindId; label: string; hint: string }[] = MODULES.flatMap((m) => (m.status === "soon" && m.menuId ? [{ id: m.menuId, label: m.label, hint: m.hint }] : []));
