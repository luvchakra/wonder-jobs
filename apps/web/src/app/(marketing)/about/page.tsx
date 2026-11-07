import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "@/components/landing/MarketingPage";

export const metadata: Metadata = { title: "About WonderWorks", description: "Why WonderWorks exists, what it will and won't do for you, and who builds it." };

/** About, written for all of WonderWorks, not only job search (owner, 2026-11-07: "make it generic"). */
export default function AboutPage() {
  return (
    <MarketingPage
      eyebrow="About"
      title="Looking for things shouldn't take over your life."
      intro="WonderWorks does the searching and the busywork, so your time goes to the choices that matter. You decide; Wonder does the legwork."
      sections={[
        {
          id: "mission",
          title: "What we're building",
          body: (
            <>
              <p>Work, learning, people, help, things to buy: finding the right one usually means the same forms, the same sites and the same guesswork, again and again. WonderWorks brings them into one place.</p>
              <p>Tell Wonder what you need. It searches real sources, removes duplicates, explains how well each one fits you, and helps with the next step: an application, a message, an RSVP. Anything only you should decide, it leaves to you.</p>
            </>
          ),
        },
        {
          id: "principles",
          title: "Principles",
          body: (
            <ul>
              <li>Real data, honestly labelled. Every listing links back to its source, and every match explains itself.</li>
              <li>You stay in control. Wonder acts only as far as you allow, and every action it takes is recorded.</li>
              <li>Your data is yours. Your keys and documents are encrypted; you can export or delete them any time.</li>
              <li>Quiet by default. Wonder speaks up when there&apos;s something worth your time.</li>
            </ul>
          ),
        },
        {
          id: "careers",
          title: "Careers",
          body: (
            <>
              <p>WonderWorks is a small team. We&apos;re not hiring right now, but we read every message. If there&apos;s something you&apos;d like to build with us, tell us what you&apos;d start with.</p>
              <p>
                <Link href="/contact" className="font-semibold text-brand-600 hover:underline">
                  Introduce yourself
                </Link>
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
