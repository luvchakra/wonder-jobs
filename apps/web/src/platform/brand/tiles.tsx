import { BookOpen, Briefcase, CalendarDays, GraduationCap, Handshake, HeartPulse, Store, Users, type LucideIcon } from "lucide-react";
import type { ModuleIcon, ModuleManifest, ModuleTint } from "@/modules/registry";
import { cn } from "@/lib/cn";

const ICONS: Record<ModuleIcon, LucideIcon> = { Briefcase, GraduationCap, BookOpen, Handshake, Users, HeartPulse, CalendarDays, Store };

/** Tile tints from the identity sheet: a soft background with the icon in its stronger shade. */
export const TINTS: Record<ModuleTint, { tile: string; icon: string; chip: string }> = {
  lavender: { tile: "bg-soft-lavender", icon: "text-star-purple", chip: "bg-soft-lavender text-star-purple" },
  lightblue: { tile: "bg-[#dbeafe]", icon: "text-[#2563eb]", chip: "bg-[#dbeafe] text-[#1d4ed8]" },
  peach: { tile: "bg-[#ffedd5]", icon: "text-[#c2410c]", chip: "bg-[#ffedd5] text-[#c2410c]" },
  mint: { tile: "bg-[#d1fae5]", icon: "text-[#047857]", chip: "bg-[#d1fae5] text-[#047857]" },
  pink: { tile: "bg-[#fce7f3]", icon: "text-[#be185d]", chip: "bg-[#fce7f3] text-[#be185d]" },
};

/** A module's lucide line icon in its tint's stronger shade (for a card that already carries the tint). */
export function ModuleIcon({ m }: { m: ModuleManifest }) {
  const I = ICONS[m.icon];
  return <I className={cn("size-7", TINTS[m.accent].icon)} strokeWidth={1.6} aria-hidden />;
}

/** A module's lucide line icon in its tinted rounded-square tile. */
export function ModuleIconTile({ m, size = "md" }: { m: ModuleManifest; size?: "sm" | "md" }) {
  const I = ICONS[m.icon];
  const t = TINTS[m.accent];
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-2xl", t.tile, size === "md" ? "size-12" : "size-9 rounded-xl")}>
      <I className={cn(t.icon, size === "md" ? "size-6" : "size-[18px]")} strokeWidth={1.75} aria-hidden />
    </span>
  );
}
