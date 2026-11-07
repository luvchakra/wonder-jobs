import type { Metadata } from "next";
import { FullLanding } from "@/components/landing/FullLanding";
import { QuietLanding } from "@/components/landing/QuietLanding";
import { loadLandingChoice } from "@/server/marketing/landing";

export const metadata: Metadata = {
  title: "WonderWorks — Your next opportunity is out there. Wonder finds it.",
  description: "WonderWorks quietly looks for what you need — work, learning, people, help and things — so your time goes to what matters.",
};

// Regenerated at most this often (owner, 2026-11-01: cut Vercel usage); saving the choice in the admin refreshes it at once.
export const revalidate = 3600;

/**
 * The landing page: the quiet one-page version (owner, 2026-11-07), or the full one kept as a backup, as an admin
 * chooses on Admin → Settings → App menus. The quiet one when the choice can't be read within 3 s.
 */
export default async function LandingPage() {
  const choice = await Promise.race([loadLandingChoice(), new Promise<"quiet">((r) => setTimeout(() => r("quiet"), 3000))]);
  return choice === "full" ? <FullLanding /> : <QuietLanding />;
}
