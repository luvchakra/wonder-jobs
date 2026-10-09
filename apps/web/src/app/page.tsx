import type { Metadata } from "next";
import { MarketingNav } from "@/components/landing/MarketingNav";
import { ParallaxHero } from "@/components/landing/ParallaxHero";
import { AgentSection, ExtensionSection, FeatureGrid, FinalCTA, JourneySection, MarketingFooter, PersonaSection, ProviderSection, SourceLogoStrip } from "@/components/landing/Sections";
import { ContactSection, ShowcaseSection } from "@/components/landing/Showcase";
import { AskWonderSection, ControlSection } from "@/components/landing/OutcomeSections";
import { TrustSection } from "@/components/landing/TrustSection";
import { PricingSection } from "@/components/landing/Pricing";
import { getPlansConfig } from "@/server/billing/plansConfig";

export const metadata: Metadata = {
  title: "WonderJobs — Your next opportunity is out there. Wonder finds it.",
  description: "Upload your CV and see your jobs in a minute. Wonder searches real job sources — company career sites, SmartRecruiters, The Muse, Adzuna India and remote boards — shows the designation, pay and source on every listing, explains every match, builds your résumé and fills the employer's form. You review and submit. Free, Pro and Max plans; your own AI key works too.",
};

/** Prices come from the billing configuration; re-read every few minutes. */
export const revalidate = 300;

export default async function LandingPage() {
  const { plans } = await getPlansConfig();
  return (
    <div className="bg-white text-ink">
      <a href="#main" className="wj-sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <MarketingNav />
      <main id="main">
        <ParallaxHero />
        <SourceLogoStrip />
        <AgentSection />
        <JourneySection />
        <AskWonderSection />
        <FeatureGrid />
        <ShowcaseSection />
        <ControlSection />
        <PersonaSection />
        <ExtensionSection />
        <ProviderSection />
        <PricingSection plans={plans} />
        <TrustSection />
        <FinalCTA />
        <ContactSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
