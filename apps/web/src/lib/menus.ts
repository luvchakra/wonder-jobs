"use client";
import { useEffect, useState } from "react";
import { cleanMenu, defaultMenu, type MenuConfig, type MenuId } from "@/domain/navigation/menus";

/** The platform's arranged menus, fetched once per page load (one request for all of them). */
let request: Promise<unknown> | null = null;

/** A menu's order and hidden items as the platform set them; today's menu until it answers, or if it can't. */
export function useMenu<M extends MenuId>(menu: M): MenuConfig<M> {
  const [config, setConfig] = useState<MenuConfig<M>>(() => defaultMenu(menu));
  useEffect(() => {
    let alive = true;
    request ??= fetch("/api/menus")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    void request.then((all) => alive && setConfig(cleanMenu(menu, (all as Record<string, unknown> | null)?.[menu])));
    return () => {
      alive = false;
    };
  }, [menu]);
  return config;
}
