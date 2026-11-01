import type { Metadata } from "next";
import { MarketingNav } from "@/components/landing/MarketingNav";
import { ParallaxHero } from "@/components/landing/ParallaxHero";
import { AgentSection, FinalCTA, JourneySection, MarketingFooter, SourceLogoStrip } from "@/components/landing/Sections";
import { ContactSection } from "@/components/landing/Showcase";
import { KindsSection } from "@/components/landing/Kinds";
import { PricingSection } from "@/components/landing/Pricing";
import { getPlansConfig } from "@/server/billing/plansConfig";
import { DEFAULT_PLANS, mergePlansConfig } from "@/domain/billing/plans";

export const metadata: Metadata = {
  title: "WonderWorks — Your next opportunity is out there. Wonder finds it.",
  description: "One account for jobs, internships, teaching, hiring a pro, counsellors, co-founders, events and buying or selling. Tell Wonder what you need and see real listings in a minute — the source named on every one, every match explained. Apply with Wonder fills the employer's form and you review and submit. Free, Pro and Max plans; your own AI key works too.",
};

/** Prices come from the billing configuration; re-read every few minutes. */
// Regenerated at most this often: each regeneration is server CPU and an ISR write (owner, 2026-11-01: cut Vercel usage).
export const revalidate = 3600;

/** Page one of two: what WonderWorks is, the eight kinds, how a search becomes an application, the price. Page two is /features. */
export default async function LandingPage() {
  // At most 3 s (an unreachable database hung static renders and failed the production build, 2026-11-01); the
  // built-in plans otherwise.
  const { plans } = await Promise.race([getPlansConfig(), new Promise<Awaited<ReturnType<typeof getPlansConfig>>>((r) => setTimeout(() => r(mergePlansConfig(DEFAULT_PLANS)), 3000))]);
  return (
    <div className="bg-white text-ink">
      <a href="#main" className="wj-sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <MarketingNav />
      <main id="main">
        <ParallaxHero />
        <SourceLogoStrip />
        <KindsSection />
        <AgentSection />
        <JourneySection />
        <PricingSection plans={plans} />
        <FinalCTA />
        <ContactSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
