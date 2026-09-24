import type { Metadata } from "next";
import { MarketingNav } from "@/components/landing/MarketingNav";
import { ParallaxHero } from "@/components/landing/ParallaxHero";
import { AgentSection, ExtensionSection, FeatureGrid, FinalCTA, JourneySection, MarketingFooter, PersonaSection, ProviderSection, SourceLogoStrip } from "@/components/landing/Sections";
import { ContactSection, ShowcaseSection } from "@/components/landing/Showcase";
import { AskWonderSection, ControlSection } from "@/components/landing/OutcomeSections";

export const metadata: Metadata = {
  title: "WonderJobs — Your next opportunity is out there. Wonder finds it.",
  description: "Tell Wonder what you're looking for in your own words. It searches real job sources, explains every match and prepares your applications — you make the final call.",
};

export default function LandingPage() {
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
        <FinalCTA />
        <ContactSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
