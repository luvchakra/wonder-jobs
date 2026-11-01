import { MODULES } from "@/modules/registry";

/** Module names for notification text. */
export const MODULE_LABELS: Record<string, string> = Object.fromEntries(MODULES.map((m) => [m.id, m.label]));
