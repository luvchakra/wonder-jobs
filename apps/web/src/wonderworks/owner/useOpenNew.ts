"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * The + button's `?new=1` (owner, 2026-11-02: "make the plus button open the new entry form directly"): opens the page's
 * own new-entry form once the page would show its own add button (`ready`: loaded, and the person may post), then
 * drops `new` from the address so a reload or Back doesn't open it again. Never opens what the page wouldn't offer.
 */
export function useOpenNew(ready: boolean, open: () => void) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const done = useRef(false);
  const wanted = params.get("new") === "1";
  useEffect(() => {
    if (!wanted || !ready || done.current) return;
    done.current = true;
    open();
    const rest = new URLSearchParams(params.toString());
    rest.delete("new");
    router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false });
  }, [wanted, ready, open, params, router, pathname]);
}

/** A post page's address with the + button's request to open its form. */
export const withNew = (href: string) => `${href}${href.includes("?") ? "&" : "?"}new=1`;
