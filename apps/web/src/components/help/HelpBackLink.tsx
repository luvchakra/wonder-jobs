"use client";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { readDemoCookie, readUserCookie } from "@/lib/auth/browser";

/** The mode lives in a cookie and never changes mid-page, so there's nothing to subscribe to. */
const noSubscribe = () => () => {};
/**
 * Deliberately not `getClientMode()`: that falls back to "demo" for any visitor when auth is
 * configured, which is right for the product but would send every logged-out reader of this public
 * page into the app. Only an actual session or an explicit demo cookie counts as "inside the app".
 */
const clientSnapshot = () => Boolean(readUserCookie() || readDemoCookie());
/** The server can't know, and "not signed in" is the safe guess for a public page. */
const serverSnapshot = () => false;

/**
 * The help centre is public, so "Back to the app" is wrong for most of the people reading it.
 * Signed-in and demo visitors get the app; everyone else goes home.
 */
export function HelpBackLink() {
  const inApp = useSyncExternalStore(noSubscribe, clientSnapshot, serverSnapshot);
  return (
    <Link href={inApp ? "/app" : "/"} className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden /> {inApp ? "Back to the app" : "Back to home"}
    </Link>
  );
}
