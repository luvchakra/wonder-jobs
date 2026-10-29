import { isActivePath, moduleTabs, type NavItem } from "@/wonderworks/chrome/nav";
import { PRIMARY_NAV } from "./jobs/nav";
import { isLive, moduleById, type ModuleId } from "./registry";

/**
 * The composition root's tabs: each module's four places (docs/WONDERSTAR_PLATFORM.md §4.1). Jobs keeps PRIMARY_NAV
 * exactly; every other live module gets WonderWorks' tabs at its own routes, with its Pipeline label from its manifest.
 */
export function moduleNav(id: ModuleId): NavItem[] {
  const m = moduleById(id);
  if (!m || id === "jobs") return PRIMARY_NAV;
  return moduleTabs(m);
}

/**
 * The module a page belongs to: a live module's own pages are that module's; Jobs' Find, Saved, Pipeline and You pages
 * are Jobs'; any other page (account, settings, notifications…) belongs to none, so the tabs stay the active module's.
 */
export function moduleFromPath(pathname: string): ModuleId | null {
  const m = /^\/app\/m\/([^/]+)/.exec(pathname);
  if (m) {
    const found = moduleById(m[1]);
    return found && isLive(found) ? found.id : null;
  }
  const [find, saved, pipeline] = PRIMARY_NAV;
  if (isActivePath(pathname, find) || isActivePath(pathname, saved) || isActivePath(pathname, pipeline) || pathname === "/app/you") return "jobs";
  return null;
}
