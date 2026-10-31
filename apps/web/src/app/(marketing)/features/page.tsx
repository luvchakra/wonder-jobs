import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MarketingNav } from "@/components/landing/MarketingNav";
import { ExtensionSection, FeatureGrid, FinalCTA, MarketingFooter, ProviderSection } from "@/components/landing/Sections";
import { ShowcaseSection } from "@/components/landing/Showcase";
import { ControlSection } from "@/components/landing/OutcomeSections";
import { KindFeatures, PostingSection, SameEverywhere } from "@/components/landing/Kinds";
import { TrustSection } from "@/components/landing/TrustSection";

export const metadata: Metadata = {
  title: "Features",
  description: "Everything WonderWorks does, kind by kind: jobs, internships, teaching, talent and services, therapists, co-founders, events and a marketplace — what you can do in each, how it is tracked, and what is the same everywhere.",
};

/** Page two of two: every feature, stated plainly. Page one is the home page. */
export default function FeaturesPage() {
  return (
    <div className="bg-white text-ink">
      <MarketingNav />
      <main id="main">
        <header className="mx-auto max-w-7xl px-4 pb-4 pt-28 sm:px-6 md:pt-36">
          <Link href="/" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden /> Home
          </Link>
          <p className="wj-eyebrow mt-4 text-brand-700">Features</p>
          <h1 className="mt-3 max-w-3xl text-display font-semibold text-ink">
            Everything WonderWorks does, <span className="wj-gradient-text">plainly.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-2">Eight kinds of things to find, one way of using them. Real listings from real sources, the source named every time, and you decide what happens next.</p>
        </header>
        <KindFeatures />
        <SameEverywhere />
        <FeatureGrid />
        <ControlSection />
        <ExtensionSection />
        <ShowcaseSection />
        <ProviderSection />
        <PostingSection />
        <TrustSection />
        <FinalCTA />
      </main>
      <MarketingFooter />
    </div>
  );
}
