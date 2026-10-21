import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { PRIVATE_PAGE } from "@/lib/robots";

/** The signed-in app is never indexed or used for AI training. */
export const metadata: Metadata = PRIVATE_PAGE;

/**
 * Starts the tenant's state request while the HTML is still streaming, before
 * any application JavaScript has been parsed. `remoteStorage` picks up the
 * in-flight promise, so a first visit on a device never waits for JS + fetch
 * in sequence, and repeat visits revalidate that much sooner.
 */
const EARLY_STATE_FETCH = `if(document.cookie.indexOf("wj_demo=1")<0){window.__wjState=fetch("/api/state",{cache:"no-store",credentials:"same-origin"}).catch(function(){})}`;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: EARLY_STATE_FETCH }} />
      <AppShell>{children}</AppShell>
    </>
  );
}
