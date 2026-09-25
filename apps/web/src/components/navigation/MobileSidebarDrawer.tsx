"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { WonderLogo } from "@/components/brand/WonderLogo";
import { IconButton } from "@/components/common/Button";
import { useUIStore } from "@/store/ui";
import { CAREER_NAV, PRIMARY_NAV, RESOURCES_NAV, WONDER_NAV, isActivePath, type NavItem } from "./nav";

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate: () => void }) {
  const active = isActivePath(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "flex h-12 items-center gap-3 rounded-[12px] px-3 text-[15px] font-medium transition-colors",
        active ? "bg-brand-50 text-brand-700" : "text-ink-2 hover:bg-bg-soft hover:text-ink",
      )}
    >
      <Icon className={cn("size-5 shrink-0", active ? "text-brand-600" : "text-ink-3")} aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function Group({ title, items, pathname, onNavigate }: { title?: string; items: NavItem[]; pathname: string; onNavigate: () => void }) {
  return (
    <div className="mt-5 first:mt-0">
      {title && <p className="wj-eyebrow mb-2 px-3 text-[11px]">{title}</p>}
      <nav aria-label={title ?? "Primary"} className="flex flex-col gap-0.5">
        {items.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </nav>
    </div>
  );
}

/**
 * The full app nav (everything the desktop Sidebar shows — every menu and submenu) as a slide-in drawer
 * for narrow screens, which have no room for a persistent sidebar. Closed by default on every load (see
 * useUIStore's mobileNavOpen — deliberately not persisted); opened from TopBar's hamburger button (top
 * left) or MobileNav's "More" tab (bottom right of the bottom bar).
 */
export function MobileSidebarDrawer() {
  const open = useUIStore((s) => s.mobileNavOpen);
  const setOpen = useUIStore((s) => s.setMobileNavOpen);
  const pathname = usePathname();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      setOpen(false);
    };
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, [setOpen]);

  // A route change (tapping a link) should always close the drawer behind it, even if some future link
  // opens in the same tab without going through NavLink's own onNavigate (defense in depth).
  useEffect(() => {
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const close = () => setOpen(false);

  return (
    <dialog
      ref={ref}
      aria-label="Menu"
      className={cn(
        "m-0 h-dvh max-h-dvh w-[84vw] max-w-[320px] border-0 bg-surface p-0 text-ink shadow-lg backdrop:bg-ink/40 backdrop:backdrop-blur-sm",
        "fixed inset-y-0 left-0 right-auto rounded-r-[20px] md:hidden",
      )}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="flex h-16 items-center justify-between px-4">
        <WonderLogo href="/app" compact />
        <IconButton label="Close menu" onClick={close} size="sm">
          <X className="size-4" aria-hidden />
        </IconButton>
      </div>
      <div className="h-[calc(100%-4rem)] overflow-y-auto px-3 pb-6 wj-scrollbar-none">
        <Group items={PRIMARY_NAV} pathname={pathname} onNavigate={close} />
        <Group title="Wonder" items={WONDER_NAV} pathname={pathname} onNavigate={close} />
        <Group title="Career" items={CAREER_NAV} pathname={pathname} onNavigate={close} />
        <Group title="Resources" items={RESOURCES_NAV} pathname={pathname} onNavigate={close} />
      </div>
    </dialog>
  );
}
