"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/motion";
import { WonderLogo } from "@/components/brand/WonderLogo";
import { TINTS } from "@/wonderworks/brand/tiles";
import { isActivePath, type NavItem } from "./nav";
import { useModuleNav } from "./useModuleNav";
import { useChromeSlots } from "./slots";
import { TopBar } from "./TopBar";
import { NotificationBell } from "./NotificationBell";

/** A heading over a group of the sidebar's links (desktop only). */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-ink-4">{children}</p>;
}

/**
 * Rows are compact from 1024px so the places, every module and the avatar fit without scrolling (owner, 2026-11-06:
 * "reduce vertical spaces between these menu items so all the menus are visible in sidebar and no scrolling is required").
 *
 * The modules, as in the top bar's menu (which the sidebar replaces from 1024px): Jobs' Full Time and Part Time, then
 * every live module, each in its own tint; the one in use is marked. Modules still to come are counted, not listed.
 */
function ModuleList() {
  const { useSidebarModules } = useChromeSlots();
  const mods = useSidebarModules?.();
  if (!mods?.items.length) return null;
  return (
    <nav aria-label="Modules" className="mt-2 flex shrink-0 flex-col border-t border-line pt-2">
      <GroupLabel>Modules</GroupLabel>
      <ul className="flex flex-col">
        {mods.items.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={m.select}
              aria-current={m.on ? "true" : undefined}
              className={cn("flex h-8 w-full items-center gap-2.5 rounded-[10px] px-2 text-left text-[13.5px] transition-colors", m.on ? "bg-bg-soft font-semibold text-ink" : "text-ink-2 hover:bg-bg-soft hover:text-ink")}
            >
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-[7px]", TINTS[m.tint].tile, TINTS[m.tint].icon)}>
                <m.icon className="size-3.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 truncate">{m.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {mods.soon > 0 && <p className="mt-1 px-3 text-[12px] text-ink-4">{mods.soon} more coming soon</p>}
    </nav>
  );
}

function NavLink({ item, pathname, collapsed }: { item: NavItem; pathname: string; collapsed: boolean }) {
  const active = isActivePath(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-[12px] px-3 font-medium transition-colors duration-200",
        collapsed ? "h-11 text-[14px]" : "h-9 text-[14px]",
        active ? "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100" : "text-ink-2 hover:bg-bg-soft hover:text-ink",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className={cn("size-[18px] shrink-0 transition-colors duration-200", active ? "text-brand-600" : "text-ink-3 group-hover:text-ink-2")} aria-hidden />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

/**
 * Sidebar from 768px. Tablets (768–1023px): icons only, the module's four places. Desktops (owner, 2026-11-06: "get
 * different kind of menus in the sidebar as it has enough space now"): the four places and the Modules list (in place
 * of the top bar's menu), the bell beside the logo, and at its foot the avatar and name (the top bar is gone from 1024px). Analytics and the settings (Notifications, Automation, AI provider, Help) left the sidebar
 * (owner, 2026-11-06: "remove these from left sidebar"); they're in the avatar menu, and Notifications on the bell.
 * Below 768px the bottom bar (MobileNav) takes over, and none of this shows.
 */
export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
  const nav = useModuleNav();
  return (
    <aside className={cn("hidden md:flex h-dvh sticky top-0 shrink-0 flex-col border-r border-line bg-surface", collapsed ? "w-[72px] px-3" : "w-[232px] overflow-y-auto px-4 [scrollbar-width:thin]")} aria-label="Sidebar">
      <div className={cn("flex h-16 shrink-0 items-center", collapsed ? "justify-center" : "justify-between gap-2 pr-1")}>
        <WonderLogo href="/app" size={collapsed ? 24 : 22} compact={collapsed} />
        {/* From 1024px the bell sits beside the logo (owner, 2026-11-06); tablets keep it in the top bar. */}
        {!collapsed && <NotificationBell compact />}
      </div>
      <nav aria-label="Primary" className={cn("flex shrink-0 flex-col gap-0.5", collapsed ? "mt-4" : "mt-1")}>
        {nav.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
        ))}
      </nav>
      {!collapsed && <ModuleList />}
      {/* From 1024px the avatar and name sit at the sidebar's foot; there's no top bar. */}
      <TopBar place="side" />
    </aside>
  );
}
