import type { Metadata } from "next";
import { MarketingNav } from "@/components/landing/MarketingNav";
import { MarketingFooter } from "@/components/landing/Sections";
import { ContactSection } from "@/components/landing/Showcase";

export const metadata: Metadata = { title: "Contact WonderWorks", description: "Write to the WonderWorks team: a question, feedback, a privacy request or a security report." };

/** The contact form, on its own page since the landing page became one quiet column (owner, 2026-11-07). */
export default function ContactPage() {
  return (
    <div className="bg-white text-ink">
      <MarketingNav />
      <main id="main" className="pt-16">
        <ContactSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
