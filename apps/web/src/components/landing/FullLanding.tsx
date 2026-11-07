import { MarketingNav } from "@/components/landing/MarketingNav";
import { ParallaxHero } from "@/components/landing/ParallaxHero";
import { AgentSection, FinalCTA, JourneySection, MarketingFooter, SourceLogoStrip } from "@/components/landing/Sections";
import { ContactSection } from "@/components/landing/Showcase";
import { KindsSection } from "@/components/landing/Kinds";
import { PricingSection } from "@/components/landing/Pricing";
import { getPlansConfig } from "@/server/billing/plansConfig";
import { DEFAULT_PLANS, mergePlansConfig } from "@/domain/billing/plans";

/**
 * The full landing page, kept as a backup (owner, 2026-11-07: "keep the current landing page as backup that i can
 * activate later"): what WonderWorks is, the eight kinds, how a search becomes an application, the price, the contact
 * form. Shown at / when Admin → Settings → App menus → Landing page is set to Full (server/marketing/landing.ts).
 */
export async function FullLanding() {
  // At most 3 s (an unreachable database hung static renders and failed the production build, 2026-11-01); the
  // built-in plans otherwise.
  const { plans } = await Promise.race([getPlansConfig(), new Promise<Awaited<ReturnType<typeof getPlansConfig>>>((r) => setTimeout(() => r(mergePlansConfig(DEFAULT_PLANS)), 3000))]);
  return (
    <div className="bg-white text-ink">
      <a href="#main" className="wj-sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <MarketingNav full />
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
