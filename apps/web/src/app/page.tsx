import type { Metadata } from "next";
import Link from "next/link";
import { WonderLogo } from "@/components/brand/WonderLogo";

export const metadata: Metadata = {
  title: "WonderWorks — Your next opportunity is out there. Wonder finds it.",
  description: "WonderWorks quietly looks for what you need — work, learning, people, help and things — so your time goes to what matters.",
};

/**
 * The landing page: one quiet page (owner, 2026-11-07: "i want the landing page of WonderWorks to be like [zenhabits.net].
 * minimum words, just few bullet points on how this application can enrich the life of its user. add basic branding
 * stuff. overall just 1 page. subtle cta. no pricing info on landing page"). One narrow column, the wordmark, a line, a
 * few bullets, a text link to begin. The detail lives on /features, /about and /help; the contact form on /contact.
 */
const WAYS = [
  "Find work that fits you — jobs, internships, teaching and part-time roles, with every match explained.",
  "Keep learning — scholarships and projects that match your level and field.",
  "Meet your people — events nearby, and co-founders who share your idea.",
  "Get help when you need it — a trusted pro for the home, or a counsellor to talk to.",
  "Buy, sell or rent, close to home.",
  "Spend less time searching. Wonder reads the sources, names each one, and leaves the choices to you.",
];

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-white text-ink">
      <header className="mx-auto flex w-full max-w-[640px] items-center justify-between px-6 pt-10">
        <WonderLogo size={26} />
        <Link href="/sign-in" className="text-[14px] text-ink-3 transition-colors hover:text-ink">
          Sign in
        </Link>
      </header>

      <main id="main" className="mx-auto w-full max-w-[640px] flex-1 px-6 pb-16 pt-20 sm:pt-28">
        <h1 className="text-[30px] font-semibold leading-[1.2] tracking-tight text-ink sm:text-[36px]">
          Your next opportunity is out there.
          <br />
          <span className="wj-gradient-text">Wonder finds it.</span>
        </h1>
        <p className="mt-6 text-[17px] leading-relaxed text-ink-2">Less time searching, more time living.</p>

        <ul className="mt-12 flex flex-col gap-5 text-[16.5px] leading-relaxed text-ink-2">
          {WAYS.map((w) => (
            <li key={w} className="flex gap-4">
              <span className="mt-[0.7em] size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
              <span>{w}</span>
            </li>
          ))}
        </ul>

        {/* The one call to action, kept quiet: a link, not a banner. */}
        <p className="mt-14 text-[16.5px]">
          <Link href="/sign-up" className="font-medium text-brand-600 underline decoration-brand-200 underline-offset-[6px] transition-colors hover:decoration-brand-600">
            Get started →
          </Link>
        </p>
      </main>

      <footer className="mx-auto w-full max-w-[640px] px-6 pb-10 text-[13px] text-ink-4">
        <nav aria-label="More" className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-6">
          {[
            ["/features", "Features"],
            ["/about", "About"],
            ["/help", "Help"],
            ["/contact", "Contact"],
            ["/privacy", "Privacy"],
            ["/terms", "Terms"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="hover:text-ink">
              {label}
            </Link>
          ))}
        </nav>
        <p className="mt-4">© {new Date().getFullYear()} WonderWorks</p>
      </footer>
    </div>
  );
}
