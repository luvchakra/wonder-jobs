import type { Metadata } from "next";
import { MarketingNav } from "@/components/landing/MarketingNav";
import { ParallaxHero } from "@/components/landing/ParallaxHero";
import { AgentSection, FeatureGrid, FinalCTA, JourneySection, MarketingFooter, PersonaSection, ProviderSection, SourceLogoStrip } from "@/components/landing/Sections";
import { ContactSection, ShowcaseSection } from "@/components/landing/Showcase";

export const metadata: Metadata = {
  title: "WonderJobs — Your next opportunity is out there. Wonder finds it.",
  description: "WonderJobs is your AI job-search agent. It scans the market, finds opportunities that actually fit you, and helps you take the next step — with less effort and more clarity.",
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
        <FeatureGrid />
        <ShowcaseSection />
        <PersonaSection />
        <ProviderSection />
        <FinalCTA />
        <ContactSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
