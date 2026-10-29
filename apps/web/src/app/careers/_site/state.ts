import type { Result } from "@/server/careerSite/client";
import { currentAdmin } from "@/server/jobslake/access";

/** What a visitor sees when WonderJobs' own careers page can't load, and the reason shown to admins only. */
export async function unavailableState(r: Exclude<Result<unknown>, { state: "ok" }>, opts: { forAdmins?: boolean } = {}): Promise<{ title: string; body?: string; adminReason: string | null; retry: boolean }> {
  // Reading the session makes a page dynamic, so only /careers (already dynamic) looks for an admin.
  const admin = opts.forAdmins ? await currentAdmin().catch(() => null) : null;
  if (r.state === "needs_setup" || r.state === "unauthorized")
    return {
      title: "Careers isn't set up yet",
      body: "Please check back soon.",
      retry: false,
      adminReason: admin ? (r.state === "needs_setup" ? "No career-site key is saved. Paste it in WonderStar Admin → Careers." : "WonderStar refused the saved career-site key (401). It may be revoked; save a new one in WonderStar Admin → Careers.") : null,
    };
  return {
    title: "Careers is unavailable right now",
    body: r.state === "busy" ? "We're busy right now. Please try again shortly." : "We couldn't load the open positions. Please try again later.",
    retry: true,
    adminReason: admin ? `The careers API answered ${r.state === "busy" ? "429 (busy)" : "with an error or didn't answer in time"}.` : null,
  };
}
